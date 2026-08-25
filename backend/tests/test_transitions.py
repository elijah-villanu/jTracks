"""B6/B18 — status-transition rules (pure unit tests).

The expected matrix below is transcribed *independently* from PRD V2 R1.5
rather than derived from `ALLOWED_TRANSITIONS`, so the tests fail if the
implementation drifts from the spec (a test built from the implementation
would agree with any bug it contains).
"""
from __future__ import annotations

import itertools

import pytest

from app.models.application import ApplicationStatus as S
from app.services.transitions import (
    ALLOWED_TRANSITIONS,
    GHOSTABLE_STATUSES,
    TERMINAL_STATUSES,
    TransitionError,
    is_allowed,
    validate_transition,
)

ALL = list(S)

# PRD V2 R1.5, transcribed row by row. Column order matches the PRD table:
#            saved  applied  interviewing_oa  offer  rejected  failed  ghosted
_COLUMNS = [S.SAVED, S.APPLIED, S.INTERVIEWING_OA, S.OFFER, S.REJECTED, S.FAILED, S.GHOSTED]
_MATRIX: dict[S, list[bool]] = {
    #             saved  applied  int_oa  offer  reject  failed  ghosted
    S.SAVED:           [False, True,  False, False, False, False, False],
    S.APPLIED:         [False, False, True,  True,  True,  True,  True],
    S.INTERVIEWING_OA: [False, True,  False, True,  True,  True,  True],
    S.OFFER:           [False, False, True,  False, True,  True,  False],
    S.REJECTED:        [False, True,  True,  False, False, True,  False],
    S.FAILED:          [False, True,  True,  True,  True,  False, False],
    S.GHOSTED:         [False, True,  True,  True,  True,  True,  False],
}

EXPECTED: dict[tuple[S, S], bool] = {
    (frm, to): allowed
    for frm, row in _MATRIX.items()
    for to, allowed in zip(_COLUMNS, row)
}


def test_matrix_covers_the_full_status_set():
    """7 statuses -> 49 ordered pairs, 7 of them self-transitions."""
    assert set(_MATRIX) == set(ALL)
    assert len(EXPECTED) == 49
    assert len([p for p in EXPECTED if p[0] != p[1]]) == 42


def test_self_transitions_always_allowed():
    for s in ALL:
        assert is_allowed(s, s) is True
        # A no-op status write never raises (date_applied guard aside).
        validate_transition(s, s, date_applied_present=True)


@pytest.mark.parametrize(
    "current,new",
    [(c, n) for c, n in itertools.product(ALL, ALL) if c != n],
)
def test_all_42_non_self_pairs_match_the_prd_matrix(current, new):
    expected = EXPECTED[(current, new)]
    assert is_allowed(current, new) is expected, (
        f"{current.value} -> {new.value}: expected allowed={expected}"
    )
    if expected:
        validate_transition(current, new, date_applied_present=True)
    else:
        with pytest.raises(TransitionError):
            validate_transition(current, new, date_applied_present=True)


def test_implementation_table_agrees_with_the_prd_matrix():
    """`ALLOWED_TRANSITIONS` itself contains no extra or missing edges."""
    for frm in ALL:
        expected_targets = {to for to in ALL if to != frm and EXPECTED[(frm, to)]}
        assert ALLOWED_TRANSITIONS.get(frm, set()) == expected_targets


def test_pre_post_interview_split_is_not_enforced():
    """R1.4: the rejected/failed distinction is a reporting convention only."""
    assert is_allowed(S.APPLIED, S.FAILED) is True
    assert is_allowed(S.INTERVIEWING_OA, S.REJECTED) is True


def test_offer_cannot_be_ghosted():
    assert is_allowed(S.OFFER, S.GHOSTED) is False


def test_nothing_returns_to_saved():
    for frm in ALL:
        if frm is S.SAVED:
            continue
        assert is_allowed(frm, S.SAVED) is False


def test_saved_to_applied_requires_date_applied():
    with pytest.raises(TransitionError):
        validate_transition(S.SAVED, S.APPLIED, date_applied_present=False)
    # With a date it's fine.
    validate_transition(S.SAVED, S.APPLIED, date_applied_present=True)


def test_any_move_into_applied_requires_date_applied():
    for frm in (S.INTERVIEWING_OA, S.REJECTED, S.FAILED, S.GHOSTED):
        with pytest.raises(TransitionError):
            validate_transition(frm, S.APPLIED, date_applied_present=False)


def test_ghosted_can_be_manually_reverted():
    # PRD: users may manually revert a Ghosted application if they hear back.
    for target in (S.APPLIED, S.INTERVIEWING_OA, S.OFFER, S.REJECTED, S.FAILED):
        assert is_allowed(S.GHOSTED, target) is True


def test_saved_cannot_jump_past_applied():
    for target in (S.INTERVIEWING_OA, S.OFFER, S.GHOSTED, S.REJECTED, S.FAILED):
        assert is_allowed(S.SAVED, target) is False


def test_v2_ghostable_and_terminal_sets():
    """R2.1/R2.2 — the sweep only ever considers `applied`."""
    assert GHOSTABLE_STATUSES == frozenset({S.APPLIED})
    assert TERMINAL_STATUSES == frozenset({S.OFFER, S.REJECTED, S.FAILED})
    assert S.INTERVIEWING_OA not in GHOSTABLE_STATUSES
