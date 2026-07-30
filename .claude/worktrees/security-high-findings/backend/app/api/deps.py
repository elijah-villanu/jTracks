"""Shared FastAPI dependencies.

B4 — per-user data isolation: `get_current_user` resolves the authenticated user
from the Bearer JWT. Every application/settings query in the API is scoped to
`current_user.id`, so one user can never see or address another user's data.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

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
