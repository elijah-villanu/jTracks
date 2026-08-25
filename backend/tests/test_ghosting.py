"""B9/B20 — daily auto-ghosting job.

V2/R2 narrowed the sweep to `applied` only. The stated V2 success metric is
"the ghosting sweep produces zero transitions on `interviewing_oa` rows", which
`test_sweep_never_touches_interviewing_oa_or_failed` asserts directly.
"""
from __future__ import annotations

from datetime import timedelta

from app.core.clock import utc_today
from app.db.session import SessionLocal
from app.services.ghosting import run_ghosting_sweep


def _mk(client, headers, status, days_ago, **over):
    body = {
        "company": "Acme",
        "title": "SWE",
        "status": status,
        "date_applied": str(utc_today() - timedelta(days=days_ago)),
        **over,
    }
    r = client.post("/applications", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _status(client, headers, app_id):
    return client.get(f"/applications/{app_id}", headers=headers).json()["status"]


def _sweep() -> int:
    db = SessionLocal()
    try:
        return run_ghosting_sweep(db)
    finally:
        db.close()


def test_exactly_one_transition_and_idempotent(client, auth_headers):
    h = auth_headers
    overdue_applied = _mk(client, h, "applied", 30)         # -> ghosted
    fresh_applied = _mk(client, h, "applied", 5)            # stays
    terminal_offer = _mk(client, h, "offer", 60)            # never auto-changes
    terminal_rejected = _mk(client, h, "rejected", 60)      # never auto-changes
    saved = client.post(
        "/applications", json={"company": "A", "title": "B", "status": "saved"}, headers=h
    ).json()["id"]  # no date_applied

    assert _sweep() == 1  # exactly the one overdue ghostable row

    assert _status(client, h, overdue_applied) == "ghosted"
    assert _status(client, h, fresh_applied) == "applied"
    assert _status(client, h, terminal_offer) == "offer"
    assert _status(client, h, terminal_rejected) == "rejected"
    assert _status(client, h, saved) == "saved"

    # Re-running must not re-process already-ghosted rows.
    assert _sweep() == 0


def test_sweep_never_touches_interviewing_oa_or_failed(client, auth_headers):
    """R2.1/R2.2 — the same sweep that ghosts an overdue `applied` row leaves a
    far more overdue `interviewing_oa` and `failed` row completely alone."""
    h = auth_headers
    overdue_applied = _mk(client, h, "applied", 30)
    overdue_interviewing = _mk(client, h, "interviewing_oa", 400)
    overdue_failed = _mk(client, h, "failed", 400)
    # An aggressive override must not drag an interviewing row in either.
    overdue_interviewing_override = _mk(
        client, h, "interviewing_oa", 10, ghost_days_override=1
    )

    assert _sweep() == 1

    assert _status(client, h, overdue_applied) == "ghosted"
    assert _status(client, h, overdue_interviewing) == "interviewing_oa"
    assert _status(client, h, overdue_failed) == "failed"
    assert _status(client, h, overdue_interviewing_override) == "interviewing_oa"

    # Idempotent with the narrowed scope too.
    assert _sweep() == 0
    assert _status(client, h, overdue_interviewing) == "interviewing_oa"
    assert _status(client, h, overdue_failed) == "failed"


def test_per_application_override_beats_global_default(client, auth_headers):
    h = auth_headers
    # 4 days old but override=3 -> overdue despite the 14-day global default.
    short = _mk(client, h, "applied", 4, ghost_days_override=3)
    # 4 days old, default 14 -> not overdue.
    normal = _mk(client, h, "applied", 4)

    assert _sweep() == 1

    assert _status(client, h, short) == "ghosted"
    assert _status(client, h, normal) == "applied"


def test_boundary_exactly_at_deadline(client, auth_headers):
    h = auth_headers
    # default 14 days; date_applied exactly 14 days ago -> today == deadline -> ghost.
    at_deadline = _mk(client, h, "applied", 14)
    just_under = _mk(client, h, "applied", 13)

    assert _sweep() == 1
    assert _status(client, h, at_deadline) == "ghosted"
    assert _status(client, h, just_under) == "applied"
