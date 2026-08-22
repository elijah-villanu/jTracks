"""B26 — two-token configuration and minting (PRD R7.1).

Access tokens are short-lived JWTs carrying a `typ` claim; refresh tokens are
opaque random strings that are only ever stored hashed.
"""
from __future__ import annotations

import datetime as dt

import jwt
import pytest

from app.core.config import settings
from app.core.security import (
    ACCESS_TOKEN_TYPE,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_refresh_token,
    refresh_token_expiry,
)


def _claims(token: str) -> dict:
    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
        audience=settings.JWT_AUDIENCE,
        issuer=settings.JWT_ISSUER,
    )


# --------------------------------------------------------------------------
# Access token
# --------------------------------------------------------------------------


def test_access_lifetime_is_inside_the_configured_short_window():
    """R7.1 — the 7-day access token is retired; 15-30 minutes is the band."""
    assert 15 <= settings.ACCESS_TOKEN_EXPIRE_MINUTES <= 30


def test_access_token_expires_inside_the_configured_window():
    claims = _claims(create_access_token("11111111-1111-1111-1111-111111111111"))
    issued = dt.datetime.fromtimestamp(claims["iat"], dt.timezone.utc)
    expires = dt.datetime.fromtimestamp(claims["exp"], dt.timezone.utc)
    lifetime = expires - issued
    assert lifetime == dt.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    # And, concretely: well under the old 7-day token.
    assert lifetime <= dt.timedelta(minutes=30)
    assert expires > dt.datetime.now(dt.timezone.utc)


def test_access_token_carries_a_type_claim():
    claims = _claims(create_access_token("u"))
    assert claims["typ"] == ACCESS_TOKEN_TYPE


def test_a_token_without_the_type_claim_is_rejected():
    """A JWT minted for some other purpose must not authenticate a request."""
    now = dt.datetime.now(dt.timezone.utc)
    forged = jwt.encode(
        {
            "sub": "victim",
            "iat": now,
            "exp": now + dt.timedelta(minutes=5),
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    assert decode_access_token(forged) is None


def test_a_token_typed_as_something_else_is_rejected():
    now = dt.datetime.now(dt.timezone.utc)
    forged = jwt.encode(
        {
            "sub": "victim",
            "iat": now,
            "exp": now + dt.timedelta(minutes=5),
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
            "typ": "refresh",
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    assert decode_access_token(forged) is None


def test_expired_access_token_is_rejected():
    stale = create_access_token("u", expires_delta=dt.timedelta(seconds=-1))
    assert decode_access_token(stale) is None


# --------------------------------------------------------------------------
# Refresh token
# --------------------------------------------------------------------------


def test_refresh_lifetime_is_inside_the_configured_band():
    assert 7 <= settings.REFRESH_TOKEN_EXPIRE_DAYS <= 30


def test_refresh_tokens_are_opaque_not_jwts():
    """R7.1/B26 — a signed, self-describing token leaks structure for nothing,
    since the value is validated against the DB anyway."""
    raw = generate_refresh_token()
    assert raw.count(".") != 2
    with pytest.raises(jwt.DecodeError):
        jwt.get_unverified_header(raw)


def test_refresh_tokens_are_high_entropy_and_unique():
    tokens = {generate_refresh_token() for _ in range(200)}
    assert len(tokens) == 200
    assert all(len(t) >= 43 for t in tokens)


def test_stored_hash_is_not_the_value_handed_to_the_caller():
    """Security NFR: the raw value is never persisted."""
    raw = generate_refresh_token()
    stored = hash_refresh_token(raw)
    assert stored != raw
    assert raw not in stored


def test_hash_is_deterministic_so_it_can_carry_a_unique_index():
    raw = generate_refresh_token()
    assert hash_refresh_token(raw) == hash_refresh_token(raw)
    assert hash_refresh_token(raw) != hash_refresh_token(generate_refresh_token())


def test_refresh_expiry_is_utc_aware_and_in_the_future():
    exp = refresh_token_expiry()
    assert exp.tzinfo is not None
    now = dt.datetime.now(dt.timezone.utc)
    assert exp > now
    assert exp - now <= dt.timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


# --------------------------------------------------------------------------
# Startup validation is untouched by any of the above
# --------------------------------------------------------------------------


def test_weak_secret_validation_still_rejects_placeholders():
    from app.core.config import Settings

    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", JWT_SECRET="changeme")
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", JWT_SECRET="")
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", JWT_SECRET="short")
    # A real secret still passes.
    ok = Settings(ENVIRONMENT="production", JWT_SECRET="k" * 48)
    assert ok.ACCESS_TOKEN_EXPIRE_MINUTES == 30


def test_wildcard_cors_still_fails_hard():
    from app.core.config import Settings

    with pytest.raises(ValueError):
        Settings(JWT_SECRET="k" * 48, CORS_ORIGINS="*")


def test_refresh_cookie_attributes_match_the_b25_decision():
    """docs/decisions/cookie-topology-samesite.md."""
    assert settings.REFRESH_COOKIE_SAMESITE == "none"
    assert settings.REFRESH_COOKIE_SECURE is True
    assert settings.REFRESH_COOKIE_PATH == "/auth"
    assert settings.REFRESH_CSRF_HEADER == "X-Refresh-Request"
