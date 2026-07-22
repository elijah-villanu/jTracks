# Note: Consuming DATABASE_TASKS models & the SQLite-dev tradeoff

Status: Accepted — 2026-07-22
Author: Backend (solo developer)
Related: BACKEND_TASKS.md B1, DATABASE_TASKS.md D1–D4.

## What happened

BACKEND_TASKS.md B1 instructed the backend workstream to "build against
placeholder models if D1–D3 aren't merged yet; swap in real models once
available." By the time the backend build started, a **DATABASE_TASKS workstream
had already produced real models and a db session** under `backend/app/models/`
and `backend/app/db/`:

- `backend/app/db/session.py`, `backend/app/db/base.py`
- `backend/app/models/user.py` (`User`)
- `backend/app/models/application.py` (`Application`, `ApplicationStatus`)
- `backend/app/models/__init__.py`

Per the ownership rules ("Read-only: `backend/app/models/`, `backend/app/db/` …
import from these, don't edit them; if a model needs to change, note it rather
than editing directly"), the backend workstream **consumes these real models
as-is** and did NOT create its own placeholders. No files under `models/` or
`db/` were written or edited by the backend workstream.

The backend imports only these stable symbols:

- `from app.models.user import User`
- `from app.models.application import Application, ApplicationStatus`
- `from app.db.base import Base`
- `from app.db.session import get_db, SessionLocal, engine`

`ApplicationStatus` members are UPPERCASE-named with lowercase values
(`ApplicationStatus.SAVED == "saved"`, etc.). Backend code uses the members.

## Dev/prod database tradeoff (SQLite locally, Postgres in prod)

Production is **PostgreSQL** per the PRD. There is no live Postgres in this dev
environment, so the backend runs against **SQLite** for local dev and tests. The
DATABASE models are Postgres-flavored (`sqlalchemy.dialects.postgresql.UUID`,
native enum) but, verified empirically, run cleanly on SQLite under SQLAlchemy
2.0: the pg `UUID` type renders as `CHAR(32)` and the native enum falls back to
`VARCHAR` + `CHECK` on SQLite. `Base.metadata.create_all(engine)` succeeds on
both. No shim was needed.

Backend config (`app/core/config.py`) defaults `DATABASE_URL` to SQLite for dev.
Note that the DATABASE workstream's `db/session.py` reads `os.environ[
"DATABASE_URL"]` **directly and with no default**, so `DATABASE_URL` must be
present in the process environment before `app.db.session` is imported. The
backend handles this in:

- **tests** — `tests/conftest.py` sets `DATABASE_URL` (a temp SQLite file)
  before importing the app;
- **run/seed scripts & Docker** — documented in `backend/.env.example` and set
  in `backend/README.md` / `Dockerfile` / `docker-compose.yml`.

## Notes flagged back to DATABASE_TASKS (not edited here)

These are observations only — the backend did not change model/db files:

1. `db/session.py` requires `DATABASE_URL` in the OS environment at import time
   (`os.environ[...]`). A `.env`-aware default (or reading from
   `app.core.config`) would make the app importable without pre-setting the env
   var. Left as-is to respect ownership.
2. Schema materialization for dev/test currently relies on
   `Base.metadata.create_all()` (invoked by the backend only when
   `AUTO_CREATE_TABLES=true`). In production, Alembic (D1) should own schema
   creation and `AUTO_CREATE_TABLES` should be false.
3. D4 indexes are already declared on the `Application` model
   (`ix_applications_user_id_status`, `ix_applications_user_id_date_applied`, and
   an index on `date_applied`), matching the ghosting-scan and dashboard query
   patterns the backend relies on.

## Status of the DATABASE workstream at time of writing

By the time the backend build finished, the DATABASE workstream had produced:
`db/session.py` + `db/base.py`, `models/{user,application}.py`, Alembic
scaffolding (`alembic/`, `alembic.ini`) with migrations `0001_create_users_table`
and `0002_create_applications_table` (D1–D3), and an idempotent
`scripts/seed.py` (D5). The backend consumes all of these and adds nothing under
`models/`, `db/`, `alembic/`, or `scripts/`.
