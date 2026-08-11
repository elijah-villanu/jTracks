"""Autofill request/response schemas.

The response is a discriminated-ish union of three shapes the frontend (F5)
switches on:
  - success:      {"status": "parsed",      "fields": {...}}
  - unsupported:  {"status": "unsupported", "url": "..."}
  - failed:       {"status": "failed",      "url": "..."}
All three always carry the original URL so the frontend can pre-fill the manual
review form even on the fall-back paths.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.models.application import ApplicationStatus


class AutofillRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class ParsedFields(BaseModel):
    """Fields extracted from a supported posting. All optional except what the
    parser could confidently find; `company`/`title` may be null if absent."""

    company: str | None = None
    title: str | None = None
    location: str | None = None
    salary: str | None = None
    date_posted: date | None = None
    job_url: str
    # Per PRD: a successfully-parsed link defaults to Applied w/ date_applied today.
    suggested_status: ApplicationStatus = ApplicationStatus.APPLIED


class AutofillParsed(BaseModel):
    status: Literal["parsed"] = "parsed"
    source: str  # "greenhouse" | "workday"
    fields: ParsedFields


class AutofillUnsupported(BaseModel):
    status: Literal["unsupported"] = "unsupported"
    url: str


class AutofillFailed(BaseModel):
    status: Literal["failed"] = "failed"
    url: str
    reason: str | None = None
