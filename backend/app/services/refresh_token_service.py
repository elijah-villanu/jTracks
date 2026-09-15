"""B27 — refresh-token issue / rotate / validate / revoke (PRD R7.3, R7.5).

The refresh token is the only revocable credential in the system. The access
token is a short-lived bearer JWT with no revocation path of its own, so
everything logout means in practice happens here: `revoke()` stamps a row, and
the next `/auth/refresh` fails because `rotate()` sees it.

That is also why the table exists at all. Cookie flags (`HttpOnly`, `Secure`,
`SameSite`) protect the token in transit and from script access; they do nothing
about a token that has already leaked. Without a server-side row to invalidate,
logout would be cosmetic and a stolen token would stay good until natural expiry.

**Rotation with reuse detection (R7.5, revised).** Every successful
`/auth/refresh` revokes the presented token and issues its successor, so each
refresh token is single-use. All tokens descending from one login share a
`family_id`. If a token that has already been rotated is presented again, two
parties hold the same session and there is no way to tell which is legitimate,
so the entire family is revoked and both are sent back to login.

The one exception is a short grace window (`REFRESH_TOKEN_REUSE_GRACE_SECONDS`)
right after a rotation: two tabs can both send the old cookie before either
response lands, and the second must not be mistaken for a thief. Inside the
window the old token earns a new access token but no new refresh token — the
browser already has the successor from the first response.

Rotation does not extend a session. A successor inherits its predecessor's
`expires_at`, so `REFRESH_TOKEN_EXPIRE_DAYS` stays an absolute limit on how long
one login lasts.

Every date/time here goes through `app/core/clock.py` (R2.4). `expires_at` is a
stored `timestamptz`, which psycopg hands back in the *session* timezone, so it
is compared against `utc_now()` — an aware value — never against a naive one.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import settings

from app.core.clock import utc_now
from app.core.security import (
    generate_refresh_token,
    hash_refresh_token,
    refresh_token_expiry,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User

logger = logging.getLogger("jtracks.refresh")

# SECURITY (V2 audit M1): upper bound on simultaneously valid refresh tokens per
# user. Every signup/login/OAuth exchange mints a row and nothing ever pruned
# them, so a password that leaked once left an unbounded number of 14-day
# credentials behind (16 logins -> 16 live sessions, confirmed by PoC). Ten is
# far more devices than one person uses; the oldest is revoked past that.
MAX_LIVE_SESSIONS_PER_USER = 10


def _as_utc(ts: datetime) -> datetime:
    """Make a stored timestamp comparable to `utc_now()`.

    SQLite has no timezone type and hands back naive values that `func.now()`
    wrote in UTC; Postgres hands back aware values in the session timezone.
    Both end up as aware UTC here so the expiry comparison can never silently
    compare a naive value against an aware one (a TypeError) or, worse, compare
    two different calendars.
    """
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def issue(db: Session, user: User) -> str:
    """Create a refresh-token row for `user` and return the **raw** token.

    The raw value is returned exactly once, to be written into the httpOnly
    cookie. Only its hash is persisted; there is no column it could live in and
    no way to recover it from the database afterwards (security NFR).
    """
    now = utc_now()
    # Make room for the new session: keep the newest (cap - 1) live rows.
    # Ordered by `expires_at`, which is issue time + a constant lifetime and,
    # unlike a server-default `created_at`, has sub-second resolution on SQLite.
    live = list(
        db.scalars(
            select(RefreshToken)
            .where(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > now,
            )
            .order_by(RefreshToken.expires_at.desc())
        ).all()
    )
    for stale in live[MAX_LIVE_SESSIONS_PER_USER - 1 :]:
        stale.revoked_at = now

    raw = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            # A new login starts a new family; rotation carries it forward.
            family_id=uuid.uuid4(),
            token_hash=hash_refresh_token(raw),
            expires_at=refresh_token_expiry(now),
        )
    )
    db.commit()
    return raw


def _lookup(db: Session, raw: str) -> RefreshToken | None:
    """Single indexed fetch by hash (`ix_refresh_tokens_token_hash`, unique)."""
    if not raw:
        return None
    return db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))
    )


def validate(db: Session, raw: str) -> RefreshToken | None:
    """Return the row for a usable refresh token, or None. Read-only.

    `/auth/refresh` goes through `rotate()`, which applies these same checks
    before consuming the token; this is the side-effect-free form of them.

    All three conditions are checked on **every** call, none of them cached or
    skipped (security NFR — "revocation must be checked on every refresh"):

      1. a row with this hash exists,
      2. `expires_at` is in the future,
      3. `revoked_at` is null.

    The caller gets a single `None` for all failure modes on purpose: the
    endpoint must not leak whether a token was unknown, expired or revoked.
    """
    row = _lookup(db, raw)
    if row is None:
        return None
    if row.revoked_at is not None:
        return None
    if _as_utc(row.expires_at) <= utc_now():
        return None
    return row


@dataclass(frozen=True)
class RotationResult:
    """Outcome of a successful `rotate()`.

    `raw_token` is the successor to write into the cookie, or `None` when the
    request was honoured inside the reuse grace window — in that case the
    browser already holds the successor and the cookie must be left alone.
    `expires_at` is the session's absolute expiry, for the cookie's Max-Age.
    """

    user_id: uuid.UUID
    raw_token: str | None
    expires_at: datetime


def rotate(db: Session, raw: str) -> RotationResult | None:
    """Exchange a refresh token for its successor (R7.5). `None` means 401.

    Outcomes, all but the first two collapsing to `None` for the caller:

      * live token          -> revoked, successor issued in the same family;
      * rotated, in grace   -> accepted, no successor (see module docstring);
      * rotated, past grace -> **reuse**: the whole family is revoked;
      * unknown, expired, or revoked by logout / session cap -> rejected.
    """
    row = _lookup(db, raw)
    if row is None:
        return None

    if row.revoked_at is None:
        if _as_utc(row.expires_at) <= utc_now():
            return None
        result = _claim_and_issue_successor(db, row)
        if result is not None:
            return result
        # Lost a race: a concurrent request rotated this exact token between
        # our read and our conditional update. Re-read and judge it as the
        # rotated token it now is, which lands in the grace path.
        db.expire_all()
        row = _lookup(db, raw)
        if row is None or row.revoked_at is None:
            return None

    if row.replaced_by_id is None:
        # Revoked by logout, the session cap or an earlier reuse: an ordinary
        # dead session, not a theft signal.
        return None
    return _handle_rotated_token(db, row)


def _claim_and_issue_successor(db: Session, row: RefreshToken) -> RotationResult | None:
    """Atomically revoke `row` and add its successor. `None` if already claimed.

    The conditional `UPDATE ... WHERE revoked_at IS NULL` is the concurrency
    guard: of two requests presenting the same live token, exactly one sees a
    rowcount of 1. A read-then-write in Python could let both rotate it and
    fork the family into two live tokens.
    """
    now = utc_now()
    successor_id = uuid.uuid4()
    # Read before commit expires the instance, so the result costs no reload.
    user_id, family_id, expires_at = row.user_id, row.family_id, row.expires_at
    claimed = db.execute(
        update(RefreshToken)
        .where(RefreshToken.id == row.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now, replaced_by_id=successor_id)
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount != 1:
        db.rollback()
        return None

    raw = generate_refresh_token()
    db.add(
        RefreshToken(
            id=successor_id,
            user_id=user_id,
            family_id=family_id,
            token_hash=hash_refresh_token(raw),
            # Inherited, not refreshed: rotation must not extend the session.
            expires_at=expires_at,
        )
    )
    db.commit()
    return RotationResult(user_id=user_id, raw_token=raw, expires_at=expires_at)


def _handle_rotated_token(db: Session, row: RefreshToken) -> RotationResult | None:
    """A token that was already rotated has been presented again."""
    now = utc_now()
    grace = timedelta(seconds=settings.REFRESH_TOKEN_REUSE_GRACE_SECONDS)
    if now - _as_utc(row.revoked_at) <= grace:
        # Only while the family is still alive: a session logged out (or
        # already killed for reuse) seconds after rotating stays dead.
        live = db.scalar(
            select(RefreshToken.id).where(
                RefreshToken.family_id == row.family_id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > now,
            )
        )
        if live is None:
            return None
        return RotationResult(user_id=row.user_id, raw_token=None, expires_at=row.expires_at)

    revoked = revoke_family(db, row.family_id)
    # Never log token material; the ids are enough to investigate.
    logger.warning(
        "Refresh token reuse detected; revoked %d live token(s) in family %s "
        "for user %s.",
        revoked,
        row.family_id,
        row.user_id,
    )
    return None


def revoke_family(db: Session, family_id: uuid.UUID) -> int:
    """Revoke every live token in one family. Returns the number revoked."""
    result = db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utc_now())
        .execution_options(synchronize_session=False)
    )
    db.commit()
    return result.rowcount or 0


def revoke(db: Session, raw: str) -> bool:
    """Revoke the session a refresh token belongs to. Idempotent; returns
    whether anything changed.

    With rotation (R7.5) the unit of logout is the token's family, not the
    single row: a stale cookie from an earlier generation of the same session
    must still end it, or its live successor would survive "logout". Other
    families — the user's other devices — are untouched (R7.8).

    Revoking an unknown, already-revoked or expired token is a no-op, not an
    error — `/auth/logout` is required to succeed regardless (R7.4), and a
    caller who cannot tell the difference cannot use logout as an oracle for
    whether a token exists.
    """
    row = _lookup(db, raw)
    if row is None:
        return False
    return revoke_family(db, row.family_id) > 0


def revoke_all_for_user(db: Session, user_id: uuid.UUID) -> int:
    """Revoke every live token for one user. Returns the number revoked.

    Not wired to an endpoint: R7.8 rules out "log out all devices" for V2. It
    exists because account-level remediation (a password change, say) has no
    other way to invalidate outstanding sessions, and it is three lines.
    """
    now = utc_now()
    rows = list(
        db.scalars(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
            )
        ).all()
    )
    for row in rows:
        row.revoked_at = now
    if rows:
        db.commit()
    return len(rows)


def purge_expired(db: Session) -> int:
    """Delete rows that are past `expires_at`. Returns the number deleted.

    Housekeeping only — an expired row already fails `validate()`, so this is
    about not growing the table forever. Piggybacked on the existing daily
    ghosting job (see `app/scheduler/ghosting_scheduler.py`) rather than given a
    scheduler entry of its own: a second job would double the scheduler surface
    for a `DELETE` that takes milliseconds.

    Revoked-but-unexpired rows are deliberately kept until they expire
    naturally; deleting a revoked row would make a replayed token look merely
    *unknown* rather than revoked, which is a distinction worth preserving in
    the data even though the API never exposes it.
    """
    result = db.execute(
        delete(RefreshToken).where(RefreshToken.expires_at <= utc_now())
    )
    db.commit()
    deleted = result.rowcount or 0
    if deleted:
        logger.info("Purged %d expired refresh token(s).", deleted)
    return deleted
