"""R7.5 (revised) — refresh-token rotation, reuse detection and the grace window.

Service-level tests drive `refresh_token_service` directly; the HTTP tests at the
bottom replay the same scenarios through `/auth/refresh` and `/auth/logout`,
including a thief holding a copied cookie in a separate client.

"Past the grace window" is simulated by back-dating the rotated row's
`revoked_at` rather than sleeping, so the suite stays fast and deterministic.
"""
from __future__ import annotations

import logging
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.clock import utc_now
from app.core.config import settings
from app.core.security import hash_refresh_token
from app.db.session import SessionLocal
from app.main import app as fastapi_app
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services import refresh_token_service as svc

COOKIE = settings.REFRESH_COOKIE_NAME
CSRF = {settings.REFRESH_CSRF_HEADER: "1"}
PAST_GRACE = timedelta(seconds=settings.REFRESH_TOKEN_REUSE_GRACE_SECONDS + 5)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _user(db, email="rotate@example.com") -> User:
    u = User(email=email, hashed_password=None, ghost_days_default=14)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _row(raw) -> RefreshToken | None:
    """Fresh read in its own session, so no identity-map staleness leaks in."""
    s = SessionLocal()
    try:
        return (
            s.query(RefreshToken)
            .filter(RefreshToken.token_hash == hash_refresh_token(raw))
            .one_or_none()
        )
    finally:
        s.close()


def _live_rows(family_id=None) -> list[RefreshToken]:
    s = SessionLocal()
    try:
        q = s.query(RefreshToken).filter(RefreshToken.revoked_at.is_(None))
        if family_id is not None:
            q = q.filter(RefreshToken.family_id == family_id)
        return q.all()
    finally:
        s.close()


def _age_rotation(raw, by=PAST_GRACE) -> None:
    """Pretend `raw` was rotated `by` ago."""
    s = SessionLocal()
    try:
        row = (
            s.query(RefreshToken)
            .filter(RefreshToken.token_hash == hash_refresh_token(raw))
            .one()
        )
        assert row.revoked_at is not None, "only a rotated token can be aged"
        row.revoked_at = utc_now() - by
        s.commit()
    finally:
        s.close()


# ==========================================================================
# Service: rotation
# ==========================================================================


def test_each_login_starts_its_own_family(db):
    u = _user(db)
    a, b = svc.issue(db, u), svc.issue(db, u)
    assert _row(a).family_id != _row(b).family_id


def test_rotating_a_live_token_consumes_it_and_issues_a_successor(db):
    u = _user(db)
    old = svc.issue(db, u)

    result = svc.rotate(db, old)

    assert result is not None
    assert result.user_id == u.id
    assert result.raw_token and result.raw_token != old
    old_row, new_row = _row(old), _row(result.raw_token)
    assert old_row.revoked_at is not None
    assert old_row.replaced_by_id == new_row.id
    assert new_row.revoked_at is None
    assert new_row.family_id == old_row.family_id
    assert new_row.user_id == u.id
    # Only the hash of the successor is stored, like any other token.
    assert new_row.token_hash != result.raw_token
    assert svc.validate(db, old) is None
    assert svc.validate(db, result.raw_token) is not None


def test_rotation_does_not_extend_the_session(db):
    """The successor inherits the absolute expiry; a busy session still ends."""
    u = _user(db)
    raw = svc.issue(db, u)
    original_expiry = _row(raw).expires_at

    for _ in range(3):
        raw = svc.rotate(db, raw).raw_token

    assert _row(raw).expires_at == original_expiry


def test_a_rotation_chain_keeps_exactly_one_live_token_per_family(db):
    u = _user(db)
    raw = svc.issue(db, u)
    family = _row(raw).family_id

    for _ in range(5):
        raw = svc.rotate(db, raw).raw_token

    live = _live_rows(family)
    assert [r.token_hash for r in live] == [hash_refresh_token(raw)]


def test_rotation_rejects_unknown_empty_and_expired_tokens_without_side_effects(db):
    u = _user(db)
    assert svc.rotate(db, "") is None
    assert svc.rotate(db, "not-a-real-token") is None

    raw = svc.issue(db, u)
    s = SessionLocal()
    try:
        row = s.query(RefreshToken).one()
        row.expires_at = utc_now() - timedelta(seconds=1)
        s.commit()
    finally:
        s.close()

    assert svc.rotate(db, raw) is None
    # No successor was minted for the expired token.
    assert db.query(RefreshToken).count() == 1


def test_a_logged_out_token_is_rejected_but_is_not_treated_as_reuse(db, caplog):
    """Revoked by logout (no successor) is an ordinary dead session."""
    u = _user(db)
    raw = svc.issue(db, u)
    svc.revoke(db, raw)

    with caplog.at_level(logging.WARNING, logger="jtracks.refresh"):
        assert svc.rotate(db, raw) is None
    assert "reuse" not in caplog.text.lower()


def test_a_session_cap_revoked_token_is_rejected(db):
    u = _user(db)
    oldest = svc.issue(db, u)
    for _ in range(svc.MAX_LIVE_SESSIONS_PER_USER):
        svc.issue(db, u)
    assert svc.rotate(db, oldest) is None


# ==========================================================================
# Service: grace window
# ==========================================================================


def test_rotated_token_inside_grace_is_accepted_without_a_new_refresh_token(db):
    """Two tabs sent the old cookie; the second must not be seen as a thief."""
    u = _user(db)
    old = svc.issue(db, u)
    successor = svc.rotate(db, old).raw_token

    again = svc.rotate(db, old)

    assert again is not None
    assert again.user_id == u.id
    assert again.raw_token is None  # the browser already has `successor`
    assert svc.validate(db, successor) is not None
    assert len(_live_rows()) == 1


def test_grace_does_not_resurrect_a_session_logged_out_after_rotation(db):
    u = _user(db)
    old = svc.issue(db, u)
    successor = svc.rotate(db, old).raw_token
    svc.revoke(db, successor)

    assert svc.rotate(db, old) is None


def test_grace_can_be_disabled(db, monkeypatch):
    monkeypatch.setattr(settings, "REFRESH_TOKEN_REUSE_GRACE_SECONDS", 0)
    u = _user(db)
    old = svc.issue(db, u)
    successor = svc.rotate(db, old).raw_token
    _age_rotation(old, by=timedelta(seconds=1))

    assert svc.rotate(db, old) is None
    assert svc.validate(db, successor) is None


# ==========================================================================
# Service: reuse detection
# ==========================================================================


def test_reusing_a_rotated_token_past_grace_revokes_the_whole_family(db, caplog):
    u = _user(db)
    first = svc.issue(db, u)
    second = svc.rotate(db, first).raw_token
    third = svc.rotate(db, second).raw_token
    family = _row(first).family_id
    _age_rotation(first)

    with caplog.at_level(logging.WARNING, logger="jtracks.refresh"):
        assert svc.rotate(db, first) is None

    assert _live_rows(family) == []
    assert svc.validate(db, third) is None
    # ...and the legitimate holder of the newest token is locked out too.
    assert svc.rotate(db, third) is None
    assert "reuse detected" in caplog.text
    # Token material never reaches the log.
    for raw in (first, second, third):
        assert raw not in caplog.text
        assert hash_refresh_token(raw) not in caplog.text


def test_reuse_detection_does_not_touch_other_sessions_or_users(db):
    alice, bob = _user(db, "alice@example.com"), _user(db, "bob@example.com")
    stolen = svc.issue(db, alice)
    alice_laptop = svc.issue(db, alice)
    bob_session = svc.issue(db, bob)
    svc.rotate(db, stolen)
    _age_rotation(stolen)

    assert svc.rotate(db, stolen) is None

    assert svc.validate(db, alice_laptop) is not None
    assert svc.validate(db, bob_session) is not None


def test_a_thief_who_rotates_first_is_caught_when_the_real_user_refreshes(db):
    """Either party using the old token after the other rotated trips detection."""
    u = _user(db)
    shared = svc.issue(db, u)
    thief_token = svc.rotate(db, shared).raw_token  # thief refreshes first
    _age_rotation(shared)

    assert svc.rotate(db, shared) is None  # real user comes back later
    assert svc.rotate(db, thief_token) is None  # thief's chain is dead too


# ==========================================================================
# Service: concurrency
# ==========================================================================


def test_a_stale_claim_cannot_fork_the_family(db):
    """Two requests read the same live row; only one conditional update wins."""
    u = _user(db)
    raw = svc.issue(db, u)
    family = _row(raw).family_id

    stale = db.query(RefreshToken).filter(
        RefreshToken.token_hash == hash_refresh_token(raw)
    ).one()
    other = SessionLocal()
    try:
        assert svc.rotate(other, raw).raw_token is not None
    finally:
        other.close()

    assert svc._claim_and_issue_successor(db, stale) is None
    assert len(_live_rows(family)) == 1


def test_losing_the_rotation_race_falls_back_to_the_grace_path(db, monkeypatch):
    """The loser of a race gets an access token, not a 401 and not a fork."""
    u = _user(db)
    raw = svc.issue(db, u)
    family = _row(raw).family_id
    real_claim = svc._claim_and_issue_successor

    def racing_claim(session, row):
        # Another request rotates the token between our read and our update.
        other = SessionLocal()
        try:
            real_claim(other, other.get(RefreshToken, row.id))
        finally:
            other.close()
        return real_claim(session, row)

    monkeypatch.setattr(svc, "_claim_and_issue_successor", racing_claim)

    result = svc.rotate(db, raw)

    assert result is not None
    assert result.raw_token is None
    assert len(_live_rows(family)) == 1


# ==========================================================================
# Service: logout ends the session, not just one generation of it
# ==========================================================================


def test_revoking_an_older_generation_ends_the_session(db):
    u = _user(db)
    old = svc.issue(db, u)
    successor = svc.rotate(db, old).raw_token

    assert svc.revoke(db, old) is True
    assert svc.validate(db, successor) is None
    assert svc.revoke(db, successor) is False  # idempotent


def test_revoke_leaves_the_users_other_sessions_alone(db):
    u = _user(db)
    phone, laptop = svc.issue(db, u), svc.issue(db, u)
    phone = svc.rotate(db, phone).raw_token

    svc.revoke(db, phone)

    assert svc.validate(db, laptop) is not None


# ==========================================================================
# HTTP: /auth/refresh and /auth/logout
# ==========================================================================


@pytest.fixture
def sclient() -> TestClient:
    """https base URL so the Secure refresh cookie round-trips (see test_auth_refresh)."""
    return TestClient(fastapi_app, base_url="https://testserver")


def _client_with(raw: str) -> TestClient:
    """A second browser (or a thief) holding a copy of `raw`."""
    c = TestClient(fastapi_app, base_url="https://testserver")
    c.cookies.set(COOKIE, raw)
    return c


def _cookie(client: TestClient) -> str:
    return client.cookies.get(COOKIE, path=settings.REFRESH_COOKIE_PATH)


def _refresh_set_cookie(response) -> str | None:
    match = [h for h in response.headers.get_list("set-cookie") if h.startswith(f"{COOKIE}=")]
    return match[0] if match else None


def _signup(client, email="http-rotate@example.com"):
    r = client.post("/auth/signup", json={"email": email, "password": "password123"})
    assert r.status_code == 201, r.text
    return r


def test_refresh_sets_a_new_cookie_with_the_same_attributes(sclient):
    _signup(sclient)
    before = _cookie(sclient)

    r = sclient.post("/auth/refresh", headers=CSRF)

    assert r.status_code == 200
    header = _refresh_set_cookie(r)
    assert header is not None
    lowered = header.lower()
    for attr in ("httponly", "secure", "path=/auth", "samesite=none"):
        assert attr in lowered
    after = _cookie(sclient)
    assert after and after != before
    # The body still never carries the refresh token (R7.2).
    assert set(r.json()) == {"access_token", "token_type"}
    assert after not in r.text


def test_rotated_cookie_max_age_is_the_time_left_not_a_fresh_lifetime(sclient):
    _signup(sclient)
    s = SessionLocal()
    try:
        row = s.query(RefreshToken).one()
        row.expires_at = utc_now() + timedelta(days=1)
        s.commit()
    finally:
        s.close()

    header = _refresh_set_cookie(sclient.post("/auth/refresh", headers=CSRF)).lower()
    max_age = int(header.split("max-age=")[1].split(";")[0])
    assert 86_000 < max_age <= 86_400


def test_copied_cookie_replayed_past_grace_is_401_and_kills_the_session(sclient):
    """The headline scenario: stolen cookie, real user keeps using the app."""
    _signup(sclient)
    thief = _client_with(_cookie(sclient))

    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 200
    _age_rotation(thief.cookies.get(COOKIE))

    assert thief.post("/auth/refresh", headers=CSRF).status_code == 401
    # The detection also ends the real user's session: there's no way to tell
    # which holder is legitimate, so both go back to login.
    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 401


def test_reuse_401_is_indistinguishable_from_any_other_refresh_failure(sclient):
    _signup(sclient)
    old = _cookie(sclient)
    sclient.post("/auth/refresh", headers=CSRF)
    _age_rotation(old)

    reuse = _client_with(old).post("/auth/refresh", headers=CSRF)
    unknown = _client_with("nope-nope-nope").post("/auth/refresh", headers=CSRF)

    assert reuse.status_code == unknown.status_code == 401
    assert reuse.json() == unknown.json()
    assert _refresh_set_cookie(reuse) is None


def test_concurrent_tab_inside_grace_gets_an_access_token_and_no_cookie(sclient):
    _signup(sclient)
    second_tab = _client_with(_cookie(sclient))  # sent before tab 1's response landed

    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 200
    r = second_tab.post("/auth/refresh", headers=CSRF)

    assert r.status_code == 200
    assert _refresh_set_cookie(r) is None
    me = second_tab.get(
        "/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}
    )
    assert me.status_code == 200
    # Tab 1's (shared) cookie is unharmed.
    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 200


def test_logout_with_a_pre_rotation_cookie_still_ends_the_session(sclient):
    _signup(sclient)
    stale_tab = _client_with(_cookie(sclient))
    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 200

    assert stale_tab.post("/auth/logout", headers=CSRF).status_code == 204

    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 401


def test_logout_after_rotation_invalidates_every_generation(sclient):
    _signup(sclient)
    generations = [_cookie(sclient)]
    for _ in range(3):
        assert sclient.post("/auth/refresh", headers=CSRF).status_code == 200
        generations.append(_cookie(sclient))

    assert sclient.post("/auth/logout", headers=CSRF).status_code == 204

    for raw in generations:
        assert _client_with(raw).post("/auth/refresh", headers=CSRF).status_code == 401
