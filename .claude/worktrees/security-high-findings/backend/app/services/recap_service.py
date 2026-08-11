"""B16 — recap payload (client-side render; see decisions/recap-image-approach.md).

Returns a JSON payload the frontend (F8) renders into a transparent, Stories-
aspect image. Reuses B14's computation and adds period framing plus a few
human-readable highlight lines tuned for the recap card.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.application import ApplicationStatus
from app.schemas.dashboard import DashboardRecap, RecapHighlight
from app.services.dashboard_service import compute_stats


def _period(range_: str, today: date) -> tuple[date, date, str]:
    if range_ == "week":
        start = today - timedelta(days=6)
        return start, today, "This week"
    start = today - timedelta(days=29)
    return start, today, "This month"


def compute_recap(
    db: Session,
    user_id: uuid.UUID,
    range_: str = "week",
    today: date | None = None,
) -> DashboardRecap:
    today = today or date.today()
    start, end, label = _period(range_, today)
    stats = compute_stats(db, user_id, range_=range_, today=today)

    by_status = {item.status: item for item in stats.status_breakdown}

    def count(s: ApplicationStatus) -> int:
        item = by_status.get(s)
        return item.count if item else 0

    offers = count(ApplicationStatus.OFFER)
    interviews = count(ApplicationStatus.INTERVIEWING) + offers

    if stats.total == 0:
        headline = "No applications yet this period — go get 'em."
    elif offers > 0:
        headline = f"{stats.total} applications, {offers} offer{'s' if offers != 1 else ''}!"
    else:
        headline = f"{stats.total} applications sent {label.lower()}."

    highlights = [
        RecapHighlight(label="Applications", value=str(stats.total)),
        RecapHighlight(label="Interviews", value=str(interviews)),
        RecapHighlight(label="Offers", value=str(offers)),
        RecapHighlight(label="Response rate", value=f"{stats.response_rate:.0f}%"),
        RecapHighlight(label="Ghost rate", value=f"{stats.ghost_rate:.0f}%"),
    ]
    if stats.avg_time_to_response_days is not None:
        highlights.append(
            RecapHighlight(
                label="Avg. reply time",
                value=f"{stats.avg_time_to_response_days:.0f} days",
            )
        )

    return DashboardRecap(
        range=range_,  # type: ignore[arg-type]
        period_label=label,
        period_start=start,
        period_end=end,
        total_applications=stats.total,
        headline=headline,
        highlights=highlights,
        status_breakdown=stats.status_breakdown,
    )
