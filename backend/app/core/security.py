"""Password hashing (bcrypt) and JWT issue/verify helpers.

JWTs are signed with PyJWT rather than python-jose (audit M4): python-jose pulls
in `ecdsa`, which carries an unfixed timing-attack advisory (PYSEC-2026-1325).
This app only ever uses HS256, so the vulnerable code path was never exercised —
but the smaller, maintained dependency is free to take.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import bcrypt
import jwt
from jwt import InvalidTokenError

from app.core.config import settings

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
    now = datetime.now(timezone.utc)
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
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


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
    sub = payload.get("sub")
    return str(sub) if isinstance(sub, str) and sub else None
