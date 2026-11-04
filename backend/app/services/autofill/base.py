"""Shared autofill parser interface + helpers.

Every parser returns a `ParsedFields` on success or `None` to signal "I couldn't
extract this" (unsupported/failed) — parsers must never raise for expected
failure modes; the dispatcher (B13) turns None / exceptions into a graceful
fall-back response.
"""
from __future__ import annotations

from datetime import date, datetime

from app.schemas.autofill import ParsedFields


def parse_iso_date(value: str | None) -> date | None:
    """Best-effort ISO date/datetime -> date. Returns None on anything odd."""
    if not value:
        return None
    text = str(value).strip()
    try:
        # Handle trailing Z and full datetimes.
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(text).date()
        except ValueError:
            return date.fromisoformat(text[:10])
    except (ValueError, TypeError):
        return None


__all__ = ["ParsedFields", "parse_iso_date"]
