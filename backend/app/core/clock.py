"""Single source of "now" for the application.

Stored timestamps (`created_at` / `updated_at`) come from the database's
`now()`, which is UTC on both backends: Postgres stores `timestamptz` in UTC,
and SQLite's `CURRENT_TIMESTAMP` is UTC by definition.

The date columns (`date_saved`, `date_applied`) and every "today" the services
derive used to come from `date.today()`, which reads the *server's local*
calendar. On any host that isn't UTC the two disagree by up to a day, and the
dashboard compares them directly: `avg_time_to_response_days` is
`updated_at.date() - date_applied`, so on a host behind UTC every response time
came out one day high. The daily ghosting scan and the dashboard/recap windows
had the same off-by-one at the boundary.

Everything that needs the current date goes through `utc_today()`, and anything
converting a stored timestamp to a date goes through `to_utc_date()`, so both
sides of that subtraction are on the same calendar.
"""
from __future__ import annotations

from datetime import date, datetime, timezone


def utc_now() -> datetime:
    """Timezone-aware current instant in UTC."""
    return datetime.now(timezone.utc)


def utc_today() -> date:
    """Today's date in UTC — the calendar the stored timestamps are on."""
    return utc_now().date()


def to_utc_date(ts: datetime) -> date:
    """Calendar date of a stored timestamp, in UTC.

    Naive values are assumed to already be UTC: that is what SQLite hands back,
    since it has no timezone type and `func.now()` wrote UTC. Aware values are
    converted, because psycopg returns `timestamptz` in the *session* timezone,
    which is not guaranteed to be UTC.
    """
    if ts.tzinfo is None:
        return ts.date()
    return ts.astimezone(timezone.utc).date()
