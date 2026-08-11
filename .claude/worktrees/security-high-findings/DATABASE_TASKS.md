# jTracks — Database Tasks

**Owns:** `backend/app/models/`, `backend/app/db/`, `backend/alembic/`
**Do not edit:** `backend/app/api/`, `backend/app/schemas/`, `backend/app/services/`, `backend/app/core/`, anything under `frontend/` — those belong to the backend and frontend task lists. If a route needs a model change, add a note in this file rather than editing backend route code directly.

## Shared contract (do not diverge without updating BACKEND_TASKS.md and FRONTEND_TASKS.md)

**`applications` entity**: id (uuid), user_id (uuid, fk), company, title, status (enum: `saved`, `applied`, `interviewing`, `offer`, `rejected`, `ghosted`), job_url (nullable), location (nullable), salary (nullable), date_posted (nullable date), date_saved (nullable date), date_applied (nullable date), ghost_days_override (nullable int — null means use the user's global default), notes (nullable text), created_at, updated_at.

**`users` entity**: id (uuid), email (unique), hashed_password (nullable — null for OAuth-only accounts), google_id (nullable, unique), ghost_days_default (int, default 14), created_at.

---

## Milestone D0: Schema & Migration Foundation

- [x] **D1 — Set up PostgreSQL + SQLAlchemy + Alembic scaffolding** (S)
  Acceptance: `alembic upgrade head` runs cleanly against a local Postgres instance and produces an empty baseline. `DATABASE_URL` read from environment. Engine/session helpers live in `backend/app/db/session.py`.
  Depends on: none

- [x] **D2 — `users` table & migration** (S)
  Fields per shared contract above. Unique constraints on `email` and `google_id`. Model in `backend/app/models/user.py`.
  Acceptance: migration applies cleanly; duplicate email or google_id insert raises an integrity error.
  Depends on: D1

- [x] **D3 — `applications` table & migration** (M)
  Fields per shared contract above. `status` implemented as a Postgres enum type. Foreign key to `users.id` with `ON DELETE CASCADE`. Model in `backend/app/models/application.py`.
  Acceptance: migration applies cleanly; inserting an invalid status value is rejected at the DB level; deleting a user cascades to their applications.
  Depends on: D2

- [x] **D4 — Indexes for common query patterns** (S)
  Add: composite index on `(user_id, status)`, index on `date_applied`, composite `(user_id, date_applied)` for the ghosting job's daily scan.
  Acceptance: `EXPLAIN` on the ghosting-job query and the dashboard status-breakdown query shows index usage, not a sequential scan.
  Depends on: D3

- [x] **D5 — Seed/fixture data script** (S)
  A script (e.g. `backend/scripts/seed.py`) creating one test user and ~20 sample applications spanning every status and a spread of dates, so frontend and dashboard work can proceed without waiting on real usage data.
  Acceptance: running the script twice doesn't duplicate the seed user (idempotent).
  Depends on: D3

- [x] **D6 — Decide data-retention policy for closed applications** (S, decision task)
  PRD leaves this open. Produce a short decision doc (e.g. `docs/decisions/data-retention.md`) stating whether Rejected/Ghosted applications are ever purged/archived or kept indefinitely, so D3's schema (and any future migration) reflects the answer.
  Depends on: none — but resolve before treating D3 as final

## Notes for parallel work
- Backend tasks that touch the database (B2, B5, B9, B14) only need D2/D3/D4 merged, not this whole file finished — flag D2 and D3 as done as soon as they're mergeable so backend isn't blocked longer than necessary.
- Frontend does not depend on this file at all — it builds against the shared contract directly (see FRONTEND_TASKS.md), using mocked data until the real API is live.
