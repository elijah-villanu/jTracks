"""B28/B29 — /auth/refresh, /auth/logout, the refresh cookie and credentialed CORS.

The client here uses an `https://` base URL on purpose: the refresh cookie is
`Secure`, and Python's `http.cookiejar` refuses to *send* a Secure cookie over a
plain-http request. Over http the cookie would be set and then never returned,
and every test would fail for a reason that has nothing to do with the code.
Real browsers make an exception for `http://localhost`; the stdlib jar does not.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app as fastapi_app
from app.models.refresh_token import RefreshToken

COOKIE = settings.REFRESH_COOKIE_NAME
CSRF = {settings.REFRESH_CSRF_HEADER: "1"}
ORIGIN = "http://localhost:5173"


@pytest.fixture
def sclient() -> TestClient:
    """TestClient over https so the Secure refresh cookie round-trips."""
    return TestClient(fastapi_app, base_url="https://testserver")


def _signup(sclient, email="cookie@example.com", password="password123"):
    r = sclient.post("/auth/signup", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r


def _set_cookie_header(response) -> str:
    headers = response.headers.get_list("set-cookie")
    match = [h for h in headers if h.startswith(f"{COOKIE}=")]
    assert match, headers
    return match[0]


# --------------------------------------------------------------------------
# The cookie itself
# --------------------------------------------------------------------------


@pytest.mark.parametrize("endpoint", ["signup", "login"])
def test_signup_and_login_set_the_refresh_cookie(sclient, endpoint):
    r = _signup(sclient)
    if endpoint == "login":
        r = sclient.post(
            "/auth/login",
            json={"email": "cookie@example.com", "password": "password123"},
        )
        assert r.status_code == 200
    assert COOKIE in sclient.cookies


def test_cookie_carries_the_attributes_b25_chose(sclient):
    header = _set_cookie_header(_signup(sclient)).lower()
    assert "httponly" in header
    assert "secure" in header
    assert "path=/auth" in header
    assert "samesite=none" in header


def test_response_body_never_contains_the_refresh_token(sclient):
    """R7.2 — the refresh token exists only as a cookie."""
    r = _signup(sclient)
    body = r.json()
    assert set(body) == {"access_token", "token_type"}
    raw = sclient.cookies.get(COOKIE, path=settings.REFRESH_COOKIE_PATH)
    assert raw
    assert raw not in r.text


def test_the_cookie_value_is_not_what_is_stored(sclient):
    """Security NFR: the DB holds a hash, never the raw token."""
    _signup(sclient)
    raw = sclient.cookies.get(COOKIE, path=settings.REFRESH_COOKIE_PATH)
    db = SessionLocal()
    try:
        rows = db.query(RefreshToken).all()
        assert len(rows) == 1
        assert rows[0].token_hash != raw
    finally:
        db.close()


# --------------------------------------------------------------------------
# /auth/refresh
# --------------------------------------------------------------------------


def test_refresh_returns_a_usable_access_token(sclient):
    _signup(sclient)
    r = sclient.post("/auth/refresh", headers=CSRF)
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    assert r.json()["token_type"] == "bearer"

    me = sclient.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "cookie@example.com"


def test_refresh_does_not_rotate_the_token(sclient):
    """R7.5 — no rotation, deliberately. The cookie is unchanged by a refresh."""
    _signup(sclient)
    before = sclient.cookies.get(COOKIE, path=settings.REFRESH_COOKIE_PATH)
    r = sclient.post("/auth/refresh", headers=CSRF)
    assert r.status_code == 200
    assert sclient.cookies.get(COOKIE, path=settings.REFRESH_COOKIE_PATH) == before
    # ...and it still works a second time.
    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 200


def test_refresh_without_a_cookie_is_401(sclient):
    r = sclient.post("/auth/refresh", headers=CSRF)
    assert r.status_code == 401


def test_refresh_with_a_garbage_cookie_is_401(sclient):
    r = sclient.post(
        "/auth/refresh", headers=CSRF, cookies={COOKIE: "not-a-real-token"}
    )
    assert r.status_code == 401


def test_every_refresh_failure_gives_the_same_message(sclient):
    """R7.4 — don't leak whether a token was unknown, expired or revoked."""
    missing = sclient.post("/auth/refresh", headers=CSRF)
    unknown = sclient.post(
        "/auth/refresh", headers=CSRF, cookies={COOKIE: "nope-nope-nope"}
    )
    _signup(sclient)
    sclient.post("/auth/logout", headers=CSRF)
    revoked = sclient.post("/auth/refresh", headers=CSRF)

    details = {r.json()["detail"] for r in (missing, unknown, revoked)}
    assert len(details) == 1
    assert all(r.status_code == 401 for r in (missing, unknown, revoked))


def test_an_access_token_cannot_be_replayed_as_a_refresh_token(sclient):
    """B26's `typ` claim, exercised end to end."""
    access = _signup(sclient).json()["access_token"]
    sclient.cookies.clear()
    r = sclient.post("/auth/refresh", headers=CSRF, cookies={COOKIE: access})
    assert r.status_code == 401


def test_expired_refresh_token_is_401(sclient):
    import datetime as dt

    from app.core.clock import utc_now

    _signup(sclient)
    db = SessionLocal()
    try:
        row = db.query(RefreshToken).one()
        row.expires_at = utc_now() - dt.timedelta(seconds=1)
        db.commit()
    finally:
        db.close()
    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 401


# --------------------------------------------------------------------------
# /auth/logout
# --------------------------------------------------------------------------


def test_logout_revokes_the_token_and_refresh_then_401s(sclient):
    """The stated V2 success metric."""
    _signup(sclient)
    stolen = sclient.cookies.get(COOKIE, path=settings.REFRESH_COOKIE_PATH)
    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 200

    assert sclient.post("/auth/logout", headers=CSRF).status_code == 204

    # Replaying the very same cookie value must now fail.
    r = sclient.post("/auth/refresh", headers=CSRF, cookies={COOKIE: stolen})
    assert r.status_code == 401


def test_logout_clears_the_cookie_with_matching_attributes(sclient):
    """A clear whose attributes differ targets a different cookie and the
    browser keeps the original."""
    _signup(sclient)
    r = sclient.post("/auth/logout", headers=CSRF)
    header = _set_cookie_header(r).lower()
    assert "path=/auth" in header
    assert "httponly" in header
    assert "secure" in header
    assert "samesite=none" in header
    assert COOKIE not in sclient.cookies


def test_logout_with_no_cookie_is_still_204(sclient):
    assert sclient.post("/auth/logout", headers=CSRF).status_code == 204


def test_logout_with_an_unknown_cookie_is_still_204(sclient):
    r = sclient.post("/auth/logout", headers=CSRF, cookies={COOKIE: "garbage"})
    assert r.status_code == 204


def test_logout_is_idempotent(sclient):
    _signup(sclient)
    stolen = sclient.cookies.get(COOKIE, path=settings.REFRESH_COOKIE_PATH)
    assert sclient.post("/auth/logout", headers=CSRF).status_code == 204
    r = sclient.post("/auth/logout", headers=CSRF, cookies={COOKIE: stolen})
    assert r.status_code == 204


def test_logout_only_revokes_the_presented_session(sclient):
    """R7.8 — single-session logout, not "log out all devices"."""
    _signup(sclient)
    other = TestClient(fastapi_app, base_url="https://testserver")
    r = other.post(
        "/auth/login", json={"email": "cookie@example.com", "password": "password123"}
    )
    assert r.status_code == 200

    assert sclient.post("/auth/logout", headers=CSRF).status_code == 204
    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 401
    # The second device's session survives.
    assert other.post("/auth/refresh", headers=CSRF).status_code == 200


# --------------------------------------------------------------------------
# CSRF header (B25 decision)
# --------------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/auth/refresh", "/auth/logout"])
def test_missing_csrf_header_is_403(sclient, path):
    _signup(sclient)
    assert sclient.post(path).status_code == 403


def test_missing_csrf_header_on_logout_does_not_revoke(sclient):
    """The header check runs before logout's idempotency, so a headerless call
    must not be honoured as a logout."""
    _signup(sclient)
    assert sclient.post("/auth/logout").status_code == 403
    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 200


def test_csrf_header_value_is_not_inspected(sclient):
    """Presence is the whole point — a cross-origin page can't set the header at
    all. Requiring a particular value would add state for no extra protection."""
    _signup(sclient)
    r = sclient.post("/auth/refresh", headers={settings.REFRESH_CSRF_HEADER: "x"})
    assert r.status_code == 200


def test_other_endpoints_do_not_require_the_csrf_header(sclient):
    """Bearer auth is not an ambient credential; adding a check there would be
    cargo-culting."""
    token = _signup(sclient).json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    assert sclient.get("/auth/me", headers=h).status_code == 200
    assert (
        sclient.post(
            "/applications", json={"company": "A", "title": "B"}, headers=h
        ).status_code
        == 201
    )


# --------------------------------------------------------------------------
# B29 — credentialed CORS
# --------------------------------------------------------------------------


def test_preflight_from_an_allowlisted_origin_allows_credentials(sclient):
    r = sclient.options(
        "/auth/refresh",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": settings.REFRESH_CSRF_HEADER,
        },
    )
    assert r.status_code == 200, r.text
    assert r.headers["access-control-allow-credentials"] == "true"
    assert r.headers["access-control-allow-origin"] == ORIGIN


def test_preflight_allows_the_csrf_header(sclient):
    r = sclient.options(
        "/auth/refresh",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": settings.REFRESH_CSRF_HEADER,
        },
    )
    allowed = r.headers["access-control-allow-headers"].lower()
    assert settings.REFRESH_CSRF_HEADER.lower() in allowed


def test_preflight_from_a_foreign_origin_is_refused(sclient):
    r = sclient.options(
        "/auth/refresh",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": settings.REFRESH_CSRF_HEADER,
        },
    )
    # Starlette answers the preflight but withholds the allow-origin header,
    # which is what the browser enforces on.
    assert "access-control-allow-origin" not in r.headers


def test_simple_request_from_a_foreign_origin_gets_no_allow_origin(sclient):
    r = sclient.get("/health", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in r.headers


def test_startup_still_fails_hard_on_a_wildcard_origin():
    """The guard is now load-bearing: `SameSite=None` + credentialed CORS + `*`
    would be an open door."""
    from app.core.config import Settings

    with pytest.raises(ValueError):
        Settings(JWT_SECRET="k" * 48, CORS_ORIGINS="http://localhost:5173,*")
