"""Regression tests for the MEDIUM and LOW findings in SECURITY_AUDIT.md.

Companion to `test_security_regression.py` (which covers H1–H4 and M1). Each
test re-runs the original proof-of-concept and asserts the attack is now
*rejected*; if one fails, that vulnerability is back.

Nothing here touches a third-party host — outbound traffic is mocked, and the
only network targets referenced are loopback/RFC-1918.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import importlib.util
import subprocess
import time
from pathlib import Path

import httpx
import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.config import settings as live_settings
from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.main import create_app
from app.models.user import User
from app.services import auth_service
from app.services.autofill.dispatcher import autofill
from app.services.autofill.fetch import fetch_json

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _run(coro):
    return asyncio.run(coro)


def _settings(**kw) -> Settings:
    """Build Settings without inheriting the developer's real .env."""
    base = dict(_env_file=None, DATABASE_URL="sqlite:///./x.db")
    base.update(kw)
    return Settings(**base)


def _mock_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ===================================================================
# M2 — no request-body size cap; unbounded `notes`
# ===================================================================

def test_m2_five_megabyte_notes_is_rejected(client, auth_headers):
    """The original PoC: a single 5 MB `notes` value returned 201 Created."""
    resp = client.post(
        "/applications",
        json={"company": "Acme", "title": "Engineer", "notes": "A" * (5 * 1024 * 1024)},
        headers=auth_headers,
    )
    assert resp.status_code == 413, resp.status_code
    assert "too large" in resp.json()["detail"].lower()


def test_m2_oversize_notes_under_the_body_cap_hits_the_schema_bound(
    client, auth_headers
):
    """Second layer: a body small enough to pass the middleware still can't
    push 200k characters into an unbounded TEXT column."""
    resp = client.post(
        "/applications",
        json={"company": "Acme", "title": "Engineer", "notes": "A" * 200_000},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert any("notes" in str(err["loc"]) for err in resp.json()["detail"])


def test_m2_patch_notes_is_bounded_too(client, auth_headers):
    """`ApplicationUpdate` carried a second copy of the unbounded field."""
    created = client.post(
        "/applications",
        json={"company": "Acme", "title": "Engineer"},
        headers=auth_headers,
    ).json()

    resp = client.patch(
        f"/applications/{created['id']}",
        json={"notes": "A" * 200_000},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_m2_chunked_body_cannot_evade_the_content_length_check(client, auth_headers):
    """Omitting Content-Length is the obvious bypass, so the guard buffers with
    a ceiling rather than trusting the header."""

    def oversize_chunks():
        chunk = b"A" * (256 * 1024)
        for _ in range(12):  # ~3 MB, sent chunked
            yield chunk

    resp = client.post(
        "/applications",
        content=oversize_chunks(),
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    assert resp.status_code == 413, resp.status_code


def test_m2_lying_content_length_is_rejected(client, auth_headers):
    resp = client.post(
        "/applications",
        content=b'{"company":"A","title":"B"}',
        headers={
            **auth_headers,
            "Content-Type": "application/json",
            "Content-Length": "not-a-number",
        },
    )
    assert resp.status_code in (400, 413), resp.status_code


def test_m2_normal_payloads_still_work(client, auth_headers):
    """Guard against over-correction: realistic notes must still save."""
    resp = client.post(
        "/applications",
        json={
            "company": "Acme",
            "title": "Engineer",
            "notes": "Recruiter call went well. " * 100,  # ~2.6 KB
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["notes"].startswith("Recruiter call")


def test_m2_413_still_carries_cors_headers(client, auth_headers):
    """Middleware ordering: the browser must see a 413, not an opaque CORS
    failure it can't report."""
    resp = client.post(
        "/applications",
        json={"company": "A", "title": "B", "notes": "A" * (2 * 1024 * 1024)},
        headers={**auth_headers, "Origin": "http://localhost:5173"},
    )
    assert resp.status_code == 413
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


# ===================================================================
# M3 — no response-size cap on the outbound autofill fetch
# ===================================================================

def test_m3_oversize_response_is_discarded():
    huge = b'{"title":"' + b"A" * (3 * 1024 * 1024) + b'"}'

    def handler(request):
        return httpx.Response(
            200, content=huge, headers={"content-type": "application/json"}
        )

    async def go():
        async with _mock_client(handler) as c:
            return await fetch_json(c, "https://boards-api.greenhouse.io/v1/x")

    assert _run(go()) is None


def test_m3_oversize_declared_content_length_is_refused():
    def handler(request):
        return httpx.Response(
            200,
            content=b'{"title":"ok"}',
            headers={
                "content-type": "application/json",
                "content-length": str(500 * 1024 * 1024),
            },
        )

    async def go():
        async with _mock_client(handler) as c:
            return await fetch_json(c, "https://boards-api.greenhouse.io/v1/x")

    assert _run(go()) is None


def test_m3_non_json_content_type_is_not_parsed():
    """Don't hand an HTML error page — or a 3 GB video — to the JSON decoder."""

    def handler(request):
        return httpx.Response(
            200, content=b"<html>nope</html>", headers={"content-type": "text/html"}
        )

    async def go():
        async with _mock_client(handler) as c:
            return await fetch_json(c, "https://boards-api.greenhouse.io/v1/x")

    assert _run(go()) is None


def test_m3_oversize_response_surfaces_as_failed_autofill():
    """End to end: the endpoint degrades to manual entry instead of OOMing."""
    huge = b'{"jobPostingInfo":{"title":"' + b"A" * (3 * 1024 * 1024) + b'"}}'

    def handler(request):
        return httpx.Response(
            200, content=huge, headers={"content-type": "application/json"}
        )

    url = "https://globex.wd1.myworkdayjobs.com/en-US/External/job/x/Role_JR1"

    async def go():
        async with _mock_client(handler) as c:
            return await autofill(url, c)

    assert _run(go()).status == "failed"


def test_m3_normal_sized_response_still_parses():
    def handler(request):
        return httpx.Response(
            200,
            json={"title": "Engineer", "company_name": "Acme"},
            headers={"content-type": "application/json"},
        )

    async def go():
        async with _mock_client(handler) as c:
            return await autofill("https://boards.greenhouse.io/acme/jobs/123", c)

    res = _run(go())
    assert res.status == "parsed"
    assert res.fields.title == "Engineer"


# ===================================================================
# M4 — vulnerable dependencies
# ===================================================================

def test_m4_starlette_is_past_the_dos_advisories():
    """PYSEC-2026-1941/-1942 (remote DoS) need >=0.49; -2280/-2281 need 1.1.0;
    -249 needs 1.3.1. The old `starlette<0.42` pin blocked all of them."""
    from importlib.metadata import version

    from packaging.version import Version

    assert Version(version("starlette")) >= Version("1.3.1")


def test_m4_vulnerable_jose_and_ecdsa_are_gone():
    """python-jose dragged in `ecdsa` (PYSEC-2026-1325, no fix available)."""
    assert importlib.util.find_spec("jose") is None, "python-jose is back"
    assert importlib.util.find_spec("ecdsa") is None, "ecdsa is back"


def test_m4_requirements_do_not_reintroduce_the_old_pins():
    # Requirement lines only — the comments deliberately name what was removed.
    lines = [
        line.strip()
        for line in (BACKEND_ROOT / "requirements.txt")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    assert "starlette>=0.41,<0.42" not in lines
    assert "fastapi>=0.115,<0.116" not in lines
    assert not any(line.startswith("python-jose") for line in lines)
    assert any(line.startswith("pyjwt") for line in lines)


# ===================================================================
# M5 — user enumeration via the login timing oracle
# ===================================================================

def test_m5_login_timing_does_not_reveal_whether_an_account_exists(client, register):
    """The PoC measured 543.61 ms for a known address vs 0.0010 ms for an
    unknown one — a 538,230x oracle. Both paths must now run bcrypt."""
    register(email="known@example.com", password="password123")

    db = SessionLocal()
    try:
        def timed(email: str) -> float:
            start = time.perf_counter()
            try:
                auth_service.authenticate(db, email, "wrong-password")
            except auth_service.InvalidCredentials:
                pass
            return time.perf_counter() - start

        timed("warmup@example.com")  # build the cached dummy hash once

        known = min(timed("known@example.com") for _ in range(2))
        unknown = min(timed("nobody@example.com") for _ in range(2))
    finally:
        db.close()

    assert unknown > known * 0.5, (
        "unknown-account login is still measurably faster: "
        f"known={known * 1000:.2f}ms unknown={unknown * 1000:.2f}ms"
    )


def test_m5_oauth_only_account_login_also_burns_time(client):
    """A null hashed_password was the other short-circuit."""
    db = SessionLocal()
    try:
        db.add(User(email="oauth@example.com", google_id="g1", hashed_password=None))
        db.commit()

        start = time.perf_counter()
        with pytest.raises(auth_service.InvalidCredentials):
            auth_service.authenticate(db, "oauth@example.com", "guess")
        elapsed = time.perf_counter() - start
    finally:
        db.close()

    # bcrypt at the configured cost is tens of ms at minimum; an instant return
    # means the short-circuit is back.
    assert elapsed > 0.01, f"OAuth-only login returned in {elapsed * 1000:.3f}ms"


def test_m5_authentication_still_works(client, register):
    """Guard against over-correction."""
    register(email="real@example.com", password="password123")
    ok = client.post(
        "/auth/login", json={"email": "real@example.com", "password": "password123"}
    )
    assert ok.status_code == 200
    bad = client.post(
        "/auth/login", json={"email": "real@example.com", "password": "nope"}
    )
    assert bad.status_code == 401


# ===================================================================
# M6 — container / deployment hygiene
# ===================================================================

def test_m6_dockerignore_excludes_secrets_and_databases():
    """`COPY . .` with no .dockerignore baked live.db and .env into the image."""
    dockerignore = BACKEND_ROOT / ".dockerignore"
    assert dockerignore.exists(), "no .dockerignore — the build context is the repo"

    patterns = {
        line.strip()
        for line in dockerignore.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    }
    for required in (".env", "*.db", ".venv/", "tests/", ".git/"):
        assert required in patterns, f"{required} is not excluded from the image"


def test_m6_auto_create_tables_defaults_to_false():
    """Omitting the variable must not silently create_all() in production.

    Asserted against the field default rather than an instance, because
    conftest exports AUTO_CREATE_TABLES=true for the test database and
    pydantic-settings reads the real environment regardless of `_env_file`.
    """
    assert Settings.model_fields["AUTO_CREATE_TABLES"].default is False


# ===================================================================
# L1 — API docs exposed in production
# ===================================================================

def test_l1_docs_disabled_outside_development(monkeypatch):
    monkeypatch.setattr(live_settings, "ENVIRONMENT", "production")
    prod_app = create_app()

    assert prod_app.docs_url is None
    assert prod_app.redoc_url is None
    assert prod_app.openapi_url is None

    with TestClient(prod_app) as prod_client:
        assert prod_client.get("/docs").status_code == 404
        assert prod_client.get("/openapi.json").status_code == 404


def test_l1_docs_available_in_development(client):
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


# ===================================================================
# L2 — missing security headers
# ===================================================================

def test_l2_security_headers_present_on_every_response(client, auth_headers):
    for path, headers in (("/health", {}), ("/applications", auth_headers)):
        resp = client.get(path, headers=headers)
        assert resp.headers["x-content-type-options"] == "nosniff", path
        assert resp.headers["x-frame-options"] == "DENY", path
        assert resp.headers["referrer-policy"] == "no-referrer", path
        assert "frame-ancestors 'none'" in resp.headers["content-security-policy"], path


def test_l2_security_headers_present_on_error_responses(client):
    resp = client.get("/applications")  # 401, no credentials
    assert resp.status_code == 401
    assert resp.headers["x-content-type-options"] == "nosniff"


def test_l2_hsts_only_outside_development(client, monkeypatch):
    # Development must NOT send HSTS: it would pin http://localhost to HTTPS in
    # the developer's browser for a year.
    assert "strict-transport-security" not in client.get("/health").headers

    monkeypatch.setattr(live_settings, "ENVIRONMENT", "production")
    with TestClient(create_app()) as prod_client:
        assert "strict-transport-security" in prod_client.get("/health").headers


def test_l2_csp_does_not_break_the_dev_docs(client):
    """Swagger UI loads assets from a CDN; a blanket default-src 'none' would
    render a blank page."""
    resp = client.get("/docs")
    assert resp.status_code == 200
    assert "content-security-policy" not in resp.headers


# ===================================================================
# L3 — unencoded path interpolation into the Greenhouse API URL
# ===================================================================

def test_l3_board_token_cannot_inject_query_parameters():
    """`token` is `[^/]+`, so it can carry `?` and `&`. Percent-encoded, those
    stay part of the path instead of reshaping the outbound request."""
    seen = {}

    def handler(request):
        seen["url"] = request.url
        return httpx.Response(
            200, json={"title": "Engineer"}, headers={"content-type": "application/json"}
        )

    url = "https://boards.greenhouse.io/acme?admin=true&x=1/jobs/123"

    async def go():
        async with _mock_client(handler) as c:
            return await autofill(url, c)

    _run(go())

    fetched = seen["url"]
    assert fetched.params.get("admin") is None, f"query injected: {fetched}"
    assert fetched.params.get("questions") == "false"
    assert "%3F" in str(fetched) or "%3f" in str(fetched)


def test_l3_normal_board_tokens_are_unchanged():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        return httpx.Response(
            200, json={"title": "Engineer"}, headers={"content-type": "application/json"}
        )

    async def go():
        async with _mock_client(handler) as c:
            return await autofill("https://boards.greenhouse.io/acme-corp/jobs/123", c)

    assert _run(go()).status == "parsed"
    assert "/boards/acme-corp/jobs/123" in seen["url"]


# ===================================================================
# L4 — thin JWT claims
# ===================================================================

def _claims(token: str) -> dict:
    return jwt.decode(
        token,
        live_settings.JWT_SECRET,
        algorithms=[live_settings.JWT_ALGORITHM],
        audience=live_settings.JWT_AUDIENCE,
        issuer=live_settings.JWT_ISSUER,
    )


def test_l4_issued_tokens_carry_iss_aud_jti(client, register):
    token, _headers = register(email="claims@example.com")
    payload = _claims(token)
    assert payload["iss"] == live_settings.JWT_ISSUER
    assert payload["aud"] == live_settings.JWT_AUDIENCE
    assert payload["jti"]
    assert payload["exp"] > payload["iat"]


def test_l4_jti_is_unique_per_token(client, register):
    token_a, _ = register(email="a@example.com")
    token_b, _ = register(email="b@example.com")
    assert _claims(token_a)["jti"] != _claims(token_b)["jti"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "some-other-service"},  # minted for a different audience
        {"iss": "attacker"},            # different issuer
        {"aud": None},                  # claim simply omitted
        {"iss": None},
        {"exp": None},                  # a token that never expires
    ],
)
def test_l4_tokens_with_wrong_or_missing_claims_are_rejected(
    client, register, overrides
):
    """Even holding the signing key, a token that isn't *for this API* fails."""
    _token, headers = register(email="victim2@example.com")
    victim_id = client.get("/auth/me", headers=headers).json()["id"]

    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": victim_id,
        "iat": now,
        "exp": now + dt.timedelta(hours=1),
        "iss": live_settings.JWT_ISSUER,
        "aud": live_settings.JWT_AUDIENCE,
    }
    for key, value in overrides.items():
        if value is None:
            payload.pop(key)
        else:
            payload[key] = value

    forged = jwt.encode(
        payload, live_settings.JWT_SECRET, algorithm=live_settings.JWT_ALGORITHM
    )
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert resp.status_code == 401, overrides


def test_l4_expired_token_is_rejected(client, register):
    _token, headers = register(email="expired@example.com")
    victim_id = client.get("/auth/me", headers=headers).json()["id"]

    stale = create_access_token(victim_id, expires_delta=dt.timedelta(seconds=-1))
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {stale}"})
    assert resp.status_code == 401


def test_l4_alg_none_is_still_rejected(client, register):
    """Algorithm confusion, re-verified after the python-jose -> PyJWT swap."""
    _token, headers = register(email="algnone@example.com")
    victim_id = client.get("/auth/me", headers=headers).json()["id"]

    unsigned = jwt.encode({"sub": victim_id}, key="", algorithm="none")
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {unsigned}"})
    assert resp.status_code == 401


# ===================================================================
# L5 — CORS hardening
# ===================================================================

def test_l5_wildcard_origin_is_rejected_at_startup():
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        _settings(ENVIRONMENT="production", JWT_SECRET="x" * 40, CORS_ORIGINS="*")

    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        _settings(
            ENVIRONMENT="production",
            JWT_SECRET="x" * 40,
            CORS_ORIGINS="http://localhost:5173,*",
        )


def test_l5_credentialed_cors_is_on_and_strictly_scoped(client):
    """CHANGED IN V2 (PRD R7.7 / B29). V1 asserted `allow_credentials=False`,
    which was correct then: the only credential was an `Authorization: Bearer`
    header the browser never attaches on its own, so credentialed CORS bought
    nothing and only widened the blast radius of a mis-set origin.

    V2 adds a `SameSite=None` refresh cookie, which *is* an ambient credential,
    and the browser will not send it cross-origin without this. The audit's
    underlying concern is unchanged and is now enforced by the two assertions
    below plus `test_l5_wildcard_origin_rejected` above: credentials are only
    ever granted to an explicitly allow-listed origin, and a wildcard origin
    fails at startup rather than being silently combined with credentials.
    """
    resp = client.options(
        "/applications",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-credentials") == "true"
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_l5_credentials_are_not_granted_to_a_foreign_origin(client):
    """The half of the V1 guarantee that still has to hold: an origin outside
    the allowlist gets no allow-origin header, so the browser blocks it before
    `allow_credentials` is ever relevant."""
    resp = client.options(
        "/applications",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") is None


def test_l5_unknown_origin_is_not_reflected(client):
    resp = client.get("/health", headers={"Origin": "https://evil.example"})
    assert resp.headers.get("access-control-allow-origin") != "https://evil.example"


# ===================================================================
# L6 — .env.example must be committable, real secrets must not be
# ===================================================================

def _is_ignored(path: Path) -> bool:
    try:
        result = subprocess.run(
            ["git", "check-ignore", str(path)],
            cwd=BACKEND_ROOT,
            capture_output=True,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError):  # pragma: no cover
        pytest.skip("git not available")
    return result.returncode == 0


def test_l6_env_example_is_not_gitignored():
    example = BACKEND_ROOT / ".env.example"
    assert example.exists(), ".env.example documents deployment; it must exist"
    assert not _is_ignored(example), ".env.example is still gitignored"


def test_l6_real_env_and_databases_are_still_gitignored():
    for name in (".env", ".env.production", "live.db"):
        assert _is_ignored(BACKEND_ROOT / name), f"{name} is NOT ignored"
