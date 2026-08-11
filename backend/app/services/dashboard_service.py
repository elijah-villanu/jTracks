"""B14 — dashboard stats computation.

Scope: the dashboard is about *submitted* applications (status advanced past
`saved`, i.e. rows with a `date_applied`). `saved` rows are "still considering"
and are excluded from the funnel/rates, matching the PRD's dashboard spec which
enumerates Applied/Interviewing/Offer/Rejected/Ghosted.

Definitions:
  * responded  = interviewing | offer | rejected (they replied — a rejection is
                 still a response); ghosted = no response; applied = still waiting.
  * response_rate  = responded / submitted
  * ghost_rate     = ghosted   / submitted
  * rejection_rate = rejected  / submitted
  * avg_time_to_response = mean(updated_at - date_applied) over responded rows,
    both read as UTC calendar dates (see app/core/clock.py). NOTE: we don't
    persist per-status-change history, so `updated_at` is a documented proxy for
    "first status change away from Applied".
"""
from __future__ import annotations

import uuid
from collections import Counter
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import to_utc_date, utc_today
from app.models.application import Application, ApplicationStatus
from app.schemas.dashboard import (
    DashboardStats,
    StatusBreakdownItem,
    TimeSeriesPoint,
)

# Statuses shown in the dashboard breakdown (excludes `saved`).
_FUNNEL_STATUSES = [
    ApplicationStatus.APPLIED,
    ApplicationStatus.INTERVIEWING,
    ApplicationStatus.OFFER,
    ApplicationStatus.REJECTED,
    ApplicationStatus.GHOSTED,
]
_RESPONDED = {
    ApplicationStatus.INTERVIEWING,
    ApplicationStatus.OFFER,
    ApplicationStatus.REJECTED,
}


def _window_start(range_: str, today: date) -> date | None:
    if range_ == "week":
        return today - timedelta(days=6)
    if range_ == "month":
        return today - timedelta(days=29)
    return None  # "all"


def _pct(part: int, whole: int) -> float:
    return round((part / whole) * 100, 1) if whole else 0.0


def _fetch_submitted(
    db: Session, user_id: uuid.UUID, start: date | None
) -> list[Application]:
    stmt = select(Application).where(
        Application.user_id == user_id,
        Application.date_applied.is_not(None),
    )
    if start is not None:
        stmt = stmt.where(Application.date_applied >= start)
    return list(db.scalars(stmt).all())


def _time_series(
    apps: list[Application], range_: str, start: date | None, today: date
) -> tuple[list[TimeSeriesPoint], str]:
    if range_ == "all":
        # Monthly buckets across the observed span.
        buckets: Counter[str] = Counter()
        for a in apps:
            buckets[a.date_applied.strftime("%Y-%m")] += 1
        points = [
            TimeSeriesPoint(period=k, count=v) for k, v in sorted(buckets.items())
        ]
        return points, "month"

    # week / month -> daily buckets, zero-filled across the whole window.
    assert start is not None
    day_counts: Counter[date] = Counter(a.date_applied for a in apps)
    points = []
    cur = start
    while cur <= today:
        points.append(
            TimeSeriesPoint(period=cur.isoformat(), count=day_counts.get(cur, 0))
        )
        cur += timedelta(days=1)
    return points, "day"


def compute_stats(
    db: Session,
    user_id: uuid.UUID,
    range_: str = "all",
    today: date | None = None,
) -> DashboardStats:
    today = today or utc_today()
    start = _window_start(range_, today)
    apps = _fetch_submitted(db, user_id, start)
    total = len(apps)

    counts = Counter(a.status for a in apps)
    breakdown = [
        StatusBreakdownItem(
            status=s, count=counts.get(s, 0), percentage=_pct(counts.get(s, 0), total)
        )
        for s in _FUNNEL_STATUSES
    ]

    responded = sum(counts.get(s, 0) for s in _RESPONDED)
    ghosted = counts.get(ApplicationStatus.GHOSTED, 0)
    rejected = counts.get(ApplicationStatus.REJECTED, 0)

    # `to_utc_date`, not `.date()`: `updated_at` is a timestamptz that psycopg
    # hands back in the *session* timezone, while `date_applied` is a plain UTC
    # date. Subtracting the two across a timezone boundary skewed every response
    # time by a day.
    response_times = [
        (to_utc_date(a.updated_at) - a.date_applied).days
        for a in apps
        if a.status in _RESPONDED and a.updated_at is not None
    ]
    response_times = [d for d in response_times if d >= 0]
    avg_ttr = round(sum(response_times) / len(response_times), 1) if response_times else None

    series, granularity = _time_series(apps, range_, start, today)

    return DashboardStats(
        range=range_,  # type: ignore[arg-type]
        total=total,
        status_breakdown=breakdown,
        applications_over_time=series,
        time_series_granularity=granularity,  # type: ignore[arg-type]
        response_rate=_pct(responded, total),
        ghost_rate=_pct(ghosted, total),
        rejection_rate=_pct(rejected, total),
        avg_time_to_response_days=avg_ttr,
    )
