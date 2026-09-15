"""Regression tests for the pre-deployment (Azure App Service) security pass.

Each test replays the original proof-of-concept and asserts the attack is now
*rejected*, alongside a guard against over-correction. Covers the new findings
from that pass plus the V2_SECURITY_AUDIT.md items that were still open (M1, M2,
L1, L6).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.api.routes.auth as auth_route
from app.core.config import Settings
from app.core.config import settings as live_settings
from app.core.rate_limit import client_key, limiter
from app.db.session import SessionLocal
from app.main import app as fastapi_app
from app.models.refresh_token import RefreshToken
from app.services import refresh_token_service
from app.services.google_verify import GoogleIdentity

CSRF = {live_settings.REFRESH_CSRF_HEADER: "1"}
COOKIE = live_settings.REFRESH_COOKIE_NAME


def _settings(**kw) -> Settings:
    """Build Settings without inheriting the developer's real .env."""
    base = dict(_env_file=None, DATABASE_URL="sqlite:///./x.db")
    base.update(kw)
    return Settings(**base)


def _prod(**kw) -> Settings:
    return _settings(ENVIRONMENT="production", JWT_SECRET="k" * 48, **kw)


@pytest.fixture
def rate_limits_on():
    limiter.reset()
    previous = limiter.enabled
    limiter.enabled = True
    try:
        yield
    finally:
        limiter.enabled = previous
        limiter.reset()


@pytest.fixture
def sclient() -> TestClient:
    """https base URL so the Secure refresh cookie round-trips (see test_auth_refresh)."""
    return TestClient(fastapi_app, base_url="https://testserver")


# ===================================================================
# Rate-limit client identity behind Azure App Service's front end
# ===================================================================

class _Req:
    """Just enough of a Starlette Request for `client_key`."""

    def __init__(self, xff: str | None, peer: str = "169.254.129.1"):
        self.headers = {} if xff is None else {"x-forwarded-for": xff}
        self.client = type("C", (), {"host": peer})()


def test_forwarded_client_is_read_from_the_right_not_the_left(monkeypatch):
    monkeypatch.setattr(live_settings, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(live_settings, "TRUSTED_PROXY_HOPS", 1)
    # Client forged "1.1.1.1"; Azure appended the real peer with its port.
    assert client_key(_Req("1.1.1.1, 203.0.113.7:51234")) == "203.0.113.7"


@pytest.mark.parametrize(
    "xff, expected",
    [
        ("203.0.113.7:51234", "203.0.113.7"),
        ("203.0.113.7", "203.0.113.7"),
        ("[2001:db8::1]:443", "2001:db8::1"),
        ("2001:db8::1", "2001:db8::1"),
    ],
)
def test_forwarded_port_is_stripped(monkeypatch, xff, expected):
    """ip:port keys would hand out a fresh bucket per TCP connection."""
    monkeypatch.setattr(live_settings, "TRUST_PROXY_HEADERS", True)
    assert client_key(_Req(xff)) == expected


def test_two_trusted_hops_skip_the_inner_proxy(monkeypatch):
    """App Service behind Front Door: client, front-door-edge appended by FE."""
    monkeypatch.setattr(live_settings, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(live_settings, "TRUSTED_PROXY_HOPS", 2)
    assert client_key(_Req("6.6.6.6, 198.51.100.9, 147.243.0.1:443")) == "198.51.100.9"


def test_too_few_hops_falls_back_to_the_peer(monkeypatch):
    monkeypatch.setattr(live_settings, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(live_settings, "TRUSTED_PROXY_HOPS", 2)
    assert client_key(_Req("203.0.113.7")) == "169.254.129.1"


def test_rotating_the_left_most_forwarded_entry_no_longer_evades_login_limit(
    client, register, rate_limits_on, monkeypatch
):
    """The original PoC: 30 guesses, each with a new forged left-most XFF, and
    never a single 429."""
    monkeypatch.setattr(live_settings, "TRUST_PROXY_HEADERS", True)
    register(email="owner@example.com", password="password123")
    limiter.reset()

    codes = [
        client.post(
            "/auth/login",
            json={"email": "owner@example.com", "password": f"guess{i}"},
            headers={"X-Forwarded-For": f"198.51.100.{i}, 203.0.113.7:{40000 + i}"},
        ).status_code
        for i in range(12)
    ]
    assert 429 in codes, codes
    assert codes.index(429) <= 6, codes


def test_an_attackers_failures_do_not_lock_out_a_different_client(
    client, register, rate_limits_on, monkeypatch
):
    """With the proxy trusted, the owner's IP keeps its own budget."""
    monkeypatch.setattr(live_settings, "TRUST_PROXY_HEADERS", True)
    register(email="owner2@example.com", password="password123")
    limiter.reset()

    for _ in range(8):
        client.post(
            "/auth/login",
            json={"email": "owner2@example.com", "password": "bad"},
            headers={"X-Forwarded-For": "203.0.113.7:4000"},
        )
    r = client.post(
        "/auth/login",
        json={"email": "owner2@example.com", "password": "password123"},
        headers={"X-Forwarded-For": "192.0.2.50:5000"},
    )
    assert r.status_code == 200


# ===================================================================
# Pre-account hijacking through Google account linking
# ===================================================================

def _google(monkeypatch, sub="victim-google-sub", email="victim@gmail.com"):
    identity = GoogleIdentity(google_id=sub, email=email, email_verified=True)
    monkeypatch.setattr(auth_route, "verify_google_id_token", lambda _t: identity)


def test_pre_registered_password_stops_working_once_the_owner_proves_the_email(
    sclient, monkeypatch
):
    """Attacker registers the victim's address first; the victim later signs in
    with Google. The attacker must not keep a working password."""
    attacker = TestClient(fastapi_app, base_url="https://testserver")
    r = attacker.post(
        "/auth/signup", json={"email": "victim@gmail.com", "password": "attacker-pw-1"}
    )
    assert r.status_code == 201
    attacker_refresh = attacker.cookies.get(COOKIE)

    _google(monkeypatch)
    r = sclient.post("/auth/oauth/google", json={"id_token": "tok"})
    assert r.status_code == 200
    sclient.post(
        "/applications",
        json={"company": "SecretCo", "title": "Stealth"},
        headers={"Authorization": f"Bearer {r.json()['access_token']}"},
    )

    login = attacker.post(
        "/auth/login", json={"email": "victim@gmail.com", "password": "attacker-pw-1"}
    )
    assert login.status_code == 401

    # And the session the attacker opened at signup is dead too.
    replay = TestClient(fastapi_app, base_url="https://testserver")
    replay.cookies.set(COOKIE, attacker_refresh)
    assert replay.post("/auth/refresh", headers=CSRF).status_code == 401


def test_google_sign_in_still_works_after_linking(sclient, monkeypatch):
    sclient.post("/auth/signup", json={"email": "victim@gmail.com", "password": "pw123456"})
    _google(monkeypatch)
    first = sclient.post("/auth/oauth/google", json={"id_token": "tok"})
    again = sclient.post("/auth/oauth/google", json={"id_token": "tok"})
    assert first.status_code == again.status_code == 200
    me = sclient.get(
        "/auth/me", headers={"Authorization": f"Bearer {again.json()['access_token']}"}
    )
    assert me.json()["google_id"] == "victim-google-sub"
    # The session issued by the linking exchange itself survives.
    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 200


def test_new_google_user_is_unaffected(sclient, monkeypatch):
    _google(monkeypatch, sub="fresh-sub", email="fresh@gmail.com")
    assert sclient.post("/auth/oauth/google", json={"id_token": "tok"}).status_code == 200


# ===================================================================
# V2 M2 — refresh-cookie invariants are enforced at startup
# ===================================================================

@pytest.mark.parametrize(
    "overrides",
    [
        {"REFRESH_COOKIE_SECURE": False},
        {"REFRESH_COOKIE_SECURE": False, "REFRESH_COOKIE_SAMESITE": "lax"},
        {"REFRESH_COOKIE_SAMESITE": "sometimes"},
        {"REFRESH_COOKIE_PATH": "/"},
        {"REFRESH_COOKIE_PATH": "/applications"},
    ],
)
def test_unsafe_refresh_cookie_config_is_rejected(overrides):
    with pytest.raises(ValueError, match="REFRESH_COOKIE"):
        _prod(**overrides)
    # Not just a production rule: the ADR says Secure is unconditional.
    with pytest.raises(ValueError, match="REFRESH_COOKIE"):
        _settings(ENVIRONMENT="development", **overrides)


def test_default_refresh_cookie_config_is_accepted():
    cfg = _prod()
    assert cfg.REFRESH_COOKIE_SECURE is True
    assert cfg.REFRESH_COOKIE_SAMESITE == "none"
    assert _prod(REFRESH_COOKIE_SAMESITE="None").REFRESH_COOKIE_SAMESITE == "none"
    assert _prod(REFRESH_COOKIE_PATH="/api/auth").REFRESH_COOKIE_PATH == "/api/auth"


# ===================================================================
# V2 L6 / stale .env.example — token lifetimes are bounded
# ===================================================================

@pytest.mark.parametrize(
    "overrides",
    [
        {"ACCESS_TOKEN_EXPIRE_MINUTES": 10080},  # the old .env.example value
        {"ACCESS_TOKEN_EXPIRE_MINUTES": 0},
        {"REFRESH_TOKEN_EXPIRE_DAYS": 3650},
        {"REFRESH_TOKEN_EXPIRE_DAYS": 0},
    ],
)
def test_absurd_token_lifetimes_are_rejected(overrides):
    with pytest.raises(ValueError):
        _prod(**overrides)


def test_env_example_no_longer_ships_a_week_long_access_token():
    from pathlib import Path

    text = (Path(__file__).resolve().parents[1] / ".env.example").read_text("utf-8")
    assert "ACCESS_TOKEN_EXPIRE_MINUTES=10080" not in text
    assert "ACCESS_TOKEN_EXPIRE_MINUTES=30" in text


# ===================================================================
# CORS origins: shape always, https outside development
# ===================================================================

def test_plain_http_origin_is_rejected_in_production():
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        _prod(CORS_ORIGINS="http://jtracks-web.azurewebsites.net")


@pytest.mark.parametrize(
    "origin",
    [
        "https://jtracks-web.azurewebsites.net/",
        "https://jtracks-web.azurewebsites.net/app",
        "jtracks-web.azurewebsites.net",
        "null",
    ],
)
def test_malformed_origin_is_rejected(origin):
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        _prod(CORS_ORIGINS=origin)


def test_valid_origins_are_accepted():
    cfg = _prod(CORS_ORIGINS="https://jtracks-web.azurewebsites.net,https://app.example.com")
    assert cfg.cors_origins_list == [
        "https://jtracks-web.azurewebsites.net",
        "https://app.example.com",
    ]
    # Loopback http stays usable in every environment.
    assert _prod(CORS_ORIGINS="http://localhost:5173").cors_origins_list
    assert _settings(CORS_ORIGINS="http://192.168.1.5:5173").cors_origins_list


# ===================================================================
# ENVIRONMENT left at its dev default on Azure App Service
# ===================================================================

@pytest.mark.parametrize("marker", ["WEBSITE_INSTANCE_ID", "WEBSITE_SITE_NAME"])
def test_development_mode_refuses_to_boot_on_app_service(monkeypatch, marker):
    monkeypatch.setenv(marker, "abc123")
    with pytest.raises(ValueError, match="App Service"):
        _settings(JWT_SECRET="")
    with pytest.raises(ValueError, match="App Service"):
        _settings(ENVIRONMENT="development", JWT_SECRET="k" * 48)


def test_startup_validation_errors_do_not_echo_secrets():
    """A failed boot is printed to the App Service log stream; the pydantic
    error used to include the raw input dict, JWT_SECRET and all."""
    secret = "SuperSecretSigningKey-" + "z" * 30
    db_url = "postgresql+psycopg://admin:DbPassw0rd!@db.example:5432/jtracks"
    with pytest.raises(ValueError) as excinfo:
        _settings(
            ENVIRONMENT="production",
            JWT_SECRET=secret,
            DATABASE_URL=db_url,
            CORS_ORIGINS="http://not-https.example",
        )
    message = str(excinfo.value)
    assert "SuperSecret" not in message
    assert "DbPassw0rd" not in message


def test_production_mode_boots_on_app_service(monkeypatch):
    monkeypatch.setenv("WEBSITE_INSTANCE_ID", "abc123")
    cfg = _prod(CORS_ORIGINS="https://jtracks-web.azurewebsites.net")
    assert not cfg.docs_enabled


# ===================================================================
# V2 M1 — live sessions per user are capped
# ===================================================================

def test_live_sessions_are_capped_and_the_oldest_is_revoked(sclient):
    sclient.post("/auth/signup", json={"email": "many@example.com", "password": "password123"})
    oldest = sclient.cookies.get(COOKIE)
    for _ in range(15):
        r = sclient.post(
            "/auth/login", json={"email": "many@example.com", "password": "password123"}
        )
        assert r.status_code == 200
    newest = sclient.cookies.get(COOKIE)

    db = SessionLocal()
    try:
        live = db.query(RefreshToken).filter(RefreshToken.revoked_at.is_(None)).count()
    finally:
        db.close()
    assert live == refresh_token_service.MAX_LIVE_SESSIONS_PER_USER

    for token, expected in ((oldest, 401), (newest, 200)):
        c = TestClient(fastapi_app, base_url="https://testserver")
        c.cookies.set(COOKIE, token)
        assert c.post("/auth/refresh", headers=CSRF).status_code == expected


def test_session_cap_is_per_user(sclient):
    other = TestClient(fastapi_app, base_url="https://testserver")
    other.post("/auth/signup", json={"email": "other@example.com", "password": "password123"})
    sclient.post("/auth/signup", json={"email": "busy@example.com", "password": "password123"})
    for _ in range(12):
        sclient.post("/auth/login", json={"email": "busy@example.com", "password": "password123"})
    assert other.post("/auth/refresh", headers=CSRF).status_code == 200


# ===================================================================
# V2 L1 — logout is rate limited
# ===================================================================

def test_logout_is_rate_limited(client, rate_limits_on):
    codes = {client.post("/auth/logout", headers=CSRF).status_code for _ in range(40)}
    assert 429 in codes, codes


def test_logout_still_works_under_the_limit(sclient, rate_limits_on):
    sclient.post("/auth/signup", json={"email": "bye@example.com", "password": "password123"})
    assert sclient.post("/auth/logout", headers=CSRF).status_code == 204
    assert sclient.post("/auth/refresh", headers=CSRF).status_code == 401


# ===================================================================
# Application input validation
# ===================================================================

@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(document.domain)",
        "JavaScript:alert(1)",
        " javascript:alert(1)",
        "java\tscript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "file:///etc/passwd",
    ],
)
def test_dangerous_job_url_schemes_are_rejected(client, auth_headers, url):
    r = client.post(
        "/applications", json={"company": "X", "title": "Y", "job_url": url}, headers=auth_headers
    )
    assert r.status_code == 422, (url, r.text)

    ok = client.post("/applications", json={"company": "X", "title": "Y"}, headers=auth_headers)
    r = client.patch(f"/applications/{ok.json()['id']}", json={"job_url": url}, headers=auth_headers)
    assert r.status_code == 422, (url, r.text)


@pytest.mark.parametrize(
    "url", ["https://boards.greenhouse.io/acme/jobs/1", "http://example.com/job", None]
)
def test_normal_job_urls_are_still_accepted(client, auth_headers, url):
    r = client.post(
        "/applications", json={"company": "X", "title": "Y", "job_url": url}, headers=auth_headers
    )
    assert r.status_code == 201, r.text


@pytest.mark.parametrize("field", ["company", "title", "status"])
def test_explicit_null_on_required_columns_is_a_422_not_a_500(client, auth_headers, field):
    created = client.post(
        "/applications", json={"company": "X", "title": "Y"}, headers=auth_headers
    ).json()
    r = client.patch(f"/applications/{created['id']}", json={field: None}, headers=auth_headers)
    assert r.status_code == 422, r.text


def test_nullable_fields_can_still_be_cleared(client, auth_headers):
    created = client.post(
        "/applications",
        json={"company": "X", "title": "Y", "location": "Remote", "job_url": "https://a.b/c"},
        headers=auth_headers,
    ).json()
    r = client.patch(
        f"/applications/{created['id']}",
        json={"location": None, "job_url": None, "notes": None},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["location"] is None
