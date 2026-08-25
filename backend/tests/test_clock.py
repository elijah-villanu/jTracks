"""Regression tests for the UTC/local date mismatch behind the dashboard's
off-by-one `avg_time_to_response_days`.

`created_at`/`updated_at` are written by the database's `now()` (UTC on both
Postgres and SQLite), but the date columns and every derived "today" used to
come from `date.today()`, which reads the server's *local* calendar. Subtracting
one from the other was correct only on a UTC host: `test_stats_all_range` failed
with 31.0 != 30.0 on a host behind UTC, and would have failed by the same day in
the other direction on a host ahead of it.

These tests pin the conversion itself, so they fail on any host if the fix is
reverted — unlike the dashboard assertion, which only fails where the local
offset happens to cross a date boundary at the moment the suite runs.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.core.clock import to_utc_date, utc_now, utc_today


def test_utc_today_matches_the_utc_calendar():
    assert utc_today() == datetime.now(timezone.utc).date()


def test_utc_now_is_timezone_aware():
    # A naive "now" is what let local time leak into the date math originally.
    assert utc_now().tzinfo is not None


def test_to_utc_date_converts_an_aware_timestamp_across_the_date_boundary():
    # 22:00 on the 10th at UTC-5 is 03:00 on the 11th in UTC. The calendar date
    # must follow UTC, because that is the calendar `date_applied` is on.
    ts = datetime(2026, 8, 10, 22, 0, tzinfo=timezone(timedelta(hours=-5)))
    assert to_utc_date(ts) == date(2026, 8, 11)
    # ...and the reverse: 02:00 on the 11th at UTC+9 is still the 10th in UTC.
    ts = datetime(2026, 8, 11, 2, 0, tzinfo=timezone(timedelta(hours=9)))
    assert to_utc_date(ts) == date(2026, 8, 10)


def test_to_utc_date_treats_naive_timestamps_as_utc():
    # SQLite has no timezone type and hands back what func.now() wrote: UTC.
    # Converting these would shift them by the local offset.
    ts = datetime(2026, 8, 10, 22, 0)
    assert to_utc_date(ts) == date(2026, 8, 10)


def test_response_time_uses_a_single_calendar(client, auth_headers):
    """End-to-end: a row applied N UTC-days ago reports exactly N.

    `date_applied` is seeded from `utc_today()` and `updated_at` is written by
    the DB, so the two sides of the subtraction are on the same calendar and the
    result is exact — no ±1 tolerance, which is the whole point of the fix.
    """
    applied = utc_today() - timedelta(days=12)
    r = client.post(
        "/applications",
        json={
            "company": "Northwind",
            "title": "Backend Engineer",
            "status": "interviewing_oa",
            "date_applied": applied.isoformat(),
        },
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text

    stats = client.get("/dashboard/stats?range=all", headers=auth_headers).json()
    assert stats["avg_time_to_response_days"] == 12.0
