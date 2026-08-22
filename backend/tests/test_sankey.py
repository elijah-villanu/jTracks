"""B24 — the `sankey` payload on both dashboard endpoints (PRD R5).

Topology is fixed and explicit; the frontend never re-derives it. All six nodes
are always present, and a link is emitted only when it carries flow.
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import event

from app.core.clock import utc_today
from app.db.session import engine

BOTH = ("/dashboard/stats", "/dashboard/recap")

EXPECTED_NODE_KEYS = [
    "applied",
    "interviewing_oa",
    "rejected",
    "ghosted",
    "offer",
    "failed",
]
EXPECTED_LABELS = {
    "applied": "Applied",
    "interviewing_oa": "Interviewing / OA",
    "rejected": "Rejected",
    "ghosted": "Ghosted",
    "offer": "Offer",
    "failed": "Failed Interview/OA",
}


def _mk(client, h, status, days_ago=3, n=1):
    for i in range(n):
        body = {
            "company": f"Acme {status} {i}",
            "title": "SWE",
            "status": status,
            "date_applied": str(utc_today() - timedelta(days=days_ago)),
        }
        assert client.post("/applications", json=body, headers=h).status_code == 201


def _seed_full(client, h):
    """Every status non-zero, so no term in a link can hide behind a zero.

    Mirrors the shape of the D9 seed dataset: applied 4, interviewing_oa 3,
    offer 2, rejected 4, failed 3, ghosted 3 -> total 19.
    """
    _mk(client, h, "applied", n=4)
    _mk(client, h, "interviewing_oa", n=3)
    _mk(client, h, "offer", n=2)
    _mk(client, h, "rejected", n=4)
    _mk(client, h, "failed", n=3)
    _mk(client, h, "ghosted", n=3)
    # `saved` is never submitted and must not appear anywhere in the flow.
    client.post(
        "/applications", json={"company": "S", "title": "T", "status": "saved"}, headers=h
    )


def _links(sankey) -> dict[tuple[str, str], int]:
    return {(l["source"], l["target"]): l["value"] for l in sankey["links"]}


def _nodes(sankey) -> dict[str, int]:
    return {n["key"]: n["value"] for n in sankey["nodes"]}


@pytest.mark.parametrize("path", BOTH)
def test_both_endpoints_emit_the_sankey(client, auth_headers, path):
    r = client.get(f"{path}?range=all", headers=auth_headers)
    assert r.status_code == 200
    assert "sankey" in r.json()


@pytest.mark.parametrize("path", BOTH)
def test_nodes_are_always_all_six_in_fixed_order_with_fixed_labels(
    client, auth_headers, path
):
    _seed_full(client, auth_headers)
    sankey = client.get(f"{path}?range=all", headers=auth_headers).json()["sankey"]
    assert [n["key"] for n in sankey["nodes"]] == EXPECTED_NODE_KEYS
    assert {n["key"]: n["label"] for n in sankey["nodes"]} == EXPECTED_LABELS


def test_link_derivation_against_a_fully_populated_fixture(client, auth_headers):
    """R5.3, with every link non-zero simultaneously."""
    h = auth_headers
    _seed_full(client, h)
    data = client.get("/dashboard/stats?range=all", headers=h).json()
    sankey = data["sankey"]

    assert data["total"] == 19  # `saved` excluded
    nodes, links = _nodes(sankey), _links(sankey)

    # Applied node = every submitted application in range.
    assert nodes["applied"] == 19
    # Interviewing/OA inflow = interviewing_oa + offer + failed = 3 + 2 + 3.
    # The failure this guards against is emitting the bare `interviewing_oa`
    # count (3) instead of 8.
    assert nodes["interviewing_oa"] == 8
    assert links[("applied", "interviewing_oa")] == 8
    assert links[("applied", "rejected")] == 4
    assert links[("applied", "ghosted")] == 3
    assert links[("interviewing_oa", "offer")] == 2
    assert links[("interviewing_oa", "failed")] == 3
    assert len(links) == 5

    # Terminal nodes equal their own status count.
    assert nodes["rejected"] == 4
    assert nodes["ghosted"] == 3
    assert nodes["offer"] == 2
    assert nodes["failed"] == 3


def test_applied_outflow_equals_total_minus_rows_still_in_applied(client, auth_headers):
    """R5.4 — in-flight `applied` rows flow nowhere, and nothing fabricates a
    balancing link to hide the gap."""
    h = auth_headers
    _seed_full(client, h)
    data = client.get("/dashboard/stats?range=all", headers=h).json()
    links = _links(data["sankey"])
    still_applied = {b["status"]: b["count"] for b in data["status_breakdown"]}["applied"]

    outflow = (
        links[("applied", "interviewing_oa")]
        + links[("applied", "rejected")]
        + links[("applied", "ghosted")]
    )
    assert outflow == data["total"] - still_applied == 15


def test_interviewing_outflow_is_less_than_its_value_when_rows_are_in_flight(
    client, auth_headers
):
    """R5.4 again, one level down: the 3 rows sitting in `interviewing_oa` have
    no outgoing edge, and no `pending` node exists."""
    h = auth_headers
    _seed_full(client, h)
    sankey = client.get("/dashboard/stats?range=all", headers=h).json()["sankey"]
    nodes, links = _nodes(sankey), _links(sankey)
    outflow = links[("interviewing_oa", "offer")] + links[("interviewing_oa", "failed")]
    assert outflow == 5
    assert nodes["interviewing_oa"] == 8
    assert outflow < nodes["interviewing_oa"]
    assert "pending" not in nodes


@pytest.mark.parametrize("path", BOTH)
def test_zero_total_returns_six_zero_nodes_and_no_links(client, auth_headers, path):
    """R5.6 — the key is always present, never omitted."""
    body = client.get(f"{path}?range=all", headers=auth_headers).json()
    sankey = body["sankey"]
    assert [n["key"] for n in sankey["nodes"]] == EXPECTED_NODE_KEYS
    assert all(n["value"] == 0 for n in sankey["nodes"])
    assert sankey["links"] == []


def test_everything_still_in_applied_produces_no_links(client, auth_headers):
    """R5.6 — the degenerate 'nothing has moved yet' case."""
    h = auth_headers
    _mk(client, h, "applied", n=5)
    sankey = client.get("/dashboard/stats?range=all", headers=h).json()["sankey"]
    assert _nodes(sankey)["applied"] == 5
    assert sankey["links"] == []


def test_single_link_carrying_all_of_the_flow(client, auth_headers):
    """R5.6 — 100% down one path."""
    h = auth_headers
    _mk(client, h, "rejected", n=4)
    sankey = client.get("/dashboard/stats?range=all", headers=h).json()["sankey"]
    assert _links(sankey) == {("applied", "rejected"): 4}
    assert _nodes(sankey)["applied"] == 4


def test_saved_rows_never_enter_the_flow(client, auth_headers):
    h = auth_headers
    for i in range(3):
        client.post(
            "/applications",
            json={"company": f"S{i}", "title": "T", "status": "saved"},
            headers=h,
        )
    _mk(client, h, "applied", n=1)
    sankey = client.get("/dashboard/stats?range=all", headers=h).json()["sankey"]
    assert _nodes(sankey)["applied"] == 1


def test_sankey_respects_the_selected_range(client, auth_headers):
    h = auth_headers
    _mk(client, h, "offer", days_ago=2)
    _mk(client, h, "offer", days_ago=200)
    week = client.get("/dashboard/stats?range=week", headers=h).json()["sankey"]
    all_ = client.get("/dashboard/stats?range=all", headers=h).json()["sankey"]
    assert _nodes(week)["offer"] == 1
    assert _nodes(all_)["offer"] == 2


def test_stats_and_recap_agree_on_the_same_range(client, auth_headers):
    h = auth_headers
    _seed_full(client, h)
    a = client.get("/dashboard/stats?range=month", headers=h).json()["sankey"]
    b = client.get("/dashboard/recap?range=month", headers=h).json()["sankey"]
    assert a == b


@pytest.mark.parametrize("path", BOTH)
def test_sankey_adds_no_extra_database_round_trip(client, auth_headers, path):
    """Performance NFR: the Sankey is a projection of the same aggregate pass as
    `status_breakdown`, not a second set of queries.

    The endpoint's whole budget is: the auth lookup of the current user, and one
    SELECT over the range's applications. Anything more means a second pass
    crept in.
    """
    _seed_full(client, auth_headers)

    selects: list[str] = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            selects.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        assert client.get(f"{path}?range=all", headers=auth_headers).status_code == 200
    finally:
        event.remove(engine, "before_cursor_execute", _record)

    app_selects = [s for s in selects if "FROM applications" in s]
    assert len(app_selects) == 1, app_selects
    assert len(selects) == 2, selects  # + the users lookup in get_current_user
