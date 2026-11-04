"""Application request/response schemas."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator

from app.models.application import ApplicationStatus

# SECURITY (audit M2): `notes` maps to an unbounded TEXT column and was the one
# string field with no ceiling — a 5 MB value was accepted (confirmed by PoC).
# 10k characters is several pages of prose, far beyond the field's purpose, and
# the body-size middleware in app/core/middleware.py backstops it.
_NOTES_MAX_LENGTH = 10_000

_ALLOWED_JOB_URL_SCHEMES = frozenset({"http", "https"})


def _check_job_url(value: str | None) -> str | None:
    """Refuse `javascript:`, `data:` and other non-web schemes in `job_url`.

    SECURITY (pre-deploy audit): the field accepted any string, including
    `javascript:alert(document.domain)` (confirmed by PoC). Nothing renders it
    as a link today, but a "job posting" field is exactly what a future
    "open posting" button would drop into `href`, and the frontend would then
    inherit a stored-XSS sink. `urlsplit` strips leading whitespace/control
    characters and embedded tabs/newlines the same way browsers do, so
    `" java\\tscript:"` is still judged as `javascript`.
    """
    if value is None:
        return value
    scheme = urlsplit(value).scheme.lower()
    if scheme and scheme not in _ALLOWED_JOB_URL_SCHEMES:
        raise ValueError("job_url must be an http(s) URL")
    return value


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

    # Input-only: not on ApplicationBase, so ApplicationResponse never 500s
    # serialising a row stored before this check existed.
    job_url_scheme_check = field_validator("job_url")(_check_job_url)


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

    job_url_scheme_check = field_validator("job_url")(_check_job_url)

    @field_validator("company", "title", "status", mode="before")
    @classmethod
    def _not_explicitly_null(cls, value):
        """Omitting these fields is fine; sending `null` for them is not.

        They are NOT NULL columns. An explicit `{"company": null}` passed the
        schema (the `None` default doubles as "not sent"), reached `setattr`,
        and surfaced as an IntegrityError 500 (confirmed by PoC). Validators
        don't run on omitted fields, so this only rejects the explicit null.
        """
        if value is None:
            raise ValueError("may be omitted but cannot be null")
        return value


class ApplicationResponse(ApplicationBase):
    id: uuid.UUID
    user_id: uuid.UUID
    status: ApplicationStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
