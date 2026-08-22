"""Idempotent seed script: one test user + V2 sample applications.

Usage: DATABASE_URL=... python scripts/seed.py
"""
import os
import sys
from datetime import timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.clock import utc_now  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models import Application, ApplicationStatus, User  # noqa: E402

SEED_EMAIL = "seed-user@jtracks.dev"

# (company, title, status, days_ago_saved, days_ago_applied, ghost_days_override,
#  updated_at_days_ago)
# `updated_at_days_ago` is None unless a row needs to be backdated explicitly
# (e.g. the stale interviewing_oa row for the staleness nudge, R3) -- otherwise
# it defaults to "now" via the column's server_default.
#
# date_applied spans 400+ days so `week`/`year`/`all` ranges are all visibly
# different (PRD_V2.md R6, "year vs all may be indistinguishable" risk), and
# every non-saved, non-applied status (interviewing_oa, offer, rejected,
# failed, ghosted) has at least one row so every Sankey link is non-zero.
SAMPLE_APPLICATIONS = [
    # -- saved: no date_applied, invisible to every dashboard range --
    ("Acme Corp", "Software Engineer I", ApplicationStatus.SAVED, 2, None, None, None),
    ("Globex", "Backend Engineer", ApplicationStatus.SAVED, 5, None, None, None),
    ("Initech", "New Grad SWE", ApplicationStatus.SAVED, 1, None, None, None),
    ("Umbrella Inc", "Platform Engineer", ApplicationStatus.SAVED, 8, None, None, None),
    # -- applied, in flight (recent -- inside the `week` window) --
    ("Hooli", "SWE, Infrastructure", ApplicationStatus.APPLIED, 3, 2, None, None),
    ("Pied Piper", "Backend Developer", ApplicationStatus.APPLIED, 6, 4, None, None),
    ("Vehement Capital", "Software Engineer", ApplicationStatus.APPLIED, 8, 6, None, None),
    # -- applied, in flight (older -- inside `month`/`year` but not `week`) --
    ("Stark Industries", "Full Stack Engineer", ApplicationStatus.APPLIED, 45, 42, None, None),
    ("Wayne Enterprises", "Software Engineer II", ApplicationStatus.APPLIED, 70, 68, None, None),
    # -- interviewing_oa: one fresh, one stale (>28d, staleness nudge R3), one far back --
    ("Wonka Inc", "Junior Developer", ApplicationStatus.INTERVIEWING_OA, 15, 12, 21, None),
    ("Cyberdyne Systems", "ML Engineer", ApplicationStatus.INTERVIEWING_OA, 60, 55, None, 35),
    ("Soylent Corp", "Software Engineer", ApplicationStatus.INTERVIEWING_OA, 150, 145, None, None),
    # -- offer --
    ("Massive Dynamic", "Full Stack Engineer", ApplicationStatus.OFFER, 40, 35, None, None),
    ("Aperture Science", "Research Engineer", ApplicationStatus.OFFER, 200, 190, None, None),
    # -- rejected (by convention: pre-interview) --
    ("Vandelay Industries", "SWE Intern", ApplicationStatus.REJECTED, 20, 18, None, None),
    ("Gringotts Bank", "Backend Engineer", ApplicationStatus.REJECTED, 90, 85, None, None),
    ("Dunder Mifflin", "IT Engineer", ApplicationStatus.REJECTED, 250, 240, None, None),
    ("Sirius Cybernetics", "SWE", ApplicationStatus.REJECTED, 320, 310, None, None),
    # -- failed (by convention: post-interview) --
    ("Tyrell Corp", "Backend Engineer", ApplicationStatus.FAILED, 100, 95, None, None),
    ("Oceanic Airlines", "Software Engineer", ApplicationStatus.FAILED, 180, 172, None, None),
    ("Weyland-Yutani", "Platform Engineer", ApplicationStatus.FAILED, 340, 330, None, None),
    # -- ghosted --
    ("Oscorp", "Software Engineer", ApplicationStatus.GHOSTED, 50, 48, None, None),
    ("Xanadu Corp", "Platform Engineer", ApplicationStatus.GHOSTED, 130, 125, None, None),
    ("Los Pollos Hermanos", "Software Engineer I", ApplicationStatus.GHOSTED, 400, 390, None, None),
]


def seed() -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == SEED_EMAIL).one_or_none()
        if user is None:
            user = User(email=SEED_EMAIL, hashed_password=None, ghost_days_default=14)
            db.add(user)
            db.flush()

        existing = db.query(Application).filter(Application.user_id == user.id).count()
        if existing > 0:
            print(f"Seed user already has {existing} applications, skipping.")
            db.commit()
            return

        now = utc_now()
        today = now.date()
        for (
            company,
            title,
            status,
            days_saved,
            days_applied,
            ghost_override,
            updated_at_days_ago,
        ) in SAMPLE_APPLICATIONS:
            app = Application(
                user_id=user.id,
                company=company,
                title=title,
                status=status,
                date_saved=today - timedelta(days=days_saved),
                date_applied=(
                    today - timedelta(days=days_applied)
                    if days_applied is not None
                    else None
                ),
                ghost_days_override=ghost_override,
            )
            if updated_at_days_ago is not None:
                app.updated_at = now - timedelta(days=updated_at_days_ago)
            db.add(app)
        db.commit()
        print(f"Seeded user {SEED_EMAIL} with {len(SAMPLE_APPLICATIONS)} applications.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
