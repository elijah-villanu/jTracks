"""B22/B23 — the analytics range window, shared by /dashboard/stats and /dashboard/recap.

PRD V2 R6. Both endpoints accept an identical range set — `week | month | year |
all | custom` — so this module owns window resolution, bucketing granularity and
the human-readable period label in one place rather than each endpoint carrying
its own `_period()` helper (which is how V1's recap ended up supporting only
`week|month`).

> Every boundary here is computed in UTC via `app/core/clock.py`. There is
> deliberately no `date.today()` / `datetime.now()` in this module: the window
> edges are compared against `date_applied`, a plain UTC date column, and a
> local-calendar "today" puts the boundary a day out on any non-UTC host
> (PRD R6.5 / R2.4).

Deviation from R6.4's proposal, which the PRD explicitly permits ("backend may
adjust, but `time_series_granularity` must always state which was used"):
`year` is a trailing **12 calendar months** (first of the month, eleven months
back, through today) rather than a trailing 365 days. R6.4 asks for both "last
365 days" *and* "exactly 12 points", which cannot both hold — 365 days always
straddles 13 calendar months, so the oldest partial month's applications would
be counted in `total` but have no bucket to land in. Aligning the window to the
month boundary makes the series sum to `total` and yields exactly 12 points.
It is also consistent with how `week`/`month` already behave: a rolling window
labelled "This week"/"This month", not a calendar-to-date one.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from app.core.clock import utc_today

Granularity = Literal["day", "month"]

# R6.2 — inclusive day count bounds for a custom range. 366 accommodates a full
# leap year.
CUSTOM_MIN_DAYS = 1
CUSTOM_MAX_DAYS = 366

# R6.4 — a custom span at or under this many days is bucketed daily.
CUSTOM_DAILY_MAX_SPAN_DAYS = 92

_MONTH_KEY = "%Y-%m"


@dataclass(frozen=True)
class ResolvedRange:
    """A concrete window plus how to bucket and label it."""

    range: str
    # Inclusive lower bound on `date_applied`. None means unbounded ("all").
    start: date | None
    # Inclusive upper bound on `date_applied`.
    end: date
    granularity: Granularity
    label: str
    # True for every range except "all", which zero-fills nothing because it has
    # no lower bound to fill from.
    zero_fill: bool


def month_key(d: date) -> str:
    return d.strftime(_MONTH_KEY)


def first_of_month(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, n: int) -> date:
    """Shift a first-of-month date by `n` months (n may be negative)."""
    total = (d.year * 12 + (d.month - 1)) + n
    return date(total // 12, total % 12 + 1, 1)


def custom_span_days(start: date, end: date) -> int:
    """Inclusive day count, the figure R6.2's 1–366 bound applies to."""
    return (end - start).days + 1


def format_custom_label(start: date, end: date) -> str:
    """R6.3 — e.g. "Jan 1 – Mar 15, 2026" (or spelled out on both sides when the
    range crosses a year boundary). Built by hand rather than with `%-d`/`%#d`,
    whose day-padding flag differs between glibc and the Windows CRT."""
    left = f"{start.strftime('%b')} {start.day}"
    right = f"{end.strftime('%b')} {end.day}, {end.year}"
    if start.year != end.year:
        left = f"{left}, {start.year}"
    return f"{left} – {right}"


def resolve_range(
    range_: str,
    *,
    start: date | None = None,
    end: date | None = None,
    today: date | None = None,
) -> ResolvedRange:
    """Turn a validated query into a concrete window.

    Cross-field validation of a custom range (both bounds present, ordered, and
    within 1–366 inclusive days) belongs to the request schema so it surfaces as
    a pydantic `422`; see `app/schemas/dashboard.RangeQuery`. This function
    assumes it has already passed and asserts rather than re-reporting.
    """
    today = today or utc_today()

    if range_ == "week":
        # Last 7 days inclusive -> 7 daily points.
        return ResolvedRange(
            range="week",
            start=today - timedelta(days=6),
            end=today,
            granularity="day",
            label="This week",
            zero_fill=True,
        )

    if range_ == "month":
        # Last 30 days inclusive -> 30 daily points.
        return ResolvedRange(
            range="month",
            start=today - timedelta(days=29),
            end=today,
            granularity="day",
            label="This month",
            zero_fill=True,
        )

    if range_ == "year":
        # Trailing 12 calendar months -> exactly 12 monthly points (see the
        # module docstring for why this isn't a flat 365 days).
        return ResolvedRange(
            range="year",
            start=add_months(first_of_month(today), -11),
            end=today,
            granularity="month",
            label="This year",
            zero_fill=True,
        )

    if range_ == "all":
        return ResolvedRange(
            range="all",
            start=None,
            end=today,
            granularity="month",
            label="All time",
            zero_fill=False,
        )

    if range_ == "custom":
        assert start is not None and end is not None, (
            "custom range reached resolve_range() without both bounds; "
            "RangeQuery should have rejected it with a 422"
        )
        span = custom_span_days(start, end)
        granularity: Granularity = (
            "day" if span <= CUSTOM_DAILY_MAX_SPAN_DAYS else "month"
        )
        return ResolvedRange(
            range="custom",
            start=start,
            end=end,
            granularity=granularity,
            label=format_custom_label(start, end),
            zero_fill=True,
        )

    raise ValueError(f"Unknown range '{range_}'.")


def iter_buckets(rr: ResolvedRange) -> list[str]:
    """The zero-filled bucket keys for a window, in order.

    Empty for `all`, which only reports months that actually have data.
    """
    if not rr.zero_fill or rr.start is None:
        return []
    if rr.granularity == "day":
        out: list[str] = []
        cur = rr.start
        while cur <= rr.end:
            out.append(cur.isoformat())
            cur += timedelta(days=1)
        return out
    out = []
    cur = first_of_month(rr.start)
    last = first_of_month(rr.end)
    while cur <= last:
        out.append(month_key(cur))
        cur = add_months(cur, 1)
    return out
