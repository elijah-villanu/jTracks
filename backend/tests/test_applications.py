"""B5/B6/B7 — application CRUD + transition + override via the API."""
from __future__ import annotations

from datetime import date


def _create(client, headers, **over):
    body = {"company": "Acme", "title": "SWE", **over}
    return client.post("/applications", json=body, headers=headers)


def test_crud_lifecycle(client, auth_headers):
    # Create (defaults to saved).
    r = _create(client, auth_headers)
    assert r.status_code == 201, r.text
    app = r.json()
    assert app["status"] == "saved"
    assert app["date_saved"] == date.today().isoformat()
    app_id = app["id"]

    # Read
    r = client.get(f"/applications/{app_id}", headers=auth_headers)
    assert r.status_code == 200

    # List
    r = client.get("/applications", headers=auth_headers)
    assert len(r.json()) == 1

    # Patch a plain field
    r = client.patch(f"/applications/{app_id}", json={"notes": "hi"}, headers=auth_headers)
    assert r.json()["notes"] == "hi"

    # Delete
    assert client.delete(f"/applications/{app_id}", headers=auth_headers).status_code == 204
    assert client.get(f"/applications/{app_id}", headers=auth_headers).status_code == 404


def test_create_applied_defaults_date_applied(client, auth_headers):
    r = _create(client, auth_headers, status="applied")
    assert r.status_code == 201
    assert r.json()["date_applied"] == date.today().isoformat()


def test_list_filtered_by_status(client, auth_headers):
    _create(client, auth_headers, status="saved")
    _create(client, auth_headers, status="applied", date_applied=str(date.today()))
    r = client.get("/applications?status=applied", headers=auth_headers)
    assert r.status_code == 200
    assert all(a["status"] == "applied" for a in r.json())
    assert len(r.json()) == 1


def test_saved_to_applied_requires_date_applied(client, auth_headers):
    app_id = _create(client, auth_headers, status="saved").json()["id"]
    # Move to applied WITHOUT supplying date_applied -> service defaults to today.
    r = client.patch(f"/applications/{app_id}", json={"status": "applied"}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["date_applied"] == date.today().isoformat()


def test_disallowed_transition_returns_400(client, auth_headers):
    app_id = _create(client, auth_headers, status="saved").json()["id"]
    r = client.patch(f"/applications/{app_id}", json={"status": "offer"}, headers=auth_headers)
    assert r.status_code == 400


def test_ghost_days_override_via_patch(client, auth_headers):
    app_id = _create(client, auth_headers).json()["id"]
    r = client.patch(f"/applications/{app_id}", json={"ghost_days_override": 30}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["ghost_days_override"] == 30


def test_crud_requires_auth(client):
    assert client.get("/applications").status_code == 401
    assert client.post("/applications", json={"company": "x", "title": "y"}).status_code == 401
