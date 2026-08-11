"""Application CRUD business logic — always scoped to a single user (B4/B5)."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import utc_today
from app.models.application import Application, ApplicationStatus
from app.schemas.application import ApplicationCreate, ApplicationUpdate
from app.services.transitions import validate_transition


def list_applications(
    db: Session,
    user_id: uuid.UUID,
    status: ApplicationStatus | None = None,
) -> list[Application]:
    stmt = select(Application).where(Application.user_id == user_id)
    if status is not None:
        stmt = stmt.where(Application.status == status)
    stmt = stmt.order_by(Application.created_at.desc())
    return list(db.scalars(stmt).all())


def get_application(
    db: Session, user_id: uuid.UUID, app_id: uuid.UUID
) -> Application | None:
    """Scoped fetch — returns None if the row doesn't exist OR belongs to
    someone else (B4: never leak another user's data; caller maps None -> 404)."""
    return db.scalar(
        select(Application).where(
            Application.id == app_id, Application.user_id == user_id
        )
    )


def create_application(
    db: Session, user_id: uuid.UUID, payload: ApplicationCreate
) -> Application:
    data = payload.model_dump()
    status = data["status"]

    # PRD: an entry created directly as Applied should have date_applied set
    # (defaults to today) so the ghosting clock has a start.
    if status == ApplicationStatus.APPLIED and data.get("date_applied") is None:
        data["date_applied"] = utc_today()
    # A Saved entry with no date_saved defaults to today (the day it was added).
    if status == ApplicationStatus.SAVED and data.get("date_saved") is None:
        data["date_saved"] = utc_today()

    # NOTE: creation is not a transition, so `validate_transition` is not called
    # here. A guard re-checking the date_applied invariant used to sit at this
    # point; the default above always satisfies it first, so the guard could
    # never fire and has been removed rather than left as unreachable code.
    app = Application(user_id=user_id, **data)
    db.add(app)
    db.commit()
    db.refresh(app)
    return app


def update_application(
    db: Session,
    app: Application,
    payload: ApplicationUpdate,
) -> Application:
    """Apply a PATCH. Validates status transitions (B6). Raises TransitionError
    for a disallowed change."""
    changes = payload.model_dump(exclude_unset=True)

    if "status" in changes and changes["status"] is not None:
        new_status = changes["status"]
        # Will the row have a date_applied after this patch?
        incoming_date_applied = changes.get("date_applied", app.date_applied)
        # PRD: Saved -> Applied defaults date_applied to today if not supplied.
        if (
            new_status == ApplicationStatus.APPLIED
            and incoming_date_applied is None
        ):
            incoming_date_applied = utc_today()
            changes["date_applied"] = incoming_date_applied

        validate_transition(
            app.status,
            new_status,
            date_applied_present=incoming_date_applied is not None,
        )

    for field, value in changes.items():
        setattr(app, field, value)

    db.commit()
    db.refresh(app)
    return app


def delete_application(db: Session, app: Application) -> None:
    db.delete(app)
    db.commit()
