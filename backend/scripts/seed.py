"""Idempotent seed script: one test user + ~20 sample applications.

Usage: DATABASE_URL=... python scripts/seed.py
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.session import SessionLocal  # noqa: E402
from app.models import Application, ApplicationStatus, User  # noqa: E402

SEED_EMAIL = "seed-user@jtracks.dev"

# (company, title, status, days_ago_saved, days_ago_applied, ghost_days_override)
SAMPLE_APPLICATIONS = [
    ("Acme Corp", "Software Engineer I", ApplicationStatus.SAVED, 2, None, None),
    ("Globex", "Backend Engineer", ApplicationStatus.SAVED, 5, None, None),
    ("Initech", "New Grad SWE", ApplicationStatus.SAVED, 1, None, None),
    ("Umbrella Inc", "Platform Engineer", ApplicationStatus.SAVED, 8, None, None),
    ("Stark Industries", "Full Stack Engineer", ApplicationStatus.APPLIED, 10, 9, None),
    ("Wayne Enterprises", "Software Engineer II", ApplicationStatus.APPLIED, 14, 12, None),
    ("Wonka Inc", "Junior Developer", ApplicationStatus.APPLIED, 6, 5, 21),
    ("Hooli", "SWE, Infrastructure", ApplicationStatus.APPLIED, 3, 2, None),
    ("Pied Piper", "Backend Developer", ApplicationStatus.APPLIED, 20, 18, None),
    ("Cyberdyne Systems", "ML Engineer", ApplicationStatus.INTERVIEWING, 25, 23, None),
    ("Soylent Corp", "Software Engineer", ApplicationStatus.INTERVIEWING, 18, 16, None),
    ("Tyrell Corp", "Backend Engineer", ApplicationStatus.INTERVIEWING, 12, 10, 30),
    ("Massive Dynamic", "Full Stack Engineer", ApplicationStatus.OFFER, 40, 35, None),
    ("Aperture Science", "Research Engineer", ApplicationStatus.OFFER, 33, 30, None),
    ("Vandelay Industries", "SWE Intern", ApplicationStatus.REJECTED, 45, 42, None),
    ("Gringotts Bank", "Backend Engineer", ApplicationStatus.REJECTED, 38, 36, None),
    ("Dunder Mifflin", "IT Engineer", ApplicationStatus.REJECTED, 28, 25, None),
    ("Oscorp", "Software Engineer", ApplicationStatus.GHOSTED, 50, 48, None),
    ("Xanadu Corp", "Platform Engineer", ApplicationStatus.GHOSTED, 60, 55, None),
    ("Los Pollos Hermanos", "Software Engineer I", ApplicationStatus.GHOSTED, 70, 65, None),
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

        today = date.today()
        for company, title, status, days_saved, days_applied, ghost_override in SAMPLE_APPLICATIONS:
            db.add(
                Application(
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
            )
        db.commit()
        print(f"Seeded user {SEED_EMAIL} with {len(SAMPLE_APPLICATIONS)} applications.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
