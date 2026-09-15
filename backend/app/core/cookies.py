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

from datetime import datetime, timezone

from fastapi import Request, Response

from app.core.clock import utc_now
from app.core.config import settings


def _max_age_seconds(expires_at: datetime | None) -> int:
    if expires_at is None:
        return settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    # SQLite hands back naive UTC; Postgres hands back aware values.
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return max(0, int((expires_at - utc_now()).total_seconds()))


def set_refresh_cookie(
    response: Response, raw_token: str, expires_at: datetime | None = None
) -> None:
    """Attach a refresh token to the response.

    `expires_at` is passed for a rotated token (R7.5): the successor inherits
    the session's absolute expiry, so the cookie's Max-Age must be the time
    remaining, not a fresh full lifetime. A new session omits it.
    """
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=raw_token,
        max_age=_max_age_seconds(expires_at),
        path=settings.REFRESH_COOKIE_PATH,
        secure=settings.REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )


# More values than any real browser state produces; bounds the DB lookups a
# crafted Cookie header can cause on these (rate-limited) endpoints.
_MAX_REFRESH_COOKIE_CANDIDATES = 4


def read_refresh_cookies(request: Request) -> list[str]:
    """Every value the request carries under the refresh cookie's name, in order.

    Do NOT use `request.cookies` for this cookie. A browser sends *all* cookies
    whose domain and path match, and cookies ignore ports, so another cookie
    named `jtracks_refresh` on `localhost` — the frontend's MSW mock set one
    with `Path=/`, and any other local app could — arrives alongside the real
    `Path=/auth` one. Starlette collapses duplicates into a dict where the
    last value wins, which is the stray cookie, so every refresh 401'd and
    every reload logged the user out. In production the same thing could be
    done on purpose from a sibling subdomain ("cookie tossing").

    Browsers send the longer path first, so the real cookie normally leads;
    callers still try each value rather than trusting order.
    """
    header = request.headers.get("cookie") or ""
    values: list[str] = []
    for chunk in header.split(";"):
        name, sep, value = chunk.partition("=")
        if not sep or name.strip() != settings.REFRESH_COOKIE_NAME:
            continue
        value = value.strip().strip('"')
        if value and value not in values:
            values.append(value)
            if len(values) == _MAX_REFRESH_COOKIE_CANDIDATES:
                break
    return values


def clear_refresh_cookie(response: Response) -> None:
    """Expire the refresh cookie, using the identical attributes it was set with."""
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        secure=settings.REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )
