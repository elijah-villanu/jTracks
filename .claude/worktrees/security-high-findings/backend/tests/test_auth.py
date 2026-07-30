"""B2/B3/B4 — auth acceptance tests."""
from __future__ import annotations

import app.api.routes.auth as auth_route
from app.services.google_verify import GoogleIdentity


def test_signup_returns_token(client):
    r = client.post("/auth/signup", json={"email": "a@b.com", "password": "password123"})
    assert r.status_code == 201
    assert r.json()["access_token"]
    assert r.json()["token_type"] == "bearer"


def test_duplicate_signup_rejected(client):
    body = {"email": "dup@b.com", "password": "password123"}
    assert client.post("/auth/signup", json=body).status_code == 201
    r = client.post("/auth/signup", json=body)
    assert r.status_code == 409


def test_login_bad_credentials_returns_401(client):
    client.post("/auth/signup", json={"email": "c@b.com", "password": "password123"})
    r = client.post("/auth/login", json={"email": "c@b.com", "password": "wrongpass"})
    assert r.status_code == 401
    # Unknown user also 401 (no user enumeration).
    r2 = client.post("/auth/login", json={"email": "nope@b.com", "password": "password123"})
    assert r2.status_code == 401


def test_login_success(client):
    client.post("/auth/signup", json={"email": "d@b.com", "password": "password123"})
    r = client.post("/auth/login", json={"email": "d@b.com", "password": "password123"})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_me_requires_valid_jwt(client, auth_headers):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    r = client.get("/auth/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["email"] == "user@example.com"
    assert r.json()["ghost_days_default"] == 14


def test_google_oauth_same_user_on_repeat_login(client, monkeypatch):
    identity = GoogleIdentity(google_id="google-123", email="goog@b.com", email_verified=True)
    monkeypatch.setattr(auth_route, "verify_google_id_token", lambda _t: identity)

    r1 = client.post("/auth/oauth/google", json={"id_token": "tok"})
    assert r1.status_code == 200
    r2 = client.post("/auth/oauth/google", json={"id_token": "tok"})
    assert r2.status_code == 200

    me1 = client.get("/auth/me", headers={"Authorization": f"Bearer {r1.json()['access_token']}"})
    me2 = client.get("/auth/me", headers={"Authorization": f"Bearer {r2.json()['access_token']}"})
    assert me1.json()["id"] == me2.json()["id"]
    assert me1.json()["email"] == "goog@b.com"


def test_google_oauth_links_existing_email(client, monkeypatch):
    # Email/password user exists first...
    client.post("/auth/signup", json={"email": "link@b.com", "password": "password123"})
    identity = GoogleIdentity(google_id="google-999", email="link@b.com", email_verified=True)
    monkeypatch.setattr(auth_route, "verify_google_id_token", lambda _t: identity)

    r = client.post("/auth/oauth/google", json={"id_token": "tok"})
    assert r.status_code == 200
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["google_id"] == "google-999"


def test_google_oauth_invalid_token_401(client, monkeypatch):
    from app.services.google_verify import GoogleVerificationError

    def _raise(_t):
        raise GoogleVerificationError("bad")

    monkeypatch.setattr(auth_route, "verify_google_id_token", _raise)
    r = client.post("/auth/oauth/google", json={"id_token": "tok"})
    assert r.status_code == 401
