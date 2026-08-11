"""B2/B3/B4 — auth routes."""
# NOTE: deliberately NO `from __future__ import annotations` here. The
# @limiter.limit decorators (audit H4) wrap these handlers, and slowapi's
# wrapper carries its own __globals__ — FastAPI then can't resolve stringified
# annotations, silently demoting body params to query params. Real annotation
# objects avoid that entirely.
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
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
from app.services import auth_service
from app.services.google_verify import (
    GoogleVerificationError,
    verify_google_id_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_SIGNUP)
def signup(
    request: Request, payload: SignupRequest, db: Session = Depends(get_db)
) -> TokenResponse:
    try:
        user = auth_service.signup(db, payload.email, payload.password)
    except auth_service.EmailAlreadyRegistered:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(
    request: Request, payload: LoginRequest, db: Session = Depends(get_db)
) -> TokenResponse:
    try:
        user = auth_service.authenticate(db, payload.email, payload.password)
    except auth_service.InvalidCredentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/oauth/google", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_OAUTH)
def oauth_google(
    request: Request, payload: GoogleOAuthRequest, db: Session = Depends(get_db)
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
    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
