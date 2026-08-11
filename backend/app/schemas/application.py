"""Application request/response schemas."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.application import ApplicationStatus

# SECURITY (audit M2): `notes` maps to an unbounded TEXT column and was the one
# string field with no ceiling — a 5 MB value was accepted (confirmed by PoC).
# 10k characters is several pages of prose, far beyond the field's purpose, and
# the body-size middleware in app/core/middleware.py backstops it.
_NOTES_MAX_LENGTH = 10_000


class ApplicationBase(BaseModel):
    company: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    job_url: str | None = Field(default=None, max_length=2048)
    location: str | None = Field(default=None, max_length=255)
    salary: str | None = Field(default=None, max_length=255)
    date_posted: date | None = None
    date_saved: date | None = None
    date_applied: date | None = None
    ghost_days_override: int | None = Field(default=None, ge=1, le=365)
    notes: str | None = Field(default=None, max_length=_NOTES_MAX_LENGTH)


class ApplicationCreate(ApplicationBase):
    status: ApplicationStatus = ApplicationStatus.SAVED


class ApplicationUpdate(BaseModel):
    """PATCH — every field optional. `status` triggers B6 transition validation."""

    company: str | None = Field(default=None, min_length=1, max_length=255)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    status: ApplicationStatus | None = None
    job_url: str | None = Field(default=None, max_length=2048)
    location: str | None = Field(default=None, max_length=255)
    salary: str | None = Field(default=None, max_length=255)
    date_posted: date | None = None
    date_saved: date | None = None
    date_applied: date | None = None
    ghost_days_override: int | None = Field(default=None, ge=1, le=365)
    notes: str | None = Field(default=None, max_length=_NOTES_MAX_LENGTH)

    model_config = {"extra": "forbid"}


class ApplicationResponse(ApplicationBase):
    id: uuid.UUID
    user_id: uuid.UUID
    status: ApplicationStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
