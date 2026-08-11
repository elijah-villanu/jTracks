# jTracks — Backend Tasks

**Owns:** `backend/app/api/`, `backend/app/schemas/`, `backend/app/services/`, `backend/app/core/`, `backend/app/scheduler/`
**Read-only:** `backend/app/models/`, `backend/app/db/` (owned by DATABASE_TASKS.md — import from these, don't edit them; if a model needs to change, note it rather than editing directly)
**Do not edit:** anything under `frontend/`

## Shared contract (do not diverge without updating DATABASE_TASKS.md and FRONTEND_TASKS.md)

Same `applications`/`users` entity fields as in DATABASE_TASKS.md.

**API surface (v1):**
```
POST   /auth/signup
POST   /auth/login
POST   /auth/oauth/google
GET    /auth/me

GET    /applications?status=
POST   /applications
GET    /applications/{id}
PATCH  /applications/{id}
DELETE /applications/{id}
POST   /applications/autofill        { url } -> parsed fields | { unsupported: true } | { failed: true }

GET    /settings
PATCH  /settings                     { ghost_days_default }

GET    /dashboard/stats?range=week|month|all
GET    /dashboard/recap?range=week|month
```

---

## Milestone B0: Foundation

- [x] **B1 — FastAPI project scaffolding** (S)
  App factory, CORS config, pydantic-settings-based config, OpenAPI/Swagger at `/docs`, `GET /health`.
  Acceptance: `/docs` renders; health check returns 200.
  Depends on: none. Build against placeholder models if D1–D3 aren't merged yet; swap in real models once available.

## Milestone B1: Auth

- [x] **B2 — Email/password auth** (M)
  `POST /auth/signup`, `POST /auth/login` (issues JWT), `GET /auth/me`. Passwords hashed with bcrypt/argon2.
  Acceptance: duplicate signup email rejected; bad credentials return 401; `/auth/me` requires a valid JWT.
  Depends on: D2

- [x] **B3 — Google OAuth** (M)
  `POST /auth/oauth/google` verifies a Google ID token, creates or links a user by `google_id`/email.
  Acceptance: signing up via Google then logging in again with the same account returns the same user record.
  Depends on: D2, B2

- [x] **B4 — Per-user data isolation dependency** (S)
  Reusable FastAPI dependency resolving the current user from the JWT; every applications query scoped to that `user_id`.
  Acceptance: requesting another user's application by ID returns 404, never another user's data.
  Depends on: B2

## Milestone B2: Core application CRUD

- [x] **B5 — Applications CRUD API** (M)
  `GET/POST /applications`, `GET/PATCH/DELETE /applications/{id}`.
  Acceptance: full CRUD exercised via Swagger UI; results scoped per B4.
  Depends on: D3, B4

- [x] **B6 — Status-transition validation** (S)
  Central rule set for allowed manual transitions (e.g. Saved→Applied requires `date_applied`); Offer/Rejected remain manually editable but are excluded from auto-transition (see B9).
  Acceptance: unit tests cover each allowed and disallowed transition.
  Depends on: B5

- [x] **B7 — Ghost-settings endpoints** (S)
  `GET/PATCH /settings` for the global default; `PATCH /applications/{id}` accepts `ghost_days_override`.
  Depends on: B5

## Milestone B3: Auto-ghosting

- [x] **B8 — Spike: choose scheduler mechanism** (S, decision task)
  PRD flags hosting as undecided, which drives this choice. Evaluate in-process APScheduler vs. platform cron vs. Celery+Redis given "single developer, portfolio project, no hard deadline." Document the decision.
  Depends on: none — blocks B9

- [x] **B9 — Daily auto-ghosting job** (M)
  Scans Applied/Interviewing applications past their ghost limit (override or global default) and flips them to Ghosted.
  Acceptance: integration test with a backdated `date_applied` confirms exactly-one transition; re-running the job doesn't re-process already-Ghosted rows.
  Depends on: D4, B7, B8

## Milestone B4: Autofill

- [x] **B10 — Greenhouse parser** (M)
  Given a Greenhouse job URL, consume its public Job Board API where available (or the embedded JSON) to extract company, title, location, salary, date_posted.
  Acceptance: correct extraction against 3–5 real Greenhouse URLs; unsupported/malformed URL returns a clean "unsupported" result, never a throw.
  Depends on: B5

- [x] **B11 — Spike: Workday parsing feasibility** (M, decision task)
  Investigate 3–5 real Workday postings' HTML/embedded JSON. Determine whether a reliable extraction pattern exists; document findings and a go/no-go.
  Depends on: none — blocks B12

- [x] **B12 — Workday parser** (M)
  Implement extraction per B11's chosen strategy, same output contract as B10.
  Depends on: B11

- [x] **B13 — `POST /applications/autofill` endpoint** (S)
  Routes a pasted URL to the Greenhouse or Workday parser by hostname; returns parsed fields on success or a structured unsupported/failed result for everything else (unknown domain, parser exception, timeout) — never a 500.
  Acceptance: linkedin.com/glassdoor.com URLs and simulated parser exceptions both return the same graceful "fall back to manual entry" response shape.
  Depends on: B10, B12

## Milestone B5: Dashboard & recap

- [x] **B14 — Dashboard stats endpoint** (M)
  `GET /dashboard/stats?range=` returns status breakdown, applications-over-time series, response rate, ghost rate, avg time-to-response.
  Acceptance: responds in <1s against the D5 seed dataset; values verified by hand against the seed data.
  Depends on: D4, B5

- [x] **B15 — Spike: recap image generation approach** (S, decision task)
  PRD leaves client-side vs. server-side rendering open. Decide, weighing the transparent-background/Stories-aspect requirement against "portfolio project, favor simplicity."
  Depends on: none — blocks B16 and FRONTEND_TASKS.md's F8

- [x] **B16 — Recap endpoint** (M, scope set by B15)
  If server-side chosen: `GET /dashboard/recap` returns a rendered transparent PNG. If client-side chosen: returns just the stats payload for the frontend to render.
  Depends on: B14, B15

## Milestone B6: Deployment

- [x] **B17 — Deployment configuration** (S)
  Dockerfile/process config for the FastAPI app + Postgres connection; documented environment variables.
  Depends on: none, informed by B8

## Notes for parallel work
- B8, B11, and B15 are decision spikes with no code dependency on the other two files — do these early since several later backend tasks (and one frontend task) block on their outcomes.
- Frontend does not need this file's endpoints to be live to start (F1–F4, F7 build against mocked data matching the contract above); it needs this file's contract to stay accurate.
