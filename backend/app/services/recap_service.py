"""B16/B23 — recap payload (client-side render; see decisions/recap-image-approach.md).

Returns a JSON payload the frontend renders into a transparent, Stories-aspect
image. Reuses the dashboard's single aggregate pass and adds period framing plus
a few human-readable highlight lines tuned for the recap card.

V2 changes:
  * The recap takes the **same** five ranges as `/dashboard/stats` (R6.1). V1's
    private `_period()` helper and `RecapRangeParam` are gone; window resolution
    and the period label both come from `app/services/ranges.py`.
  * "Interviews" is `interviewing_oa + offer + failed` (R4.5).
  * A "Rejection/fail rate" highlight joins the existing tiles — R5.1 is
    explicit that every V1 highlight survives and the Sankey is additive.
"""
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.clock import utc_today
from app.models.application import ApplicationStatus as S
from app.schemas.dashboard import DashboardRecap, RecapHighlight
from app.services.dashboard_service import build_stats, collect
from app.services.ranges import resolve_range


def compute_recap(
    db: Session,
    user_id: uuid.UUID,
    range_: str = "week",
    start: date | None = None,
    end: date | None = None,
    today: date | None = None,
) -> DashboardRecap:
    today = today or utc_today()
    rr = resolve_range(range_, start=start, end=end, today=today)

    # Same single pass the stats endpoint uses — the recap adds framing, not
    # another set of queries.
    agg = collect(db, user_id, rr)
    stats = build_stats(agg, rr)

    offers = agg.count(S.OFFER)
    interviews = agg.interviews

    # `all` has no lower bound, so its "start" is the first application the user
    # ever submitted; with nothing submitted at all, collapse to a single day so
    # the payload still carries a real, ordered pair of dates.
    period_start = rr.start if rr.start is not None else agg.earliest_applied
    if period_start is None:
        period_start = rr.end

    if stats.total == 0:
        headline = "No applications yet this period — go get 'em."
    elif offers > 0:
        headline = (
            f"{stats.total} applications, {offers} offer{'s' if offers != 1 else ''}!"
        )
    else:
        headline = f"{stats.total} applications sent {rr.label.lower()}."

    highlights = [
        RecapHighlight(label="Applications", value=str(stats.total)),
        RecapHighlight(label="Interviews", value=str(interviews)),
        RecapHighlight(label="Offers", value=str(offers)),
        RecapHighlight(label="Response rate", value=f"{stats.response_rate:.0f}%"),
        RecapHighlight(label="Ghost rate", value=f"{stats.ghost_rate:.0f}%"),
        RecapHighlight(
            label="Rejection/fail rate", value=f"{stats.rejection_fail_rate:.0f}%"
        ),
    ]
    if stats.avg_time_to_response_days is not None:
        highlights.append(
            RecapHighlight(
                label="Avg. reply time",
                value=f"{stats.avg_time_to_response_days:.0f} days",
            )
        )

    return DashboardRecap(
        range=rr.range,  # type: ignore[arg-type]
        period_label=rr.label,
        period_start=period_start,
        period_end=rr.end,
        total_applications=stats.total,
        headline=headline,
        highlights=highlights,
        status_breakdown=stats.status_breakdown,
        sankey=stats.sankey,
    )
