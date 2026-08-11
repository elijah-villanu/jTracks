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
    # No rate-limit headers on any response, including the 429. slowapi's
    # `_inject_headers` is all-or-nothing: `headers_enabled` gates X-RateLimit-*
    # and Retry-After together, and enabling it makes every limited endpoint
    # need a `response: Response` parameter for the *success* path. Clients
    # therefore get no machine-readable backoff signal and must treat a 429 as
    # "retry later" with their own backoff; the limit windows are documented in
    # API_SPEC_V1.md. Flip this to True (and add the parameter to each limited
    # handler) if a client ever needs Retry-After.
    headers_enabled=False,
)
