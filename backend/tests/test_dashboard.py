"""B14/B16 — dashboard stats + recap."""
from __future__ import annotations

from datetime import timedelta

from app.core.clock import utc_today


def _mk(client, h, status, days_ago):
    body = {
        "company": "Acme",
        "title": "SWE",
        "status": status,
        "date_applied": str(utc_today() - timedelta(days=days_ago)),
    }
    assert client.post("/applications", json=body, headers=h).status_code == 201


def _seed(client, h):
    _mk(client, h, "applied", 10)        # waiting
    _mk(client, h, "interviewing", 20)   # responded, ttr 20
    _mk(client, h, "offer", 30)          # responded, ttr 30
    _mk(client, h, "rejected", 40)       # responded, ttr 40
    _mk(client, h, "ghosted", 50)        # no response
    # saved (excluded from dashboard funnel)
    client.post("/applications", json={"company": "A", "title": "B", "status": "saved"}, headers=h)


def test_stats_all_range(client, auth_headers):
    h = auth_headers
    _seed(client, h)
    r = client.get("/dashboard/stats?range=all", headers=h)
    assert r.status_code == 200
    data = r.json()

    assert data["total"] == 5  # saved excluded
    by = {b["status"]: b["count"] for b in data["status_breakdown"]}
    assert by == {"applied": 1, "interviewing": 1, "offer": 1, "rejected": 1, "ghosted": 1}

    assert data["response_rate"] == 60.0
    assert data["ghost_rate"] == 20.0
    assert data["rejection_rate"] == 20.0
    assert data["avg_time_to_response_days"] == 30.0
    assert data["time_series_granularity"] == "month"


def test_stats_week_range_filters_and_daily_series(client, auth_headers):
    h = auth_headers
    _mk(client, h, "applied", 2)    # in last week
    _mk(client, h, "applied", 40)   # outside week
    r = client.get("/dashboard/stats?range=week", headers=h)
    data = r.json()
    assert data["total"] == 1
    assert data["time_series_granularity"] == "day"
    # 7 daily buckets, summing to 1.
    assert len(data["applications_over_time"]) == 7
    assert sum(p["count"] for p in data["applications_over_time"]) == 1


def test_stats_empty(client, auth_headers):
    r = client.get("/dashboard/stats?range=all", headers=auth_headers)
    data = r.json()
    assert data["total"] == 0
    assert data["response_rate"] == 0.0
    assert data["avg_time_to_response_days"] is None


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
    assert data["total_applications"] == 2
    labels = {hl["label"] for hl in data["highlights"]}
    assert {"Applications", "Interviews", "Offers", "Response rate"} <= labels
    assert "offer" in data["headline"].lower()


def test_dashboard_requires_auth(client):
    assert client.get("/dashboard/stats").status_code == 401
    assert client.get("/dashboard/recap").status_code == 401
