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


def _strip_port(entry: str) -> str:
    """`203.0.113.7:51234` -> `203.0.113.7`; `[2001:db8::1]:443` -> `2001:db8::1`.

    Azure's front end appends the client *with its source port*. Keying on
    ip:port would give an attacker a fresh bucket per TCP connection.
    """
    entry = entry.strip()
    if entry.startswith("["):
        return entry[1:].split("]", 1)[0]
    if entry.count(":") == 1:  # IPv4 with port; bare IPv6 has several colons
        return entry.split(":", 1)[0]
    return entry


def client_key(request: Request) -> str:
    """Identify the caller for limiting purposes.

    `X-Forwarded-For` is only consulted when TRUST_PROXY_HEADERS is enabled.

    SECURITY (pre-deploy audit): this used to take the LEFT-most entry. Proxies
    such as Azure App Service's front end *append* the real peer to whatever the
    client sent, so the left-most value is attacker-chosen: rotating it per
    request evaded the login limit entirely (confirmed by PoC). The only entries
    a client cannot forge are the ones trusted proxies appended, so the client
    is the entry TRUSTED_PROXY_HOPS positions from the right.

    Leaving TRUST_PROXY_HEADERS off on App Service is not the safe option either:
    every request then arrives from the platform's front end, all users share
    one bucket, and five bad passwords from anyone lock the owner out.
    """
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            hops = [h for h in (p.strip() for p in forwarded.split(",")) if h]
            if len(hops) >= settings.TRUSTED_PROXY_HOPS:
                client = _strip_port(hops[-settings.TRUSTED_PROXY_HOPS])
                if client:
                    return client
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
