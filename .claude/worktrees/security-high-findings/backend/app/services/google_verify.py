"""Verify a Google ID token and extract (google_id, email).

Isolated in its own module so tests can monkeypatch `verify_google_id_token`
without doing real network I/O against Google's certs.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings


class GoogleVerificationError(Exception):
    pass


@dataclass
class GoogleIdentity:
    google_id: str  # the Google 'sub' claim — stable unique id
    email: str
    email_verified: bool


def verify_google_id_token(token: str) -> GoogleIdentity:
    """Verify signature/audience/issuer and return the identity. Raises
    GoogleVerificationError on any problem."""
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleVerificationError("GOOGLE_CLIENT_ID is not configured.")
    # Imported lazily so the module (and tests that monkeypatch this function)
    # don't require google-auth's requests transport at import time.
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    try:
        claims = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception as exc:  # google raises ValueError and others
        raise GoogleVerificationError(str(exc)) from exc

    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise GoogleVerificationError("Invalid token issuer.")

    sub = claims.get("sub")
    email = claims.get("email")
    if not sub or not email:
        raise GoogleVerificationError("Token missing 'sub' or 'email'.")

    return GoogleIdentity(
        google_id=str(sub),
        email=str(email).lower(),
        email_verified=bool(claims.get("email_verified", False)),
    )
