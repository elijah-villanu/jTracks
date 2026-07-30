"""B6 — central status-transition rule set.

Kanban is manual, but not every jump makes sense. This module is the single
source of truth for which manual status changes are allowed, and the guard that
`Saved → Applied` (and any move *into* Applied) requires a `date_applied` — the
date that starts the ghosting clock (PRD).

Terminal statuses (Offer, Rejected) stay *manually* editable (recovery paths
below) but are excluded from *auto*-transition to Ghosted (see B9).
"""
from __future__ import annotations

from app.models.application import ApplicationStatus as S

# Statuses eligible for auto-transition to Ghosted by the daily job (B9).
GHOSTABLE_STATUSES: frozenset[S] = frozenset({S.APPLIED, S.INTERVIEWING})

# Terminal statuses the ghosting job must never touch.
TERMINAL_STATUSES: frozenset[S] = frozenset({S.OFFER, S.REJECTED})

# Allowed *manual* transitions (excluding self-transitions, which are always
# allowed no-ops). Recovery/revert paths are intentionally permissive because
# the PRD lets users manually revert (e.g. a Ghosted app if they hear back).
ALLOWED_TRANSITIONS: dict[S, set[S]] = {
    S.SAVED: {S.APPLIED},
    S.APPLIED: {S.INTERVIEWING, S.OFFER, S.REJECTED, S.GHOSTED},
    S.INTERVIEWING: {S.APPLIED, S.OFFER, S.REJECTED, S.GHOSTED},
    S.OFFER: {S.INTERVIEWING, S.REJECTED},
    S.REJECTED: {S.APPLIED, S.INTERVIEWING},
    S.GHOSTED: {S.APPLIED, S.INTERVIEWING, S.OFFER, S.REJECTED},
}

# Statuses for which a `date_applied` must exist on the record.
_REQUIRES_DATE_APPLIED = {S.APPLIED}


class TransitionError(ValueError):
    """Raised for a disallowed manual status transition."""


def is_allowed(current: S, new: S) -> bool:
    if current == new:
        return True
    return new in ALLOWED_TRANSITIONS.get(current, set())


def validate_transition(
    current: S,
    new: S,
    *,
    date_applied_present: bool,
) -> None:
    """Validate a manual status change. Raises TransitionError if not allowed.

    `date_applied_present` = will the record have a non-null date_applied after
    this update is applied (i.e. it already had one OR the patch supplies one).
    """
    if current != new and not is_allowed(current, new):
        raise TransitionError(
            f"Cannot move an application from '{current.value}' to '{new.value}'."
        )
    if new in _REQUIRES_DATE_APPLIED and not date_applied_present:
        raise TransitionError(
            f"Moving to '{new.value}' requires a 'date_applied' "
            "(this date starts the ghosting clock)."
        )
