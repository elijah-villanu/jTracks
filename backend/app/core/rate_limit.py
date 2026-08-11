"""Per-IP rate limiting for brute-forceable endpoints (audit H4).

Signup is open to the internet, so `/auth/login` was an unlimited password
oracle and `/auth/signup` an unlimited account factory (which is also how an
attacker obtained the credential needed to reach the autofill endpoint). bcrypt's
cost is friction, not a control.

Storage is in-process memory, which is the right size for this deployment: a
single API instance. If this is ever scaled horizontally, point `Limiter` at a
shared Redis URI or each replica will enforce the budget independently.
"""
from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.config import settings


def client_key(request: Request) -> str:
    """Identify the caller for limiting purposes.

    `X-Forwarded-For` is client-controlled unless a proxy you own overwrites it,
    so it is only consulted when TRUST_PROXY_HEADERS is explicitly enabled.
    Trusting it by default would let an attacker rotate the header per request
    and evade every limit.
    """
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Left-most entry is the original client per RFC 7239 conventions.
            return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(
    key_func=client_key,
    enabled=settings.RATE_LIMIT_ENABLED,
    # X-RateLimit-* headers on *successful* responses would require every
    # limited endpoint to take a `response: Response` parameter, which would
    # reshape handler signatures for a cosmetic benefit. The 429 itself still
    # carries Retry-After, which is the part a client actually needs.
    headers_enabled=False,
)
