"""B7 — global ghost-days settings."""
from __future__ import annotations


def test_get_default_settings(client, auth_headers):
    r = client.get("/settings", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"ghost_days_default": 14}


def test_update_settings(client, auth_headers):
    r = client.patch("/settings", json={"ghost_days_default": 21}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["ghost_days_default"] == 21
    assert client.get("/settings", headers=auth_headers).json()["ghost_days_default"] == 21


def test_update_settings_validation(client, auth_headers):
    assert client.patch("/settings", json={"ghost_days_default": 0}, headers=auth_headers).status_code == 422
    assert client.patch("/settings", json={"ghost_days_default": 9999}, headers=auth_headers).status_code == 422


def test_settings_requires_auth(client):
    assert client.get("/settings").status_code == 401
