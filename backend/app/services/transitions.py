"""B6 / B18 — central status-transition rule set.

Kanban is manual, but not every jump makes sense. This module is the single
source of truth for which manual status changes are allowed, and the guard that
`Saved → Applied` (and any move *into* Applied) requires a `date_applied` — the
date that starts the ghosting clock (PRD).

V2 (PRD R1.5) reshapes the matrix around the 7-value status set: `interviewing`
became `interviewing_oa`, and `failed` ("Failed Interview/OA") joined as a
terminal outcome distinct from `rejected`.

The `rejected` = "died before interview" / `failed` = "died at or after
interview" distinction is a **reporting convention only** (PRD R1.4). It is
deliberately NOT enforced here: `applied → failed` and `interviewing_oa →
rejected` are both legal. The product relies on the explicit
"Failed Interview/OA" label to keep users honest, not on a transition lockout.

Terminal statuses (Offer, Rejected, Failed) stay *manually* editable (recovery
paths below) but are excluded from *auto*-transition to Ghosted (see B9/B20).
"""
from __future__ import annotations

from app.models.application import ApplicationStatus as S

# Statuses eligible for auto-transition to Ghosted by the daily job (B9).
#
# V2/R2.1: narrowed to `applied` alone. Once an application reaches
# `interviewing_oa`, a two-week gap is normal and silently flipping it to
# `ghosted` destroys the signal — only the user makes that call now (R2.3).
GHOSTABLE_STATUSES: frozenset[S] = frozenset({S.APPLIED})

# Terminal statuses the ghosting job must never touch.
# V2/R2.2: `failed` joins `offer`/`rejected`. `failed → ghosted` remains a legal
# *manual* transition (see the matrix) but is never an automatic one.
TERMINAL_STATUSES: frozenset[S] = frozenset({S.OFFER, S.REJECTED, S.FAILED})

# Allowed *manual* transitions (excluding self-transitions, which are always
# allowed no-ops). Recovery/revert paths are intentionally permissive because
# the PRD lets users manually revert (e.g. a Ghosted app if they hear back).
#
# Encodes PRD R1.5 exactly. Two rules carried forward from V1: nothing ever
# returns to `saved`, and `saved` can only move to `applied` (a saved job the
# user decides against is deleted, not marked rejected).
ALLOWED_TRANSITIONS: dict[S, set[S]] = {
    S.SAVED: {S.APPLIED},
    S.APPLIED: {S.INTERVIEWING_OA, S.OFFER, S.REJECTED, S.FAILED, S.GHOSTED},
    S.INTERVIEWING_OA: {S.APPLIED, S.OFFER, S.REJECTED, S.FAILED, S.GHOSTED},
    S.OFFER: {S.INTERVIEWING_OA, S.REJECTED, S.FAILED},
    S.REJECTED: {S.APPLIED, S.INTERVIEWING_OA, S.FAILED},
    S.FAILED: {S.APPLIED, S.INTERVIEWING_OA, S.OFFER, S.REJECTED},
    S.GHOSTED: {S.APPLIED, S.INTERVIEWING_OA, S.OFFER, S.REJECTED, S.FAILED},
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
