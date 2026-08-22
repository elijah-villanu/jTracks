"""B27 — refresh-token service: issue, validate, revoke (PRD R7.3, R7.5)."""
from __future__ import annotations

from datetime import timedelta

from app.core.clock import utc_now
from app.core.security import generate_refresh_token, hash_refresh_token
from app.db.session import SessionLocal
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services import refresh_token_service as svc


def _user(db, email="rt@example.com") -> User:
    u = User(email=email, hashed_password=None, ghost_days_default=14)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _row(db, raw) -> RefreshToken | None:
    return (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_refresh_token(raw))
        .one_or_none()
    )


def _db():
    return SessionLocal()


# --------------------------------------------------------------------------
# issue
# --------------------------------------------------------------------------


def test_issue_stores_only_the_hash():
    db = _db()
    try:
        u = _user(db)
        raw = svc.issue(db, u)
        row = _row(db, raw)
        assert row is not None
        assert row.token_hash != raw
        assert row.user_id == u.id
        assert row.revoked_at is None
    finally:
        db.close()


def test_no_raw_token_value_appears_anywhere_in_the_table():
    """Security NFR: the raw value has no column and must not leak into one."""
    db = _db()
    try:
        u = _user(db)
        raw = svc.issue(db, u)
        for row in db.query(RefreshToken).all():
            for value in (row.token_hash, str(row.id), str(row.user_id)):
                assert raw not in value
    finally:
        db.close()


def test_issue_is_repeatable_and_each_token_is_distinct():
    db = _db()
    try:
        u = _user(db)
        a, b = svc.issue(db, u), svc.issue(db, u)
        assert a != b
        assert svc.validate(db, a) is not None
        assert svc.validate(db, b) is not None
    finally:
        db.close()


# --------------------------------------------------------------------------
# validate — all four outcomes
# --------------------------------------------------------------------------


def test_validate_accepts_a_live_token():
    db = _db()
    try:
        u = _user(db)
        raw = svc.issue(db, u)
        row = svc.validate(db, raw)
        assert row is not None
        assert row.user_id == u.id
    finally:
        db.close()


def test_validate_rejects_an_unknown_hash():
    db = _db()
    try:
        _user(db)
        assert svc.validate(db, generate_refresh_token()) is None
        assert svc.validate(db, "") is None
        assert svc.validate(db, "not-a-token") is None
    finally:
        db.close()


def test_validate_rejects_an_expired_token():
    db = _db()
    try:
        u = _user(db)
        raw = svc.issue(db, u)
        row = _row(db, raw)
        row.expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
        assert svc.validate(db, raw) is None
    finally:
        db.close()


def test_validate_rejects_a_revoked_token():
    db = _db()
    try:
        u = _user(db)
        raw = svc.issue(db, u)
        assert svc.revoke(db, raw) is True
        assert svc.validate(db, raw) is None
    finally:
        db.close()


def test_validate_rejects_a_token_that_is_both_revoked_and_expired():
    db = _db()
    try:
        u = _user(db)
        raw = svc.issue(db, u)
        row = _row(db, raw)
        row.revoked_at = utc_now()
        row.expires_at = utc_now() - timedelta(days=1)
        db.commit()
        assert svc.validate(db, raw) is None
    finally:
        db.close()


def test_expiry_boundary_is_checked_against_utc_now():
    db = _db()
    try:
        u = _user(db)
        raw = svc.issue(db, u)
        row = _row(db, raw)
        row.expires_at = utc_now() + timedelta(seconds=30)
        db.commit()
        assert svc.validate(db, raw) is not None
    finally:
        db.close()


# --------------------------------------------------------------------------
# revoke
# --------------------------------------------------------------------------


def test_revoke_stamps_revoked_at():
    db = _db()
    try:
        u = _user(db)
        raw = svc.issue(db, u)
        assert svc.revoke(db, raw) is True
        assert _row(db, raw).revoked_at is not None
    finally:
        db.close()


def test_revoking_twice_is_a_no_op_not_an_error():
    """R7.4 — logout is idempotent, so this must never raise."""
    db = _db()
    try:
        u = _user(db)
        raw = svc.issue(db, u)
        assert svc.revoke(db, raw) is True
        first_stamp = _row(db, raw).revoked_at
        assert svc.revoke(db, raw) is False   # no error, no change
        assert _row(db, raw).revoked_at == first_stamp
    finally:
        db.close()


def test_revoking_an_unknown_token_is_a_no_op():
    db = _db()
    try:
        _user(db)
        assert svc.revoke(db, generate_refresh_token()) is False
        assert svc.revoke(db, "") is False
    finally:
        db.close()


def test_revoke_does_not_affect_other_tokens():
    db = _db()
    try:
        u = _user(db)
        keep, drop = svc.issue(db, u), svc.issue(db, u)
        svc.revoke(db, drop)
        assert svc.validate(db, keep) is not None
        assert svc.validate(db, drop) is None
    finally:
        db.close()


def test_revoke_all_for_user_leaves_other_users_alone():
    db = _db()
    try:
        a, b = _user(db, "a@x.com"), _user(db, "b@x.com")
        a1, a2, b1 = svc.issue(db, a), svc.issue(db, a), svc.issue(db, b)
        assert svc.revoke_all_for_user(db, a.id) == 2
        assert svc.validate(db, a1) is None
        assert svc.validate(db, a2) is None
        assert svc.validate(db, b1) is not None
        # Idempotent: nothing left to revoke.
        assert svc.revoke_all_for_user(db, a.id) == 0
    finally:
        db.close()


# --------------------------------------------------------------------------
# purge (piggybacked on the daily scheduler job)
# --------------------------------------------------------------------------


def test_purge_expired_removes_only_expired_rows():
    db = _db()
    try:
        u = _user(db)
        live = svc.issue(db, u)
        stale = svc.issue(db, u)
        revoked_but_live = svc.issue(db, u)
        svc.revoke(db, revoked_but_live)

        row = _row(db, stale)
        row.expires_at = utc_now() - timedelta(days=1)
        db.commit()

        assert svc.purge_expired(db) == 1
        assert _row(db, stale) is None
        assert _row(db, live) is not None
        # A revoked-but-unexpired row is kept so a replay still reads as
        # "revoked" rather than "unknown".
        assert _row(db, revoked_but_live) is not None
        assert svc.purge_expired(db) == 0
    finally:
        db.close()


def test_scheduler_job_runs_the_purge_alongside_the_sweep():
    """B27 — no second scheduler entry; it rides the existing daily job."""
    from app.scheduler import ghosting_scheduler

    db = _db()
    try:
        u = _user(db)
        stale = svc.issue(db, u)
        row = _row(db, stale)
        row.expires_at = utc_now() - timedelta(days=1)
        db.commit()
    finally:
        db.close()

    ghosting_scheduler._job()

    db = _db()
    try:
        assert _row(db, stale) is None
    finally:
        db.close()
