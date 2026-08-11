# jTracks — Backend (FastAPI)

Job-application tracker API: auth (email/password + Google OAuth), per-user
application CRUD, a status pipeline with validated transitions, a daily
auto-ghosting job, autofill from Greenhouse/Workday posting URLs, and a
dashboard/recap stats surface.

## Stack

- **FastAPI** (pinned `0.115.x` — see note below) + **Uvicorn**
- **SQLAlchemy 2.0** models (owned by the DATABASE workstream) — PostgreSQL in
  production, SQLite for local dev/tests
- **Alembic** migrations (owned by the DATABASE workstream)
- **python-jose** (JWT) + **bcrypt** (password hashing)
- **google-auth** (Google ID-token verification)
- **APScheduler** (in-process daily ghosting job)
- **httpx** (autofill outbound requests)

> Pinning note: FastAPI `0.139+` pulls a Starlette that requires the brand-new
> `httpx2` for its TestClient. We pin to the mature `fastapi 0.115` /
> `starlette 0.41` / `httpx 0.27` stack — the well-documented common path the
> PRD asks for.

## Layout (backend workstream owns everything except `models/`, `db/`, `alembic/`)

```
app/
  main.py                 # app factory: CORS, /docs, routers, scheduler lifespan
  core/                   # config (pydantic-settings), security (JWT + bcrypt)
  api/
    deps.py               # get_current_user (per-user isolation)
    routes/               # health, auth, applications, settings, dashboard
  schemas/                # pydantic request/response models
  services/               # auth, applications, transitions, ghosting,
                          # dashboard, recap, autofill/{greenhouse,workday,dispatcher}
  scheduler/              # APScheduler wiring for the daily sweep
  models/  db/            # SQLAlchemy models + session (DATABASE workstream)
tests/                    # pytest suite
```

## Running locally (SQLite, no external services)

```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate      # Windows Git Bash
# (or:  source .venv/bin/activate  on macOS/Linux)
pip install -r requirements.txt

# db/session.py reads DATABASE_URL from the OS env — export it before running:
export DATABASE_URL="sqlite:///./jtracks_dev.db"
export AUTO_CREATE_TABLES=true          # dev only, and opt-in: the default is
                                        # false so a forgotten variable can
                                        # never create_all() in production

uvicorn app.main:app --reload
# -> http://127.0.0.1:8000/docs   (Swagger UI)
# -> http://127.0.0.1:8000/health
```

## Tests

```bash
cd backend
pytest            # uses a throwaway SQLite DB; scheduler disabled in tests
```

## Running against PostgreSQL (production-like)

```bash
cd backend
docker compose up --build         # FastAPI + Postgres; runs `alembic upgrade head`
```

Or manually:

```bash
export DATABASE_URL="postgresql+psycopg://user:pass@host:5432/jtracks"
export AUTO_CREATE_TABLES=false     # Alembic owns the schema in prod
pip install "psycopg[binary]"
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Environment variables

See `.env.example` for the full list. Key ones:

| Var | Purpose | Dev default |
|-----|---------|-------------|
| `DATABASE_URL` | SQLAlchemy URL (read at import by `db/session.py`) | — (set it) |
| `AUTO_CREATE_TABLES` | Create tables on startup (dev only) | `false` — opt in |
| `JWT_SECRET` | HMAC secret for access tokens | random per process; **required** (≥32 chars) outside development |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Bound into tokens as `iss`/`aud` and required at verification | `jtracks` / `jtracks-api` |
| `GOOGLE_CLIENT_ID` | OAuth client ID for ID-token verification | empty |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins (`*` rejected) | Vite localhost |
| `MAX_REQUEST_BODY_BYTES` | Bodies above this get a `413` before being read | `1048576` (1 MiB) |
| `RATE_LIMIT_*` | Per-IP budgets on auth + autofill endpoints | see `.env.example` |
| `RUN_SCHEDULER` | Run the in-process ghosting job here | `true` |
| `GHOSTING_JOB_HOUR` / `_MINUTE` | Daily sweep time (UTC) | `03:00` |

### Security-relevant behaviour

- **`/docs`, `/redoc` and `/openapi.json` are served only when `ENVIRONMENT` is
  a development value** (`development`/`dev`/`local`/`test`/`testing`). Anywhere
  else they 404 — the schema is a free map of the API for anyone probing it.
- **The app refuses to start outside development without a strong `JWT_SECRET`.**
  That is deliberate: a predictable signing key lets anyone mint a token for any
  user id and walk past every per-user access control.
- Regression tests for all of the above live in `tests/test_security_regression.py`
  and `tests/test_security_regression_medium.py`; see `SECURITY_AUDIT.md`.

## The daily ghosting job

Runs in-process (APScheduler) once daily and on boot; flips overdue
Applied/Interviewing applications to Ghosted. Idempotent — safe to re-run. Also
runnable standalone (e.g. for platform cron):

```bash
python -m app.scheduler.ghosting_scheduler
```

See `docs/decisions/scheduler-mechanism.md`.

## Design decisions

- `docs/decisions/scheduler-mechanism.md` — APScheduler (B8)
- `docs/decisions/workday-parsing-feasibility.md` — Workday GO via CXS JSON (B11)
- `docs/decisions/recap-image-approach.md` — client-side render (B15)
- `docs/decisions/placeholder-models-bootstrap.md` — models/db consumption + SQLite tradeoff
