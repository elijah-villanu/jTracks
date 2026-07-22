"""B7 — global ghost-days settings."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.settings import SettingsResponse, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
def get_settings(current_user: User = Depends(get_current_user)) -> SettingsResponse:
    return SettingsResponse(ghost_days_default=current_user.ghost_days_default)


@router.patch("", response_model=SettingsResponse)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SettingsResponse:
    current_user.ghost_days_default = payload.ghost_days_default
    db.commit()
    db.refresh(current_user)
    return SettingsResponse(ghost_days_default=current_user.ghost_days_default)
