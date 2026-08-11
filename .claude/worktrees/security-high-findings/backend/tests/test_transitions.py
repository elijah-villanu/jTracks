"""B6 — status-transition rules (pure unit tests)."""
from __future__ import annotations

import itertools

import pytest

from app.models.application import ApplicationStatus as S
from app.services.transitions import (
    ALLOWED_TRANSITIONS,
    TransitionError,
    is_allowed,
    validate_transition,
)

ALL = list(S)


def test_self_transitions_always_allowed():
    for s in ALL:
        assert is_allowed(s, s) is True


@pytest.mark.parametrize(
    "current,new",
    [(c, n) for c, targets in ALLOWED_TRANSITIONS.items() for n in targets],
)
def test_allowed_transitions(current, new):
    assert is_allowed(current, new) is True


@pytest.mark.parametrize(
    "current,new",
    [
        (c, n)
        for c, n in itertools.product(ALL, ALL)
        if c != n and n not in ALLOWED_TRANSITIONS.get(c, set())
    ],
)
def test_disallowed_transitions(current, new):
    assert is_allowed(current, new) is False
    with pytest.raises(TransitionError):
        validate_transition(current, new, date_applied_present=True)


def test_saved_to_applied_requires_date_applied():
    with pytest.raises(TransitionError):
        validate_transition(S.SAVED, S.APPLIED, date_applied_present=False)
    # With a date it's fine.
    validate_transition(S.SAVED, S.APPLIED, date_applied_present=True)


def test_ghosted_can_be_manually_reverted():
    # PRD: users may manually revert a Ghosted application if they hear back.
    for target in (S.APPLIED, S.INTERVIEWING, S.OFFER, S.REJECTED):
        assert is_allowed(S.GHOSTED, target) is True


def test_saved_cannot_jump_to_interviewing_or_offer():
    for target in (S.INTERVIEWING, S.OFFER, S.GHOSTED, S.REJECTED):
        assert is_allowed(S.SAVED, target) is False
