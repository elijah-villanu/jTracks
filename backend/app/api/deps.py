"""Shared FastAPI dependencies.

B4 — per-user data isolation: `get_current_user` resolves the authenticated user
from the Bearer JWT. Every application/settings query in the API is scoped to
`current_user.id`, so one user can never see or address another user's data.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

# auto_error=False so we can return a consistent 401 (not 403) for missing creds.
_bearer = HTTPBearer(auto_error=False)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise _UNAUTHENTICATED

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise _UNAUTHENTICATED

    user = db.get(User, _coerce_uuid(user_id))
    if user is None:
        raise _UNAUTHENTICATED
    return user


def _coerce_uuid(value: str):
    import uuid

    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        # A malformed sub can't match any row; surface as unauthenticated.
        raise _UNAUTHENTICATED


_MISSING_CSRF_HEADER = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail=(
        f"This endpoint requires the '{settings.REFRESH_CSRF_HEADER}' header."
    ),
)


def require_refresh_csrf_header(request: Request) -> None:
    """CSRF guard for the two endpoints that read the refresh cookie (B25/B28).

    The refresh cookie is `SameSite=None`, so unlike a `Lax` cookie it *is*
    attached to cross-site requests. The custom-header requirement is the
    defense: a cross-origin page cannot set an arbitrary request header without
    a CORS preflight, and `main.py`'s strict origin allowlist refuses the
    preflight for any origin that isn't explicitly listed. The header and the
    allowlist are what make each other work — neither is sufficient alone, and
    `config.py`'s hard failure on `CORS_ORIGINS=*` is the backstop for both.

    Only `/auth/refresh` and `/auth/logout` need this. Every other authenticated
    endpoint takes an `Authorization: Bearer` header, which a cross-site page
    has no way to attach, so there is no ambient credential to abuse and no
    reason to add a check there.

    Deliberately runs **before** logout's idempotency (R7.4): a missing header
    is a `403`, not a silent `204`. "Logging out twice is not an error" is a
    statement about token state, not a licence to honour unauthenticated
    cross-site calls.
    """
    if request.headers.get(settings.REFRESH_CSRF_HEADER) is None:
        raise _MISSING_CSRF_HEADER
