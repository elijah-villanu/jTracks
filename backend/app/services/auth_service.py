"""Auth business logic: signup, login, Google OAuth link/create."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import dummy_verify, hash_password, verify_password
from app.models.user import User
from app.services import refresh_token_service


class AuthError(Exception):
    """Base auth error."""


class EmailAlreadyRegistered(AuthError):
    pass


class InvalidCredentials(AuthError):
    pass


class UnverifiedEmail(AuthError):
    """An OAuth identity asserted an email address it hasn't proven it owns."""


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def get_user_by_google_id(db: Session, google_id: str) -> User | None:
    return db.scalar(select(User).where(User.google_id == google_id))


def signup(db: Session, email: str, password: str) -> User:
    email = email.lower()
    if get_user_by_email(db, email) is not None:
        raise EmailAlreadyRegistered(email)
    user = User(email=email, hashed_password=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    """Verify an email/password pair in time that doesn't depend on the email.

    SECURITY (audit M5): the previous version short-circuited when the address
    was unknown, so no bcrypt ran and the request returned in ~0.001 ms versus
    ~544 ms for a real account — a 500,000x timing oracle that let anyone
    enumerate which addresses have accounts. Both the "no such user" and the
    "OAuth-only account, null hash" paths now burn an equivalent bcrypt
    comparison against a throwaway hash before failing.
    """
    user = get_user_by_email(db, email)

    if user is None or not user.hashed_password:
        dummy_verify(password)
        raise InvalidCredentials()

    if not verify_password(password, user.hashed_password):
        raise InvalidCredentials()

    return user


def upsert_google_user(
    db: Session, google_id: str, email: str, email_verified: bool
) -> User:
    """Find-or-create/link a user for a verified Google identity.

    Resolution order:
      1. Existing user with this google_id -> return it (repeat login).
      2. Existing user with this email -> link google_id to it (account linking).
      3. Otherwise create a new OAuth-only user (null hashed_password).

    SECURITY (audit H3): `email_verified` is a required argument with no default
    and is checked before any lookup. Steps 2 and 3 both treat the email address
    as proof of identity — step 2 hands over an existing password account — so an
    unproven address must never get this far. `verify_google_id_token` already
    rejects unverified tokens; this is the second, independent layer that also
    covers any future caller (a test double, an admin import, another provider).
    """
    if not email_verified:
        raise UnverifiedEmail(email)

    email = email.lower()

    user = get_user_by_google_id(db, google_id)
    if user is not None:
        return user

    user = get_user_by_email(db, email)
    if user is not None:
        if user.google_id is None:
            user.google_id = google_id
            # SECURITY (pre-deploy audit): pre-account hijacking. Password
            # signup never proves the address belongs to the person signing up,
            # so an attacker can register victim@gmail.com first. When the real
            # owner later signs in with Google, this branch used to link *into
            # the attacker's row* and leave the attacker's password working —
            # they then read everything the victim stored (confirmed by PoC).
            #
            # Google's verified email is the first real proof of ownership, so
            # it wins: the unproven password is dropped and every session that
            # existed before the proof is revoked. Trade-off: a legitimate user
            # who signed up with a password and later links Google signs in with
            # Google from then on.
            if user.hashed_password is not None:
                user.hashed_password = None
                refresh_token_service.revoke_all_for_user(db, user.id)
            db.commit()
            db.refresh(user)
        return user

    user = User(email=email, google_id=google_id, hashed_password=None)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
