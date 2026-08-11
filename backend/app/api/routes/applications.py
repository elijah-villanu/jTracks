"""B5/B7/B13 — applications CRUD, ghost-days override, and autofill.

Every route is scoped to the authenticated user (B4): the `{id}` routes fetch
via `get_application(db, current_user.id, id)`, which returns None (→ 404) for a
row that doesn't exist *or* belongs to someone else — a user can never read or
mutate another user's data.
"""
# NOTE: deliberately NO `from __future__ import annotations` here — see the note
# in routes/auth.py. slowapi's @limiter.limit wrapper breaks FastAPI's
# resolution of stringified annotations on the decorated handler.
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings as app_settings
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models.application import ApplicationStatus
from app.models.user import User
from app.schemas.application import (
    ApplicationCreate,
    ApplicationResponse,
    ApplicationUpdate,
)
from app.schemas.autofill import (
    AutofillFailed,
    AutofillParsed,
    AutofillRequest,
    AutofillUnsupported,
)
from app.services import application_service
from app.services.autofill.dispatcher import autofill as run_autofill
from app.services.transitions import TransitionError

router = APIRouter(prefix="/applications", tags=["applications"])

_NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")


@router.get("", response_model=list[ApplicationResponse])
def list_applications(
    status: ApplicationStatus | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return application_service.list_applications(db, current_user.id, status)


@router.post("", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
def create_application(
    payload: ApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # No TransitionError mapping here: creation runs no transition validation,
    # so this handler can only fail on schema validation (422). PATCH is where
    # the 400 lives. Re-add the try/except here if create ever starts validating.
    return application_service.create_application(db, current_user.id, payload)


# NOTE: declared before the dynamic `/{app_id}` routes are matched. It's a POST
# so it never collides with the GET/PATCH/DELETE `/{app_id}` handlers, but we
# keep it grouped here for clarity.
@router.post(
    "/autofill",
    response_model=AutofillParsed | AutofillUnsupported | AutofillFailed,
    responses={200: {"description": "parsed | unsupported | failed"}},
)
@limiter.limit(app_settings.RATE_LIMIT_AUTOFILL)
async def autofill_application(
    request: Request,
    payload: AutofillRequest,
    current_user: User = Depends(get_current_user),
):
    # Always 200 with a structured result — never a 500 (B13).
    return await run_autofill(payload.url)


@router.get("/{app_id}", response_model=ApplicationResponse)
def get_application(
    app_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app = application_service.get_application(db, current_user.id, app_id)
    if app is None:
        raise _NOT_FOUND
    return app


@router.patch("/{app_id}", response_model=ApplicationResponse)
def update_application(
    app_id: uuid.UUID,
    payload: ApplicationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app = application_service.get_application(db, current_user.id, app_id)
    if app is None:
        raise _NOT_FOUND
    try:
        return application_service.update_application(db, app, payload)
    except TransitionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.delete("/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(
    app_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app = application_service.get_application(db, current_user.id, app_id)
    if app is None:
        raise _NOT_FOUND
    application_service.delete_application(db, app)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
