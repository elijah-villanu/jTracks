"""Regression tests for the HIGH findings in SECURITY_AUDIT.md.

Each test re-runs the original proof-of-concept and asserts the attack is now
*rejected*. If one of these ever fails, the corresponding vulnerability is back.

Only loopback/RFC-1918 targets are used — nothing here probes a third party.
"""
from __future__ import annotations

import asyncio
import ipaddress

import httpx
import pytest
from jose import jwt

import app.api.routes.auth as auth_route
import app.services.autofill.dispatcher as dispatcher_mod
from app.core.config import Settings
from app.core.rate_limit import limiter
from app.services import auth_service
from app.services.autofill import greenhouse, net_guard, workday
from app.services.autofill.dispatcher import autofill
from app.services.google_verify import GoogleIdentity


def _run(coro):
    return asyncio.run(coro)


# ===================================================================
# H1 — SSRF via the Workday autofill parser
# ===================================================================

def test_h1_workday_never_emits_attacker_scheme():
    """The CXS URL is always https, never the scheme the user supplied."""
    built = workday._build_cxs_url(
        "http://globex.wd1.myworkdayjobs.com/en-US/External/job/x/Role_JR1"
    )
    assert built is not None
    assert built.startswith("https://"), built


def test_h1_workday_rejects_lookalike_domain():
    """The exact PoC host is no longer buildable."""
    assert workday._build_cxs_url("http://internal.notmyworkdayjobs.com/s/job/x") is None


def test_h1_workday_strips_userinfo_and_port():
    """`evil.com@` must not end up in the fetched URL, nor drive the tenant."""
    built = workday._build_cxs_url(
        "https://evil.com@globex.myworkdayjobs.com:8080/External/job/x/Role_JR1"
    )
    assert built is not None
    assert "evil.com" not in built
    assert ":8080" not in built
    assert built.startswith("https://globex.myworkdayjobs.com/wday/cxs/globex/")


def test_h1_lookalike_domains_never_reach_the_network(monkeypatch):
    """End-to-end: the PoC URLs now short-circuit to `unsupported`, no request."""
    attempted: list[str] = []

    class ExplodingClient:
        def __init__(self, **kwargs):
            attempted.append("CLIENT_CREATED")

        async def get(self, url, **kw):  # pragma: no cover - must not run
            attempted.append(url)
            raise AssertionError(f"outbound request was made to {url}")

        async def aclose(self):
            pass

    monkeypatch.setattr(dispatcher_mod.httpx, "AsyncClient", ExplodingClient)

    for url in (
        "http://internal.notmyworkdayjobs.com/site/job/x",
        "https://boards.evilgreenhouse.io/acme/jobs/123",
        "http://169-254-169-254.myworkdayjobs.com.evil.com/s/job/x",
    ):
        assert _run(autofill(url)).status == "unsupported", url

    assert attempted == [], f"no client should have been built, got {attempted}"


def test_h1_guard_blocks_non_https_scheme():
    for url in (
        "http://boards.greenhouse.io/x",
        "file:///etc/passwd",
        "gopher://boards.greenhouse.io/x",
    ):
        with pytest.raises(net_guard.BlockedOutboundRequest):
            net_guard.assert_safe_outbound_url(url)


def test_h1_guard_blocks_non_allowlisted_host():
    with pytest.raises(net_guard.BlockedOutboundRequest):
        net_guard.assert_safe_outbound_url("https://169.254.169.254/latest/meta-data/")


def test_h1_guard_blocks_allowlisted_host_resolving_to_loopback():
    """The DNS-controlled variant: allowed name, internal address."""
    with pytest.raises(net_guard.BlockedOutboundRequest) as exc:
        net_guard.assert_safe_outbound_url(
            "https://localhost.greenhouse.io/x",
            domains=("localhost.greenhouse.io",),  # pretend it's allowlisted
        )
    # Either it doesn't resolve or it resolves to loopback — both are refusals.
    assert "non-public address" in str(exc.value) or "could not resolve" in str(exc.value)


@pytest.mark.parametrize(
    "addr",
    [
        "127.0.0.1",          # loopback
        "169.254.169.254",    # cloud metadata (link-local)
        "10.0.0.5",           # private
        "192.168.1.1",        # private
        "172.16.0.1",         # private
        "0.0.0.0",            # unspecified
        "::1",                # IPv6 loopback
        "fd00::1",            # IPv6 unique-local
        "::ffff:127.0.0.1",   # IPv4-mapped IPv6 — the sneaky one
        "::ffff:169.254.169.254",
    ],
)
def test_h1_blocked_address_ranges(addr):
    assert net_guard.is_blocked_address(ipaddress.ip_address(addr)) is True


def test_h1_public_address_allowed():
    assert net_guard.is_blocked_address(ipaddress.ip_address("93.184.216.34")) is False


def test_h1_dispatcher_disables_redirects_and_installs_guard(monkeypatch):
    """Redirect-chasing was the second half of the SSRF; confirm it's off."""
    captured: dict = {}

    class RecordingClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def get(self, url, **kw):
            raise httpx.ConnectError("no network in test")

        async def aclose(self):
            pass

    monkeypatch.setattr(dispatcher_mod.httpx, "AsyncClient", RecordingClient)
    _run(autofill("https://boards.greenhouse.io/acme/jobs/123"))

    assert captured.get("follow_redirects") is False
    hooks = captured.get("event_hooks") or {}
    assert net_guard.ssrf_request_hook in hooks.get("request", [])


def test_h1_blocked_request_surfaces_as_failed_not_500(monkeypatch):
    """A blocked probe returns a structured result, never an exception."""

    async def blocked(url, client):
        raise net_guard.BlockedOutboundRequest("simulated block")

    monkeypatch.setattr(dispatcher_mod.greenhouse, "parse", blocked)
    res = _run(autofill("https://boards.greenhouse.io/acme/jobs/1"))
    assert res.status == "failed"
    assert res.reason == "blocked_host"


# ===================================================================
# M1 — suffix confusion (the gate that made H1 reachable)
# ===================================================================

def test_m1_lookalike_domains_rejected():
    assert greenhouse.matches("boards.evilgreenhouse.io") is False
    assert workday.matches("internal.notmyworkdayjobs.com") is False
    assert greenhouse.matches("greenhouse.io.evil.com") is False


def test_m1_legitimate_hosts_still_accepted():
    assert greenhouse.matches("boards.greenhouse.io") is True
    assert greenhouse.matches("job-boards.greenhouse.io") is True
    assert greenhouse.matches("greenhouse.io") is True
    assert workday.matches("globex.wd1.myworkdayjobs.com") is True
    assert workday.matches("globex.wd1.myworkdayjobs.com.") is True  # trailing dot


# ===================================================================
# H2 — weak/missing JWT secret
# ===================================================================

def _settings(**kw):
    """Build Settings without inheriting the developer's real .env."""
    base = dict(_env_file=None, DATABASE_URL="sqlite:///./x.db")
    base.update(kw)
    return Settings(**base)


@pytest.mark.parametrize(
    "secret",
    [
        "dev-insecure-secret-change-me",     # the old hardcoded default
        "change-me-in-real-deployments",     # the old docker-compose value
        "change-me-to-a-long-random-string",  # the old .env.example value
    ],
)
def test_h2_placeholder_secrets_rejected_outside_development(secret):
    with pytest.raises(ValueError, match="placeholder"):
        _settings(ENVIRONMENT="production", JWT_SECRET=secret)


def test_h2_missing_secret_rejected_outside_development():
    with pytest.raises(ValueError, match="JWT_SECRET must be set"):
        _settings(ENVIRONMENT="production", JWT_SECRET="")


def test_h2_short_secret_rejected_outside_development():
    with pytest.raises(ValueError, match="at least 32"):
        _settings(ENVIRONMENT="staging", JWT_SECRET="tooshort")


def test_h2_strong_secret_accepted():
    strong = "H8mS3kq2Vt6Lp0Zx9Rw4Nc7Yb1Ad5Ef8Gh2Jk6Mn0Qs"
    cfg = _settings(ENVIRONMENT="production", JWT_SECRET=strong)
    assert cfg.JWT_SECRET == strong


def test_h2_development_generates_ephemeral_secret():
    """No hardcoded key ships; dev gets a random one instead."""
    cfg = _settings(ENVIRONMENT="development", JWT_SECRET="")
    assert len(cfg.JWT_SECRET) >= 32
    assert cfg.JWT_SECRET not in {
        "dev-insecure-secret-change-me",
        "change-me-in-real-deployments",
    }
    # Two instances must not share a key.
    assert cfg.JWT_SECRET != _settings(ENVIRONMENT="development", JWT_SECRET="").JWT_SECRET


def test_h2_token_forged_with_old_default_is_rejected(client, register):
    """The original PoC: sign with the published default, expect a 401."""
    _token, headers = register(email="victim@example.com")
    victim_id = client.get("/auth/me", headers=headers).json()["id"]

    forged = jwt.encode(
        {"sub": victim_id}, "dev-insecure-secret-change-me", algorithm="HS256"
    )
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert resp.status_code == 401


# ===================================================================
# H3 — Google OAuth account takeover via unverified email
# ===================================================================

def test_h3_upsert_rejects_unverified_email(client):
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        with pytest.raises(auth_service.UnverifiedEmail):
            auth_service.upsert_google_user(
                db, "google-evil", "victim@example.com", email_verified=False
            )
    finally:
        db.close()


def test_h3_oauth_with_unverified_email_returns_401_and_does_not_link(
    client, monkeypatch
):
    """The full takeover scenario: victim keeps their account."""
    client.post(
        "/auth/signup", json={"email": "victim@corp.com", "password": "password123"}
    )

    attacker = GoogleIdentity(
        google_id="attacker-google-id", email="victim@corp.com", email_verified=False
    )
    monkeypatch.setattr(auth_route, "verify_google_id_token", lambda _t: attacker)

    resp = client.post("/auth/oauth/google", json={"id_token": "forged"})
    assert resp.status_code == 401

    # The critical assertion: no google_id was grafted onto the victim's row.
    victim_login = client.post(
        "/auth/login", json={"email": "victim@corp.com", "password": "password123"}
    )
    assert victim_login.status_code == 200
    me = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {victim_login.json()['access_token']}"},
    )
    assert me.json()["google_id"] is None


def test_h3_verifier_rejects_unverified_claim(monkeypatch):
    """The boundary layer, independent of the service-level check."""
    import app.services.google_verify as gv

    monkeypatch.setattr(gv.settings, "GOOGLE_CLIENT_ID", "test-client-id")

    class _FakeIdToken:
        @staticmethod
        def verify_oauth2_token(token, request, audience):
            return {
                "iss": "https://accounts.google.com",
                "sub": "123",
                "email": "victim@corp.com",
                "email_verified": False,
            }

    monkeypatch.setitem(
        __import__("sys").modules, "google.oauth2.id_token", _FakeIdToken
    )
    with pytest.raises(gv.GoogleVerificationError, match="not verified"):
        gv.verify_google_id_token("tok")


def test_h3_verified_email_still_links(client, monkeypatch):
    """Guard against over-correction: legitimate linking must still work."""
    client.post(
        "/auth/signup", json={"email": "ok@corp.com", "password": "password123"}
    )
    identity = GoogleIdentity(
        google_id="google-legit", email="ok@corp.com", email_verified=True
    )
    monkeypatch.setattr(auth_route, "verify_google_id_token", lambda _t: identity)

    resp = client.post("/auth/oauth/google", json={"id_token": "tok"})
    assert resp.status_code == 200
    me = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {resp.json()['access_token']}"},
    )
    assert me.json()["google_id"] == "google-legit"


# ===================================================================
# H4 — no rate limiting on auth endpoints
# ===================================================================

@pytest.fixture
def rate_limits_on():
    """Enable the limiter for one test, then restore shared state."""
    limiter.reset()
    previous = limiter.enabled
    limiter.enabled = True
    try:
        yield
    finally:
        limiter.enabled = previous
        limiter.reset()


def test_h4_login_brute_force_is_throttled(client, register, rate_limits_on):
    """The original PoC returned {401} for 30 straight attempts."""
    register(email="target@example.com", password="password123")

    codes = []
    for _ in range(12):
        r = client.post(
            "/auth/login",
            json={"email": "target@example.com", "password": "wrong-guess"},
        )
        codes.append(r.status_code)

    assert 429 in codes, f"no throttling observed: {codes}"
    # Budget is 5/minute, so guessing stops well before the 12th attempt.
    assert codes.index(429) <= 6, codes


def test_h4_signup_flood_is_throttled(client, rate_limits_on):
    codes = []
    for i in range(8):
        r = client.post(
            "/auth/signup",
            json={"email": f"flood{i}@example.com", "password": "password123"},
        )
        codes.append(r.status_code)

    assert 429 in codes, f"unlimited account creation: {codes}"


def test_h4_limiter_disabled_in_tests_by_default(client, register):
    """Sanity check on the conftest switch, so the suite stays deterministic."""
    assert limiter.enabled is False
    for i in range(6):
        r = client.post(
            "/auth/signup",
            json={"email": f"nolimit{i}@example.com", "password": "password123"},
        )
        assert r.status_code == 201


def test_h4_forwarded_header_ignored_unless_trusted(client, register, rate_limits_on):
    """Spoofing X-Forwarded-For must not reset the budget."""
    register(email="spoof@example.com", password="password123")

    codes = []
    for i in range(12):
        r = client.post(
            "/auth/login",
            json={"email": "spoof@example.com", "password": "nope"},
            headers={"X-Forwarded-For": f"10.0.0.{i}"},  # a "new" client each time
        )
        codes.append(r.status_code)

    assert 429 in codes, f"header spoofing evaded the limit: {codes}"
