"""Dashboard stats and recap schemas."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.models.application import ApplicationStatus

RangeParam = Literal["week", "month", "all"]
RecapRangeParam = Literal["week", "month"]


class StatusBreakdownItem(BaseModel):
    status: ApplicationStatus
    count: int
    percentage: float  # 0..100, of the total in range


class TimeSeriesPoint(BaseModel):
    period: str          # ISO date (day) or period label
    count: int           # applications applied in this bucket


class DashboardStats(BaseModel):
    range: RangeParam
    total: int
    status_breakdown: list[StatusBreakdownItem]
    applications_over_time: list[TimeSeriesPoint]
    time_series_granularity: Literal["day", "week", "month"]
    response_rate: float          # % of applied that got any response
    ghost_rate: float             # % of applied that went ghosted
    rejection_rate: float         # % of applied that were rejected
    avg_time_to_response_days: float | None  # null if no responses yet


class RecapHighlight(BaseModel):
    label: str
    value: str


class DashboardRecap(BaseModel):
    """Client-side-render payload (see docs/decisions/recap-image-approach.md).
    The frontend (F8) renders this into a transparent Stories-aspect image."""

    range: RecapRangeParam
    period_label: str            # e.g. "This week" / "Jul 15 – Jul 22"
    period_start: date
    period_end: date
    total_applications: int
    headline: str                # one punchy summary line
    highlights: list[RecapHighlight]
    status_breakdown: list[StatusBreakdownItem]
