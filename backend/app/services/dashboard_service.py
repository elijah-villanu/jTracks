"""B14/B21/B22/B24 — dashboard stats computation.

Scope: the dashboard is about *submitted* applications (rows with a
`date_applied`). `saved` rows are "still considering" and are excluded from the
funnel, the rates and the Sankey (PRD R4, and R5's "submitted applications only"
assumption). Deleted rows are hard-deleted, so they are invisible here too.

V2 definitions (PRD R4):
  * responded            = interviewing_oa | offer | rejected | failed — i.e.
                           everything that left `applied` other than by ghosting.
  * response_rate        = responded / submitted
  * ghost_rate           = ghosted / submitted
  * rejection_fail_rate  = (rejected + failed) / submitted   [renamed from V1's
                           `rejection_rate`; the old field is gone outright]
  * interviews (recap)   = interviewing_oa + offer + failed — `offer` and
                           `failed` necessarily passed through the interview
                           stage (R4.5).
  * avg_time_to_response = mean(updated_at - date_applied) over responded rows,
    both read as UTC calendar dates (see app/core/clock.py).

    NOTE (R4.6, unchanged in V2): we do not persist per-status-change history,
    so `updated_at` is a documented *proxy* for "first status change away from
    Applied" and is disturbed by any later edit to the row. Fixing it needs a
    status-event log, which V2 explicitly declined.

Structure note (performance NFR / B24): `year` and `all` scan more rows than any
V1 query did, so the range's submitted rows are read **once** into a
`SubmittedAggregate`, and the breakdown, the rates, the time series and the
Sankey are all pure projections of that single pass. Nothing below issues a
second query.
"""
from __future__ import annotations

import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import to_utc_date, utc_today
from app.models.application import Application
from app.models.application import ApplicationStatus as S
from app.schemas.dashboard import (
    DashboardStats,
    Sankey,
    SankeyLink,
    SankeyNode,
    StatusBreakdownItem,
    TimeSeriesPoint,
)
from app.services.ranges import ResolvedRange, iter_buckets, month_key, resolve_range

# R4.1 — the breakdown is exactly these 6 statuses, in this order, always,
# including zero counts. (`saved` is excluded: it is never "submitted".)
FUNNEL_STATUSES: list[S] = [
    S.APPLIED,
    S.INTERVIEWING_OA,
    S.OFFER,
    S.REJECTED,
    S.FAILED,
    S.GHOSTED,
]

# R4.2 — everything that left `applied` other than by ghosting is a response.
# Kept deliberately in sync with `response_rate`: `avg_time_to_response_days`
# must average over the same population the rate describes.
_RESPONDED: frozenset[S] = frozenset(
    {S.INTERVIEWING_OA, S.OFFER, S.REJECTED, S.FAILED}
)

# R1.3 display labels, fixed by the PRD. "Failed Interview/OA" is deliberately
# verbose and must not be shortened — it is the primary mitigation for the
# mislabeling risk in the status-only analytics model.
SANKEY_LABELS: dict[S, str] = {
    S.APPLIED: "Applied",
    S.INTERVIEWING_OA: "Interviewing / OA",
    S.REJECTED: "Rejected",
    S.GHOSTED: "Ghosted",
    S.OFFER: "Offer",
    S.FAILED: "Failed Interview/OA",
}

# Node order in the payload: level 1, then level 2 and its terminal siblings,
# then level 3. Matches the PRD's example payload.
_SANKEY_NODE_ORDER: list[S] = [
    S.APPLIED,
    S.INTERVIEWING_OA,
    S.REJECTED,
    S.GHOSTED,
    S.OFFER,
    S.FAILED,
]


@dataclass
class SubmittedAggregate:
    """Everything the dashboard needs, from one pass over the range's rows."""

    total: int = 0
    counts: Counter = field(default_factory=Counter)
    day_counts: Counter = field(default_factory=Counter)
    month_counts: Counter = field(default_factory=Counter)
    response_times: list[int] = field(default_factory=list)
    earliest_applied: date | None = None
    latest_applied: date | None = None

    def count(self, s: S) -> int:
        return self.counts.get(s, 0)

    @property
    def responded(self) -> int:
        return sum(self.counts.get(s, 0) for s in _RESPONDED)

    @property
    def interviews(self) -> int:
        """R4.5 — rows that reached the interview/OA stage at some point."""
        return (
            self.count(S.INTERVIEWING_OA) + self.count(S.OFFER) + self.count(S.FAILED)
        )


def _pct(part: int, whole: int) -> float:
    return round((part / whole) * 100, 1) if whole else 0.0


def _fetch_submitted(
    db: Session, user_id: uuid.UUID, rr: ResolvedRange
) -> list[Application]:
    """The single query. Scoped to the user (B4) and to submitted rows."""
    stmt = select(Application).where(
        Application.user_id == user_id,
        Application.date_applied.is_not(None),
    )
    if rr.start is not None:
        stmt = stmt.where(Application.date_applied >= rr.start)
    # `all` has no lower bound but still has an upper one: a custom range can
    # end in the past, and `date_applied` may legitimately sit in the future if
    # the user forward-dated it.
    stmt = stmt.where(Application.date_applied <= rr.end)
    return list(db.scalars(stmt).all())


def collect(db: Session, user_id: uuid.UUID, rr: ResolvedRange) -> SubmittedAggregate:
    """One query, one pass. Every dashboard figure is a projection of this."""
    agg = SubmittedAggregate()
    for a in _fetch_submitted(db, user_id, rr):
        applied_on: date = a.date_applied
        agg.total += 1
        agg.counts[a.status] += 1
        agg.day_counts[applied_on.isoformat()] += 1
        agg.month_counts[month_key(applied_on)] += 1

        if agg.earliest_applied is None or applied_on < agg.earliest_applied:
            agg.earliest_applied = applied_on
        if agg.latest_applied is None or applied_on > agg.latest_applied:
            agg.latest_applied = applied_on

        if a.status in _RESPONDED and a.updated_at is not None:
            # `to_utc_date`, not `.date()`: `updated_at` is a timestamptz that
            # psycopg hands back in the *session* timezone, while `date_applied`
            # is a plain UTC date. Subtracting the two across a timezone
            # boundary skewed every response time by a day.
            days = (to_utc_date(a.updated_at) - applied_on).days
            if days >= 0:
                agg.response_times.append(days)
    return agg


def build_status_breakdown(agg: SubmittedAggregate) -> list[StatusBreakdownItem]:
    return [
        StatusBreakdownItem(
            status=s, count=agg.count(s), percentage=_pct(agg.count(s), agg.total)
        )
        for s in FUNNEL_STATUSES
    ]


def build_time_series(
    agg: SubmittedAggregate, rr: ResolvedRange
) -> list[TimeSeriesPoint]:
    source = agg.day_counts if rr.granularity == "day" else agg.month_counts
    if rr.zero_fill:
        return [
            TimeSeriesPoint(period=k, count=source.get(k, 0)) for k in iter_buckets(rr)
        ]
    # `all`: unbounded, so there is nothing to zero-fill *from* — report only the
    # months that actually have data (unchanged from V1).
    return [TimeSeriesPoint(period=k, count=v) for k, v in sorted(source.items())]


def build_sankey(agg: SubmittedAggregate) -> Sankey:
    """R5.3 — derived purely from the current-status counts already collected.

    A node's `value` is its *inflow*: every submitted row entered `Applied`, and
    every row now in `offer` or `failed` must have passed through
    `interviewing_oa` on the way. Terminal nodes equal their own status count.
    """
    interviewing_inflow = agg.interviews
    values: dict[S, int] = {
        S.APPLIED: agg.total,
        S.INTERVIEWING_OA: interviewing_inflow,
        S.REJECTED: agg.count(S.REJECTED),
        S.GHOSTED: agg.count(S.GHOSTED),
        S.OFFER: agg.count(S.OFFER),
        S.FAILED: agg.count(S.FAILED),
    }
    nodes = [
        SankeyNode(key=s.value, label=SANKEY_LABELS[s], value=values[s])
        for s in _SANKEY_NODE_ORDER
    ]

    candidates = [
        (S.APPLIED, S.INTERVIEWING_OA, interviewing_inflow),
        (S.APPLIED, S.REJECTED, agg.count(S.REJECTED)),
        (S.APPLIED, S.GHOSTED, agg.count(S.GHOSTED)),
        (S.INTERVIEWING_OA, S.OFFER, agg.count(S.OFFER)),
        (S.INTERVIEWING_OA, S.FAILED, agg.count(S.FAILED)),
    ]
    # Zero-flow links are omitted. That makes `total = 0` and "everything is
    # still sitting in applied" both come out as six zero-valued nodes and an
    # empty `links` list (R5.6) with no special case, and spares the renderer a
    # zero-width ribbon. Rows still in `applied` or `interviewing_oa` are simply
    # never given an edge (R5.4) — a node's outflow legitimately sums to less
    # than its value, and nothing here fabricates a link to balance it.
    links = [
        SankeyLink(source=src.value, target=dst.value, value=v)
        for src, dst, v in candidates
        if v > 0
    ]
    return Sankey(nodes=nodes, links=links)


def build_stats(agg: SubmittedAggregate, rr: ResolvedRange) -> DashboardStats:
    avg_ttr = (
        round(sum(agg.response_times) / len(agg.response_times), 1)
        if agg.response_times
        else None
    )
    return DashboardStats(
        range=rr.range,  # type: ignore[arg-type]
        total=agg.total,
        status_breakdown=build_status_breakdown(agg),
        applications_over_time=build_time_series(agg, rr),
        time_series_granularity=rr.granularity,
        response_rate=_pct(agg.responded, agg.total),
        ghost_rate=_pct(agg.count(S.GHOSTED), agg.total),
        rejection_fail_rate=_pct(
            agg.count(S.REJECTED) + agg.count(S.FAILED), agg.total
        ),
        avg_time_to_response_days=avg_ttr,
        sankey=build_sankey(agg),
    )


def compute_stats(
    db: Session,
    user_id: uuid.UUID,
    range_: str = "all",
    start: date | None = None,
    end: date | None = None,
    today: date | None = None,
) -> DashboardStats:
    rr = resolve_range(range_, start=start, end=end, today=today or utc_today())
    return build_stats(collect(db, user_id, rr), rr)
