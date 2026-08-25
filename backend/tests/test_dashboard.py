"""B14/B16/B21/B23 — dashboard stats + recap under the V2 metric contract.

B22 (ranges) and B24 (sankey) have their own files: `test_dashboard_ranges.py`
and `test_sankey.py`.
"""
from __future__ import annotations

from datetime import timedelta

from app.core.clock import utc_today

# R4.1 — exactly these 6, in exactly this order, always.
EXPECTED_BREAKDOWN_ORDER = [
    "applied",
    "interviewing_oa",
    "offer",
    "rejected",
    "failed",
    "ghosted",
]


def _mk(client, h, status, days_ago):
    body = {
        "company": "Acme",
        "title": "SWE",
        "status": status,
        "date_applied": str(utc_today() - timedelta(days=days_ago)),
    }
    assert client.post("/applications", json=body, headers=h).status_code == 201


def _seed(client, h):
    """6 submitted rows, one per funnel status, plus an excluded `saved`."""
    _mk(client, h, "applied", 10)           # still waiting
    _mk(client, h, "interviewing_oa", 20)   # responded, ttr 20
    _mk(client, h, "offer", 30)             # responded, ttr 30
    _mk(client, h, "rejected", 40)          # responded, ttr 40
    _mk(client, h, "failed", 50)            # responded, ttr 50
    _mk(client, h, "ghosted", 60)           # no response
    client.post(
        "/applications", json={"company": "A", "title": "B", "status": "saved"}, headers=h
    )


def test_stats_all_range(client, auth_headers):
    h = auth_headers
    _seed(client, h)
    r = client.get("/dashboard/stats?range=all", headers=h)
    assert r.status_code == 200
    data = r.json()

    assert data["total"] == 6  # saved excluded
    by = {b["status"]: b["count"] for b in data["status_breakdown"]}
    assert by == {
        "applied": 1,
        "interviewing_oa": 1,
        "offer": 1,
        "rejected": 1,
        "failed": 1,
        "ghosted": 1,
    }

    # R4.2 — responded = interviewing_oa + offer + rejected + failed = 4/6
    assert data["response_rate"] == 66.7
    # R4.3 — ghosted / total = 1/6
    assert data["ghost_rate"] == 16.7
    # R4.4 — (rejected + failed) / total = 2/6
    assert data["rejection_fail_rate"] == 33.3
    # ttr averaged over the same 4 responded rows: (20+30+40+50)/4
    assert data["avg_time_to_response_days"] == 35.0
    assert data["time_series_granularity"] == "month"


def test_rejection_rate_field_is_gone_everywhere(client, auth_headers):
    """R4.4 is a hard cutover — no alias, no deprecation."""
    h = auth_headers
    _seed(client, h)
    for path in ("/dashboard/stats?range=all", "/dashboard/recap?range=all"):
        assert "rejection_rate" not in client.get(path, headers=h).text, path
    # The metric survives under its new name on stats, and as a labelled
    # highlight on the recap (which carries no raw rate fields).
    assert "rejection_fail_rate" in client.get(
        "/dashboard/stats?range=all", headers=h
    ).text
    recap = client.get("/dashboard/recap?range=all", headers=h).json()
    assert "Rejection/fail rate" in {x["label"] for x in recap["highlights"]}


def test_status_breakdown_is_six_entries_in_fixed_order(client, auth_headers):
    h = auth_headers
    _seed(client, h)
    data = client.get("/dashboard/stats?range=all", headers=h).json()
    assert [b["status"] for b in data["status_breakdown"]] == EXPECTED_BREAKDOWN_ORDER


def test_status_breakdown_keeps_six_zero_entries_when_empty(client, auth_headers):
    """R4.1 — zero-count entries are included, so the shape never varies."""
    data = client.get("/dashboard/stats?range=all", headers=auth_headers).json()
    assert data["total"] == 0
    assert [b["status"] for b in data["status_breakdown"]] == EXPECTED_BREAKDOWN_ORDER
    assert all(b["count"] == 0 for b in data["status_breakdown"])
    assert all(b["percentage"] == 0.0 for b in data["status_breakdown"])


def test_every_rate_is_zero_at_total_zero(client, auth_headers):
    data = client.get("/dashboard/stats?range=all", headers=auth_headers).json()
    assert data["response_rate"] == 0.0
    assert data["ghost_rate"] == 0.0
    assert data["rejection_fail_rate"] == 0.0
    assert data["avg_time_to_response_days"] is None


def test_partial_breakdown_still_lists_absent_statuses(client, auth_headers):
    h = auth_headers
    _mk(client, h, "applied", 1)
    _mk(client, h, "failed", 2)
    data = client.get("/dashboard/stats?range=all", headers=h).json()
    by = {b["status"]: b["count"] for b in data["status_breakdown"]}
    assert by == {
        "applied": 1,
        "interviewing_oa": 0,
        "offer": 0,
        "rejected": 0,
        "failed": 1,
        "ghosted": 0,
    }
    assert data["rejection_fail_rate"] == 50.0
    assert data["response_rate"] == 50.0


def test_stats_week_range_filters_and_daily_series(client, auth_headers):
    h = auth_headers
    _mk(client, h, "applied", 2)    # in last week
    _mk(client, h, "applied", 40)   # outside week
    data = client.get("/dashboard/stats?range=week", headers=h).json()
    assert data["total"] == 1
    assert data["time_series_granularity"] == "day"
    assert len(data["applications_over_time"]) == 7
    assert sum(p["count"] for p in data["applications_over_time"]) == 1


def test_stats_scoped_per_user(client, register):
    _t1, h1 = register(email="u1@b.com")
    _t2, h2 = register(email="u2@b.com")
    _seed(client, h1)
    assert client.get("/dashboard/stats?range=all", headers=h2).json()["total"] == 0


def test_recap_payload(client, auth_headers):
    h = auth_headers
    _mk(client, h, "applied", 2)
    _mk(client, h, "offer", 3)
    r = client.get("/dashboard/recap?range=week", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["range"] == "week"
    assert data["period_label"] == "This week"
    assert data["period_start"] == str(utc_today() - timedelta(days=6))
    assert data["period_end"] == str(utc_today())
    assert data["total_applications"] == 2
    labels = {hl["label"] for hl in data["highlights"]}
    assert {
        "Applications",
        "Interviews",
        "Offers",
        "Response rate",
        "Ghost rate",
        "Rejection/fail rate",
    } <= labels
    assert "offer" in data["headline"].lower()


def test_recap_interviews_highlight_counts_offer_and_failed(client, auth_headers):
    """R4.5 — interviews = interviewing_oa + offer + failed."""
    h = auth_headers
    _mk(client, h, "applied", 1)
    _mk(client, h, "interviewing_oa", 2)
    _mk(client, h, "interviewing_oa", 3)
    _mk(client, h, "offer", 4)
    _mk(client, h, "failed", 5)
    _mk(client, h, "rejected", 6)
    _mk(client, h, "ghosted", 6)
    data = client.get("/dashboard/recap?range=month", headers=h).json()
    hl = {x["label"]: x["value"] for x in data["highlights"]}
    assert hl["Interviews"] == "4"  # 2 interviewing_oa + 1 offer + 1 failed
    assert hl["Applications"] == "7"
    assert hl["Offers"] == "1"


def test_recap_rejection_fail_rate_highlight(client, auth_headers):
    h = auth_headers
    _mk(client, h, "rejected", 1)
    _mk(client, h, "failed", 2)
    _mk(client, h, "applied", 3)
    _mk(client, h, "applied", 4)
    data = client.get("/dashboard/recap?range=month", headers=h).json()
    hl = {x["label"]: x["value"] for x in data["highlights"]}
    assert hl["Rejection/fail rate"] == "50%"


def test_recap_empty_period(client, auth_headers):
    data = client.get("/dashboard/recap?range=week", headers=auth_headers).json()
    assert data["total_applications"] == 0
    assert "No applications yet" in data["headline"]
    assert data["period_start"] == str(utc_today() - timedelta(days=6))


def test_dashboard_requires_auth(client):
    assert client.get("/dashboard/stats").status_code == 401
    assert client.get("/dashboard/recap").status_code == 401
