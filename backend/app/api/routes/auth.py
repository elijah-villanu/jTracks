"""B2/B3/B4/B28 — auth routes.

V2 (PRD R7) replaces V1's single 7-day access token with a two-token session:

  * a short-lived **access token** (JWT, `Authorization: Bearer`), returned in
    the JSON body of signup/login/oauth/refresh and held in frontend memory;
  * a long-lived, revocable **refresh token** (opaque, DB-backed), returned only
    as an httpOnly cookie and never in a response body.

Signup, login and Google OAuth all additionally set the refresh cookie; their
JSON shape is unchanged. `/auth/refresh` exchanges the cookie for a new access
token and a rotated refresh cookie (R7.5), `/auth/logout` revokes it. Cookie attributes live in
`app/core/cookies.py`; the reasoning is in
`docs/decisions/cookie-topology-samesite.md`.
"""
# NOTE: deliberately NO `from __future__ import annotations` here. The
# @limiter.limit decorators (audit H4) wrap these handlers, and slowapi's
# wrapper carries its own __globals__ — FastAPI then can't resolve stringified
# annotations, silently demoting body params to query params. Real annotation
# objects avoid that entirely.
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_refresh_csrf_header
from app.core.config import settings
from app.core.cookies import (
    clear_refresh_cookie,
    read_refresh_cookies,
    set_refresh_cookie,
)
from app.core.rate_limit import limiter
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    GoogleOAuthRequest,
    LoginRequest,
    SignupRequest,
    TokenResponse,
    UserPublic,
)
from app.services import auth_service, refresh_token_service
from app.services.google_verify import (
    GoogleVerificationError,
    verify_google_id_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# One undifferentiated failure for every refresh rejection (R7.4). Telling the
# caller whether a token was unknown, expired or revoked turns the endpoint into
# an oracle about other people's sessions.
_INVALID_SESSION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or expired session.",
)


def _start_session(db: Session, response: Response, user: User) -> TokenResponse:
    """Issue both tokens: access in the body, refresh in the cookie."""
    set_refresh_cookie(response, refresh_token_service.issue(db, user))
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_SIGNUP)
def signup(
    request: Request,
    response: Response,
    payload: SignupRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    try:
        user = auth_service.signup(db, payload.email, payload.password)
    except auth_service.EmailAlreadyRegistered:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    return _start_session(db, response, user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    try:
        user = auth_service.authenticate(db, payload.email, payload.password)
    except auth_service.InvalidCredentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    return _start_session(db, response, user)


@router.post("/oauth/google", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_OAUTH)
def oauth_google(
    request: Request,
    response: Response,
    payload: GoogleOAuthRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    try:
        identity = verify_google_id_token(payload.id_token)
    except GoogleVerificationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google credential.",
        )
    try:
        user = auth_service.upsert_google_user(
            db, identity.google_id, identity.email, identity.email_verified
        )
    except auth_service.UnverifiedEmail:
        # Same 401 as a bad credential: don't tell the caller whether the
        # address matched an existing account.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google credential.",
        )
    return _start_session(db, response, user)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_REFRESH)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    _csrf: None = Depends(require_refresh_csrf_header),
) -> TokenResponse:
    """Exchange a valid refresh cookie for a new access token (R7.4).

    Rotates (R7.5): the presented refresh token is consumed and its successor
    is set as the new cookie. A rotated token replayed after the grace window
    revokes the whole session and gets the same `401` as any other failure —
    the response must not tell a thief that they were detected.

    Inside the grace window the response carries an access token and **no**
    `Set-Cookie`, because the browser already holds the successor.
    """
    # A request can carry several cookies with this name (see
    # `read_refresh_cookies`). Live tokens are tried first so a stray value
    # can't shadow the real one; the rest still go through `rotate()` so a
    # just-rotated token gets its grace and a replayed one trips detection.
    candidates = read_refresh_cookies(request)
    live = [c for c in candidates if refresh_token_service.validate(db, c)]
    rotation = None
    for raw in live + [c for c in candidates if c not in live]:
        rotation = refresh_token_service.rotate(db, raw)
        if rotation is not None:
            break
    if rotation is None:
        raise _INVALID_SESSION

    user = db.get(User, rotation.user_id)
    if user is None:
        # The FK cascades, so this should be unreachable; treat a dangling row
        # as an invalid session rather than a 500.
        raise _INVALID_SESSION

    if rotation.raw_token is not None:
        set_refresh_cookie(response, rotation.raw_token, rotation.expires_at)
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
# V2 audit L1: the one unauthenticated auth route that writes to the DB had no
# budget. Shares refresh's, which is far above any real logout rate.
@limiter.limit(settings.RATE_LIMIT_REFRESH)
def logout(
    request: Request,
    db: Session = Depends(get_db),
    _csrf: None = Depends(require_refresh_csrf_header),
) -> Response:
    """Revoke the presented refresh token's session and clear the cookie (R7.4).

    "Session" is the token's rotation family (R7.5), so logging out with an
    older cookie from the same login still ends it.

    Idempotent: always `204`, whether the cookie is absent, malformed, unknown,
    already revoked or expired. There is nothing useful to report and plenty to
    leak — a differentiated response would say whether a given token exists.

    The cookie is cleared unconditionally, including on the no-cookie path, so a
    stale cookie the server has no row for still gets removed from the browser.
    """
    # Every same-named value: revoking an unknown one is a no-op, and picking
    # just one could leave the real session alive behind a stray cookie.
    for raw in read_refresh_cookies(request):
        refresh_token_service.revoke(db, raw)

    # The cookie must be set on the returned response: FastAPI does not merge
    # the injected `Response` dependency's headers when a handler returns a
    # Response object directly.
    out = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_refresh_cookie(out)
    return out


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
