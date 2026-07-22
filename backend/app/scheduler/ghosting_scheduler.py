"""B8/B9 — in-process APScheduler wiring for the daily ghosting sweep.

See docs/decisions/scheduler-mechanism.md. The job is idempotent, so this
single-process scheduler is sufficient and needs no external broker. The sweep
is also runnable directly (`python -m app.scheduler.ghosting_scheduler`) if a
deployment ever prefers platform cron over the in-process scheduler.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.ghosting import run_ghosting_sweep

logger = logging.getLogger("jtracks.scheduler")

_scheduler: BackgroundScheduler | None = None


def _job() -> None:
    db = SessionLocal()
    try:
        run_ghosting_sweep(db)
    except Exception:  # never let a job error kill the scheduler thread
        logger.exception("Ghosting sweep failed")
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler | None:
    """Start the daily job. Returns the scheduler (or None if disabled)."""
    global _scheduler
    if not settings.RUN_SCHEDULER:
        logger.info("RUN_SCHEDULER is false; ghosting scheduler not started.")
        return None
    if _scheduler is not None:
        return _scheduler

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _job,
        trigger=CronTrigger(
            hour=settings.GHOSTING_JOB_HOUR, minute=settings.GHOSTING_JOB_MINUTE
        ),
        id="daily_ghosting_sweep",
        replace_existing=True,
        coalesce=True,            # collapse a backlog of missed runs into one
        max_instances=1,
        misfire_grace_time=3600,  # tolerate a late start after downtime
    )
    _scheduler.start()
    logger.info(
        "Ghosting scheduler started (daily at %02d:%02d UTC).",
        settings.GHOSTING_JOB_HOUR,
        settings.GHOSTING_JOB_MINUTE,
    )
    # Reconcile immediately on boot so a freshly-started instance catches up.
    _job()
    return _scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


if __name__ == "__main__":  # manual / cron entrypoint
    logging.basicConfig(level=logging.INFO)
    session = SessionLocal()
    try:
        n = run_ghosting_sweep(session)
        print(f"Ghosting sweep complete: {n} application(s) transitioned.")
    finally:
        session.close()
