"""Password hashing (bcrypt) and JWT issue/verify helpers.

JWTs are signed with PyJWT rather than python-jose (audit M4): python-jose pulls
in `ecdsa`, which carries an unfixed timing-attack advisory (PYSEC-2026-1325).
This app only ever uses HS256, so the vulnerable code path was never exercised —
but the smaller, maintained dependency is free to take.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from functools import lru_cache

import bcrypt
import jwt
from jwt import InvalidTokenError

from app.core.clock import utc_now
from app.core.config import settings

# V2/R7.1 — token-type claim. The access token carries it so it cannot be
# replayed at /auth/refresh, which accepts only an opaque refresh token and
# never a JWT at all.
ACCESS_TOKEN_TYPE = "access"

# Bytes of entropy in a refresh token. 48 bytes -> a 64-character urlsafe
# string; guessing one is not a threat model worth further thought.
_REFRESH_TOKEN_BYTES = 48

# bcrypt hard-limits the input to 72 bytes and (v5) raises if longer. We encode
# and truncate defensively so an over-long password never 500s the signup route.
_BCRYPT_MAX_BYTES = 72


def _pw_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_pw_bytes(password), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    """A bcrypt hash of a random string, used only to spend time.

    Built lazily and cached so importing this module (alembic, scripts) doesn't
    pay ~0.5 s. It is a hash of a value no one knows, and no user row ever
    references it, so it can never authenticate anything.
    """
    return bcrypt.hashpw(uuid.uuid4().bytes, bcrypt.gensalt()).decode("utf-8")


def dummy_verify(password: str) -> None:
    """Burn one bcrypt verification, then return.

    SECURITY (audit M5): called on the "no such user" / "OAuth-only account"
    login paths so a failed login costs the same wall-clock time whether or not
    the address exists. Without it, response time is a perfect user-enumeration
    oracle.
    """
    verify_password(password, _dummy_hash())


def create_access_token(
    subject: str | uuid.UUID,
    expires_delta: timedelta | None = None,
) -> str:
    """Issue a signed JWT whose `sub` claim is the user id.

    Claims beyond `sub`/`iat`/`exp` (audit L4): `iss` and `aud` bind the token
    to this API, so a token minted by anything else that happens to share the
    secret is rejected; `jti` gives each token a unique id, which is the hook a
    future revocation list would need.
    """
    now = utc_now()
    expire = now + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(subject),
        "iat": now,
        "exp": expire,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "jti": uuid.uuid4().hex,
        "typ": ACCESS_TOKEN_TYPE,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


# --------------------------------------------------------------------------
# Refresh tokens (V2/R7.1, R7.3)
# --------------------------------------------------------------------------


def generate_refresh_token() -> str:
    """Mint an opaque, high-entropy refresh token.

    Deliberately **not** a JWT. A refresh token is validated against the
    `refresh_tokens` table on every use, so a signature buys nothing that the
    row lookup does not already provide — and a self-describing token needlessly
    leaks the user id and issue time to anyone who gets hold of it. An opaque
    random string is a pure lookup key with no readable structure.

    The raw value is returned to the caller exactly once and is never persisted;
    only `hash_refresh_token()` of it goes to the database (security NFR).
    """
    return secrets.token_urlsafe(_REFRESH_TOKEN_BYTES)


def hash_refresh_token(raw: str) -> str:
    """Hash a refresh token for storage and lookup.

    SHA-256, not bcrypt, and that is the right call *here* specifically because
    the input is not a password: it is 48 bytes of CSPRNG output, so there is no
    guessable keyspace for a slow hash to protect and no user-chosen value to
    stretch. What is needed instead is a deterministic digest that can carry a
    unique index and be looked up in one indexed fetch — which a salted bcrypt
    hash, being different every time, cannot do.
    """
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def refresh_token_expiry(now: datetime | None = None) -> datetime:
    """Absolute expiry for a newly issued refresh token, in UTC."""
    return (now or utc_now()) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


def decode_access_token(token: str) -> str | None:
    """Return the `sub` (user id) from a valid token, or None if invalid.

    `algorithms` is an explicit single-item list, so `alg: none` and
    RS256->HS256 confusion are both rejected. `require` makes the claims
    mandatory rather than "verified if present" — a token that simply omits
    `exp` must not be treated as non-expiring.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
            options={"require": ["sub", "exp", "iat", "iss", "aud"]},
        )
    except InvalidTokenError:
        return None
    # V2/R7.1: reject anything that isn't an access token. Refresh tokens are
    # opaque and never reach this function, but the claim keeps the two
    # credentials from ever being interchangeable if that changes.
    if payload.get("typ") != ACCESS_TOKEN_TYPE:
        return None
    sub = payload.get("sub")
    return str(sub) if isinstance(sub, str) and sub else None
