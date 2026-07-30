"""User settings schemas (global ghost-days default)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class SettingsResponse(BaseModel):
    ghost_days_default: int


class SettingsUpdate(BaseModel):
    # 1..365 days is a sane, validated bound for the global ghosting default.
    ghost_days_default: int = Field(ge=1, le=365)
