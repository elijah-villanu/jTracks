"""B4 — per-user data isolation."""
from __future__ import annotations


def test_cannot_access_another_users_application(client, register):
    _t1, h1 = register(email="owner@b.com")
    _t2, h2 = register(email="intruder@b.com")

    app_id = client.post(
        "/applications", json={"company": "Secret", "title": "SWE"}, headers=h1
    ).json()["id"]

    # Intruder gets 404 (not 403, and never the data) for another user's row.
    assert client.get(f"/applications/{app_id}", headers=h2).status_code == 404
    assert client.patch(
        f"/applications/{app_id}", json={"notes": "x"}, headers=h2
    ).status_code == 404
    assert client.delete(f"/applications/{app_id}", headers=h2).status_code == 404

    # Owner still sees it; intruder's list is empty.
    assert client.get(f"/applications/{app_id}", headers=h1).status_code == 200
    assert client.get("/applications", headers=h2).json() == []
    assert len(client.get("/applications", headers=h1).json()) == 1
