"""B27 — refresh-token issue / validate / revoke (PRD R7.3, R7.5).

The refresh token is the only revocable credential in the system. The access
token is a short-lived bearer JWT with no revocation path of its own, so
everything logout means in practice happens here: `revoke()` stamps a row, and
the next `/auth/refresh` fails because `validate()` sees it.

That is also why the table exists at all. Cookie flags (`HttpOnly`, `Secure`,
`SameSite`) protect the token in transit and from script access; they do nothing
about a token that has already leaked. Without a server-side row to invalidate,
logout would be cosmetic and a stolen token would stay good until natural expiry.

**No rotation, no reuse detection, no token families.** This is deliberate and
documented (PRD R7.5), not an oversight — please don't file it as a bug. A
refresh token is static until it expires or is explicitly revoked. The accepted
consequence is spelled out in the PRD's risk list: a stolen refresh token is
usable until expiry or manual logout. Rotation is the natural next increment if
that ever stops being acceptable, and it would slot in here without touching
callers.

Every date/time here goes through `app/core/clock.py` (R2.4). `expires_at` is a
stored `timestamptz`, which psycopg hands back in the *session* timezone, so it
is compared against `utc_now()` — an aware value — never against a naive one.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.clock import utc_now
from app.core.security import (
    generate_refresh_token,
    hash_refresh_token,
    refresh_token_expiry,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User

logger = logging.getLogger("jtracks.refresh")


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
    raw = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw),
            expires_at=refresh_token_expiry(),
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
    """Return the row for a usable refresh token, or None.

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


def revoke(db: Session, raw: str) -> bool:
    """Revoke a refresh token. Idempotent; returns whether anything changed.

    Revoking an unknown, already-revoked or expired token is a no-op, not an
    error — `/auth/logout` is required to succeed regardless (R7.4), and a
    caller who cannot tell the difference cannot use logout as an oracle for
    whether a token exists.
    """
    row = _lookup(db, raw)
    if row is None or row.revoked_at is not None:
        return False
    row.revoked_at = utc_now()
    db.commit()
    return True


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
