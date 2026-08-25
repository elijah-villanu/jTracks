"""B19 — the 7-value V2 status enum across schemas and the list filter.

V2 is a hard cutover (PRD R1.1): there is no alias and no deprecation shim for
`interviewing`. A request carrying it must fail pydantic validation — a `422`,
not a `400` from the transition layer and certainly not a `500` from the ORM
trying to coerce an unknown enum member.
"""
from __future__ import annotations

from app.core.clock import utc_today

V2_STATUSES = [
    "saved",
    "applied",
    "interviewing_oa",
    "offer",
    "rejected",
    "failed",
    "ghosted",
]


def _create(client, headers, **over):
    body = {"company": "Acme", "title": "SWE", **over}
    return client.post("/applications", json=body, headers=headers)


def test_all_seven_statuses_accepted_on_create(client, auth_headers):
    for s in V2_STATUSES:
        r = _create(
            client, auth_headers, status=s, date_applied=str(utc_today())
        )
        assert r.status_code == 201, (s, r.text)
        assert r.json()["status"] == s


def test_create_rejects_legacy_interviewing_with_422(client, auth_headers):
    r = _create(client, auth_headers, status="interviewing")
    assert r.status_code == 422, r.text
    # pydantic's enum error, not a hand-rolled transition message.
    assert r.json()["detail"][0]["loc"][-1] == "status"


def test_patch_rejects_legacy_interviewing_with_422(client, auth_headers):
    app_id = _create(client, auth_headers, status="saved").json()["id"]
    r = client.patch(
        f"/applications/{app_id}", json={"status": "interviewing"}, headers=auth_headers
    )
    assert r.status_code == 422, r.text


def test_list_filter_rejects_legacy_interviewing_with_422(client, auth_headers):
    r = client.get("/applications?status=interviewing", headers=auth_headers)
    assert r.status_code == 422, r.text


def test_patch_accepts_interviewing_oa_and_failed(client, auth_headers):
    app_id = _create(
        client, auth_headers, status="applied", date_applied=str(utc_today())
    ).json()["id"]

    r = client.patch(
        f"/applications/{app_id}",
        json={"status": "interviewing_oa"},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "interviewing_oa"

    r = client.patch(
        f"/applications/{app_id}", json={"status": "failed"}, headers=auth_headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "failed"


def test_applied_to_failed_is_legal(client, auth_headers):
    """R1.4 — the pre/post-interview split is a convention, not a constraint."""
    app_id = _create(
        client, auth_headers, status="applied", date_applied=str(utc_today())
    ).json()["id"]
    r = client.patch(
        f"/applications/{app_id}", json={"status": "failed"}, headers=auth_headers
    )
    assert r.status_code == 200, r.text


def test_list_filter_by_failed_and_interviewing_oa(client, auth_headers):
    h = auth_headers
    today = str(utc_today())
    _create(client, h, status="failed", date_applied=today, company="F")
    _create(client, h, status="interviewing_oa", date_applied=today, company="I")
    _create(client, h, status="rejected", date_applied=today, company="R")

    r = client.get("/applications?status=failed", headers=h)
    assert r.status_code == 200
    assert [a["company"] for a in r.json()] == ["F"]

    r = client.get("/applications?status=interviewing_oa", headers=h)
    assert r.status_code == 200
    assert [a["company"] for a in r.json()] == ["I"]


def test_offer_to_ghosted_is_still_a_400_not_a_422(client, auth_headers):
    """A *valid* status that is an *illegal* transition stays a 400 — the two
    failure modes must not collapse into each other."""
    app_id = _create(
        client, auth_headers, status="offer", date_applied=str(utc_today())
    ).json()["id"]
    r = client.patch(
        f"/applications/{app_id}", json={"status": "ghosted"}, headers=auth_headers
    )
    assert r.status_code == 400, r.text
