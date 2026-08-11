"""B9 — daily auto-ghosting sweep.

Flips Applied/Interviewing applications whose ghosting deadline has passed to
Ghosted. Correctness properties (tested):
  * exactly one transition per overdue row;
  * re-running finds nothing new (idempotent) — already-Ghosted rows are excluded
    by the status filter, and terminal Offer/Rejected are never touched.

Clock start: `date_applied` (the PRD explicitly says this date starts the
ghosting clock). Effective limit = the row's `ghost_days_override` if set, else
the owning user's `ghost_days_default`. A row is overdue when
`today >= date_applied + effective_days`.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import utc_today
from app.models.application import Application, ApplicationStatus
from app.models.user import User
from app.services.transitions import GHOSTABLE_STATUSES

logger = logging.getLogger("jtracks.ghosting")


def find_overdue(db: Session, today: date) -> list[Application]:
    """Return ghostable rows whose deadline is on/before `today`."""
    # Pre-filter in SQL to candidates (uses the (user_id, status) /
    # (user_id, date_applied) indexes); resolve the effective limit in Python so
    # the date math stays portable across SQLite (dev) and Postgres (prod).
    stmt = (
        select(Application, User.ghost_days_default)
        .join(User, User.id == Application.user_id)
        .where(
            Application.status.in_(tuple(GHOSTABLE_STATUSES)),
            Application.date_applied.is_not(None),
        )
    )
    overdue: list[Application] = []
    for app, ghost_days_default in db.execute(stmt).all():
        effective = app.ghost_days_override or ghost_days_default
        deadline = app.date_applied + timedelta(days=effective)
        if today >= deadline:
            overdue.append(app)
    return overdue


def run_ghosting_sweep(db: Session, today: date | None = None) -> int:
    """Flip all overdue rows to Ghosted. Returns the number transitioned."""
    today = today or utc_today()
    overdue = find_overdue(db, today)
    for app in overdue:
        app.status = ApplicationStatus.GHOSTED
    if overdue:
        db.commit()
    logger.info("Ghosting sweep: %d application(s) transitioned to ghosted", len(overdue))
    return len(overdue)
