"""Dashboard stats and recap schemas (V2)."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, model_validator

from app.models.application import ApplicationStatus
from app.services.ranges import (
    CUSTOM_MAX_DAYS,
    CUSTOM_MIN_DAYS,
    custom_span_days,
)

# R6.1 — one range set, shared by /dashboard/stats and /dashboard/recap. V1's
# separate `RecapRangeParam` ("week"|"month") is gone; the recap takes the same
# five values as stats.
RangeParam = Literal["week", "month", "year", "all", "custom"]


class RangeQuery(BaseModel):
    """Query parameters shared by both dashboard endpoints (R6.1/R6.2).

    Cross-field validation lives here rather than in the route so a bad custom
    range is a pydantic `422` — the same failure mode as any other malformed
    query parameter — instead of a hand-rolled `400`.

    Extra query parameters are deliberately *not* forbidden: this is a GET, and
    rejecting an unrelated cache-busting or analytics parameter would be a
    surprising 422.
    """

    range: RangeParam = "all"
    start: date | None = None
    end: date | None = None

    @model_validator(mode="after")
    def _validate_custom_bounds(self) -> "RangeQuery":
        if self.range != "custom":
            # `start`/`end` are meaningless for the preset windows and are
            # ignored rather than rejected.
            return self
        if self.start is None or self.end is None:
            raise ValueError(
                "`start` and `end` are both required when range=custom."
            )
        if self.start > self.end:
            raise ValueError("`start` must be on or before `end`.")
        span = custom_span_days(self.start, self.end)
        if not CUSTOM_MIN_DAYS <= span <= CUSTOM_MAX_DAYS:
            raise ValueError(
                f"A custom range must span between {CUSTOM_MIN_DAYS} and "
                f"{CUSTOM_MAX_DAYS} days inclusive (got {span})."
            )
        return self


class RecapRangeQuery(RangeQuery):
    """Same contract as `RangeQuery`; the recap just defaults to the week."""

    range: RangeParam = "week"


class StatusBreakdownItem(BaseModel):
    status: ApplicationStatus
    count: int
    percentage: float  # 0..100, of the total in range


class TimeSeriesPoint(BaseModel):
    period: str          # ISO date (day) or "YYYY-MM" (month)
    count: int           # applications applied in this bucket


class SankeyNode(BaseModel):
    key: str             # the ApplicationStatus value the node represents
    label: str           # display label, fixed by the PRD (R1.3)
    value: int           # inflow to this node


class SankeyLink(BaseModel):
    source: str          # node key
    target: str          # node key
    value: int           # always > 0; zero-valued links are omitted


class Sankey(BaseModel):
    """R5.5 — explicit nodes and links; the frontend never re-derives topology.

    All six nodes are always present (value 0 when empty) so the renderer has
    exactly one shape to handle. Links carrying no flow are omitted, which makes
    the `total = 0` case (R5.6) fall out naturally as six zero nodes and an
    empty `links` list.

    R5.4: rows still sitting in `applied` or `interviewing_oa` flow nowhere. A
    node's outgoing links legitimately sum to less than its value and no
    synthetic "pending" node or balancing link is fabricated.
    """

    nodes: list[SankeyNode]
    links: list[SankeyLink]


class DashboardStats(BaseModel):
    range: RangeParam
    total: int
    status_breakdown: list[StatusBreakdownItem]
    applications_over_time: list[TimeSeriesPoint]
    time_series_granularity: Literal["day", "week", "month"]
    response_rate: float          # % of submitted that got any response
    ghost_rate: float             # % of submitted that went ghosted
    # R4.4 — replaces V1's `rejection_rate` outright (hard cutover, no alias).
    rejection_fail_rate: float    # % of submitted that were rejected OR failed
    avg_time_to_response_days: float | None  # null if no responses yet
    sankey: Sankey


class RecapHighlight(BaseModel):
    label: str
    value: str


class DashboardRecap(BaseModel):
    """Client-side-render payload (see docs/decisions/recap-image-approach.md).
    The frontend renders this into a transparent Stories-aspect image."""

    range: RangeParam
    period_label: str            # R6.3 — e.g. "This week" / "Jan 1 – Mar 15, 2026"
    period_start: date
    period_end: date
    total_applications: int
    headline: str                # one punchy summary line
    highlights: list[RecapHighlight]
    status_breakdown: list[StatusBreakdownItem]
    sankey: Sankey
