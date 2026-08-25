"""B28 — the refresh cookie: one place that knows its attributes.

See `docs/decisions/cookie-topology-samesite.md` (B25) for why the attributes
are what they are. The short version:

    HttpOnly; Secure; SameSite=None; Path=/auth

`SameSite=None` because hosting is undecided and a `Lax` cookie is not sent at
all on cross-site requests — it would work perfectly on `localhost` and then
silently break in a split frontend/API deployment. `Secure` is unconditional
(browsers require it alongside `SameSite=None`, and a flag that disables itself
in development is how these ship insecure; Chrome and Firefox both accept
`Secure` cookies over `http://localhost`). `Path=/auth` keeps the cookie off the
other authenticated endpoints, which is what confines the CSRF surface to
`/auth/refresh` and `/auth/logout`.

Set and clear live together on purpose: a deletion whose attributes don't match
the ones the cookie was set with targets a *different* cookie, and the browser
quietly keeps the original. Changing one function without the other is exactly
the bug this module exists to prevent.
"""
from __future__ import annotations

from fastapi import Response

from app.core.config import settings


def _max_age_seconds() -> int:
    return settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60


def set_refresh_cookie(response: Response, raw_token: str) -> None:
    """Attach a freshly issued refresh token to the response."""
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=raw_token,
        max_age=_max_age_seconds(),
        path=settings.REFRESH_COOKIE_PATH,
        secure=settings.REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )


def clear_refresh_cookie(response: Response) -> None:
    """Expire the refresh cookie, using the identical attributes it was set with."""
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        secure=settings.REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )
