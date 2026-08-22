"""B22/B23 — the expanded range set, custom-range validation and bucketing.

PRD R6. Both `/dashboard/stats` and `/dashboard/recap` take the identical range
set, so most assertions here are run against both endpoints.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.core.clock import utc_today
from app.services.ranges import (
    add_months,
    first_of_month,
    format_custom_label,
    resolve_range,
)

BOTH = ("/dashboard/stats", "/dashboard/recap")


def _mk(client, h, days_ago, status="applied"):
    body = {
        "company": "Acme",
        "title": "SWE",
        "status": status,
        "date_applied": str(utc_today() - timedelta(days=days_ago)),
    }
    assert client.post("/applications", json=body, headers=h).status_code == 201


def _custom(start: date, end: date) -> str:
    return f"range=custom&start={start.isoformat()}&end={end.isoformat()}"


# --------------------------------------------------------------------------
# R6.1 — the shared range set
# --------------------------------------------------------------------------


@pytest.mark.parametrize("path", BOTH)
@pytest.mark.parametrize("range_", ["week", "month", "year", "all"])
def test_both_endpoints_accept_every_preset_range(client, auth_headers, path, range_):
    r = client.get(f"{path}?range={range_}", headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json()["range"] == range_


@pytest.mark.parametrize("path", BOTH)
def test_both_endpoints_accept_a_custom_range(client, auth_headers, path):
    today = utc_today()
    r = client.get(
        f"{path}?{_custom(today - timedelta(days=10), today)}", headers=auth_headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["range"] == "custom"


@pytest.mark.parametrize("path", BOTH)
def test_unknown_range_is_422(client, auth_headers, path):
    assert client.get(f"{path}?range=fortnight", headers=auth_headers).status_code == 422


# --------------------------------------------------------------------------
# R6.2 — custom-range validation
# --------------------------------------------------------------------------


@pytest.mark.parametrize("path", BOTH)
def test_custom_requires_both_bounds(client, auth_headers, path):
    today = utc_today()
    assert client.get(f"{path}?range=custom", headers=auth_headers).status_code == 422
    assert (
        client.get(f"{path}?range=custom&start={today}", headers=auth_headers).status_code
        == 422
    )
    assert (
        client.get(f"{path}?range=custom&end={today}", headers=auth_headers).status_code
        == 422
    )


@pytest.mark.parametrize("path", BOTH)
def test_custom_rejects_inverted_bounds(client, auth_headers, path):
    today = utc_today()
    q = _custom(today, today - timedelta(days=1))
    assert client.get(f"{path}?{q}", headers=auth_headers).status_code == 422


@pytest.mark.parametrize("path", BOTH)
def test_custom_span_of_367_days_is_422(client, auth_headers, path):
    """The inclusive count is `(end - start).days + 1`, so a 366-day delta is a
    367-day span — one over the leap-year cap."""
    end = utc_today()
    start = end - timedelta(days=366)
    assert (end - start).days + 1 == 367
    assert client.get(f"{path}?{_custom(start, end)}", headers=auth_headers).status_code == 422


@pytest.mark.parametrize("path", BOTH)
def test_custom_span_of_366_days_is_accepted(client, auth_headers, path):
    end = utc_today()
    start = end - timedelta(days=365)
    assert (end - start).days + 1 == 366
    assert client.get(f"{path}?{_custom(start, end)}", headers=auth_headers).status_code == 200


@pytest.mark.parametrize("path", BOTH)
def test_custom_single_day_span_is_accepted(client, auth_headers, path):
    today = utc_today()
    r = client.get(f"{path}?{_custom(today, today)}", headers=auth_headers)
    assert r.status_code == 200, r.text


def test_custom_single_day_series_has_one_point(client, auth_headers):
    today = utc_today()
    data = client.get(
        f"/dashboard/stats?{_custom(today, today)}", headers=auth_headers
    ).json()
    assert data["time_series_granularity"] == "day"
    assert len(data["applications_over_time"]) == 1


# --------------------------------------------------------------------------
# R6.4 — bucketing
# --------------------------------------------------------------------------


def test_week_returns_exactly_seven_daily_points(client, auth_headers):
    data = client.get("/dashboard/stats?range=week", headers=auth_headers).json()
    assert data["time_series_granularity"] == "day"
    assert len(data["applications_over_time"]) == 7


def test_month_returns_exactly_thirty_daily_points(client, auth_headers):
    data = client.get("/dashboard/stats?range=month", headers=auth_headers).json()
    assert data["time_series_granularity"] == "day"
    assert len(data["applications_over_time"]) == 30


def test_year_returns_exactly_twelve_monthly_points(client, auth_headers):
    data = client.get("/dashboard/stats?range=year", headers=auth_headers).json()
    assert data["time_series_granularity"] == "month"
    points = data["applications_over_time"]
    assert len(points) == 12
    # Zero-filled, contiguous, ending on the current UTC month.
    assert points[-1]["period"] == utc_today().strftime("%Y-%m")
    assert points[0]["period"] == add_months(first_of_month(utc_today()), -11).strftime(
        "%Y-%m"
    )


def test_year_series_sums_to_total(client, auth_headers):
    """The trailing-12-months window and the 12 buckets must agree — a row in
    the window with no bucket to land in would be a silent undercount."""
    h = auth_headers
    _mk(client, h, 0)
    _mk(client, h, 200)
    _mk(client, h, 330)
    data = client.get("/dashboard/stats?range=year", headers=h).json()
    assert sum(p["count"] for p in data["applications_over_time"]) == data["total"]


def test_year_excludes_rows_older_than_the_window(client, auth_headers):
    h = auth_headers
    _mk(client, h, 0)
    _mk(client, h, 800)  # comfortably outside a trailing 12 months
    assert client.get("/dashboard/stats?range=year", headers=h).json()["total"] == 1
    assert client.get("/dashboard/stats?range=all", headers=h).json()["total"] == 2


def test_custom_92_day_span_is_daily(client, auth_headers):
    end = utc_today()
    start = end - timedelta(days=91)  # inclusive span 92
    data = client.get(f"/dashboard/stats?{_custom(start, end)}", headers=auth_headers).json()
    assert data["time_series_granularity"] == "day"
    assert len(data["applications_over_time"]) == 92


def test_custom_93_day_span_is_monthly(client, auth_headers):
    end = utc_today()
    start = end - timedelta(days=92)  # inclusive span 93
    data = client.get(f"/dashboard/stats?{_custom(start, end)}", headers=auth_headers).json()
    assert data["time_series_granularity"] == "month"
    # Zero-filled across every calendar month the span touches.
    expected_months = []
    cur = first_of_month(start)
    while cur <= first_of_month(end):
        expected_months.append(cur.strftime("%Y-%m"))
        cur = add_months(cur, 1)
    assert [p["period"] for p in data["applications_over_time"]] == expected_months


def test_all_reports_only_months_with_data(client, auth_headers):
    h = auth_headers
    _mk(client, h, 0)
    _mk(client, h, 400)
    data = client.get("/dashboard/stats?range=all", headers=h).json()
    assert data["time_series_granularity"] == "month"
    # Two widely separated months, and no zero-filled months between them.
    assert len(data["applications_over_time"]) == 2
    assert sum(p["count"] for p in data["applications_over_time"]) == 2


def test_custom_window_bounds_are_inclusive_on_both_edges(client, auth_headers):
    h = auth_headers
    _mk(client, h, 10)   # start edge
    _mk(client, h, 5)    # interior
    _mk(client, h, 11)   # one day before the window
    end = utc_today()
    start = end - timedelta(days=10)
    data = client.get(f"/dashboard/stats?{_custom(start, end)}", headers=h).json()
    assert data["total"] == 2


def test_custom_window_ending_in_the_past_excludes_later_rows(client, auth_headers):
    h = auth_headers
    _mk(client, h, 40)
    _mk(client, h, 1)
    end = utc_today() - timedelta(days=30)
    start = end - timedelta(days=30)
    data = client.get(f"/dashboard/stats?{_custom(start, end)}", headers=h).json()
    assert data["total"] == 1


# --------------------------------------------------------------------------
# R6.3 — period labels (recap)
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "range_,label",
    [
        ("week", "This week"),
        ("month", "This month"),
        ("year", "This year"),
        ("all", "All time"),
    ],
)
def test_recap_period_labels(client, auth_headers, range_, label):
    data = client.get(f"/dashboard/recap?range={range_}", headers=auth_headers).json()
    assert data["period_label"] == label
    assert data["period_end"] == str(utc_today())
    assert data["period_start"] <= data["period_end"]


def test_recap_preset_period_bounds(client, auth_headers):
    today = utc_today()
    for range_, expected_start in (
        ("week", today - timedelta(days=6)),
        ("month", today - timedelta(days=29)),
        ("year", add_months(first_of_month(today), -11)),
    ):
        data = client.get(f"/dashboard/recap?range={range_}", headers=auth_headers).json()
        assert data["period_start"] == str(expected_start), range_


def test_recap_all_period_start_is_the_first_application(client, auth_headers):
    h = auth_headers
    _mk(client, h, 500)
    _mk(client, h, 3)
    data = client.get("/dashboard/recap?range=all", headers=h).json()
    assert data["period_start"] == str(utc_today() - timedelta(days=500))


def test_recap_custom_period_label_and_bounds(client, auth_headers):
    start, end = date(2026, 1, 1), date(2026, 3, 15)
    data = client.get(
        f"/dashboard/recap?{_custom(start, end)}", headers=auth_headers
    ).json()
    assert data["period_label"] == "Jan 1 – Mar 15, 2026"
    assert data["period_start"] == "2026-01-01"
    assert data["period_end"] == "2026-03-15"


def test_custom_label_spells_out_both_years_when_they_differ():
    assert (
        format_custom_label(date(2025, 12, 1), date(2026, 3, 15))
        == "Dec 1, 2025 – Mar 15, 2026"
    )


# --------------------------------------------------------------------------
# R6.5 — every boundary is UTC, taken from an injected `today`
# --------------------------------------------------------------------------


def test_resolve_range_uses_the_supplied_today_not_the_host_clock():
    anchor = date(2026, 3, 15)
    assert resolve_range("week", today=anchor).start == date(2026, 3, 9)
    assert resolve_range("month", today=anchor).start == date(2026, 2, 14)
    assert resolve_range("year", today=anchor).start == date(2025, 4, 1)
    assert resolve_range("all", today=anchor).start is None
    for r in ("week", "month", "year", "all"):
        assert resolve_range(r, today=anchor).end == anchor


def test_year_window_crosses_a_leap_february_cleanly():
    anchor = date(2024, 2, 29)
    rr = resolve_range("year", today=anchor)
    assert rr.start == date(2023, 3, 1)
    assert rr.granularity == "month"
