# jTracks V2 — Database Tasks

**Source of truth:** [`PRD_V2.md`](./PRD_V2.md). V1's shipped requirements are in [`PRD.md`](./PRD.md);
where V2 changes V1 behavior, V2 wins.

**Owns:** `backend/app/models/`, `backend/app/db/`, `backend/alembic/`, `backend/scripts/`
**Do not edit:** `backend/app/api/`, `backend/app/schemas/`, `backend/app/services/`, `backend/app/core/`,
`backend/app/scheduler/`, anything under `frontend/` — those belong to BACKEND_TASKS.md and
FRONTEND_TASKS.md. If a route or service needs a model change, note it here rather than editing
their code directly.

**Task IDs continue from V1** (D1–D6 are the shipped MVP tasks, archived at
[`v1/DATABASE_TASKS.md`](./v1/DATABASE_TASKS.md)). V2 starts at **D7**, so a reference to "D3" always
means the same thing in both documents.

## Shared contract (do not diverge without updating BACKEND_TASKS.md and FRONTEND_TASKS.md)

**`applications` entity** — unchanged from V1 *except the status enum*:
id (uuid), user_id (uuid, fk), company, title, **status (enum, 7 values — see below)**, job_url
(nullable), location (nullable), salary (nullable), date_posted (nullable date), date_saved (nullable
date), date_applied (nullable date), ghost_days_override (nullable int — null means use the user's
global default), notes (nullable text), created_at, updated_at.

**`ApplicationStatus` (V2 — 6 → 7 values, hard cutover, no alias for the old `interviewing`):**

| Stored value | Display label (FRONTEND owns) | Meaning |
|---|---|---|
| `saved` | Saved | Bookmarked, not yet submitted |
| `applied` | Applied | Submitted; ghosting clock running |
| `interviewing_oa` | Interviewing / OA | In an interview loop or online assessment |
| `offer` | Offer | Offer received |
| `rejected` | Rejected | Rejected — *by convention*, before reaching interview/OA |
| `failed` | Failed Interview/OA | Reached interview/OA and did not pass |
| `ghosted` | Ghosted | No response past the threshold |

The pre/post-interview meaning of `rejected` vs `failed` is a **reporting convention only** (PRD R1.4).
It is *not* a DB constraint, not a transition rule, and gets no CHECK constraint.

**`users` entity** — unchanged from V1: id (uuid), email (unique), hashed_password (nullable),
google_id (nullable, unique), ghost_days_default (int, default 14), created_at.

**`refresh_tokens` entity (NEW — PRD R7.3):**

| Column | Notes |
|---|---|
| `id` | UUID PK |
| `user_id` | FK → `users.id`, `ON DELETE CASCADE` (matches the existing `applications` pattern) |
| `token_hash` | Hash of the token, **never** the raw value. Unique + indexed — every refresh looks a row up by this |
| `expires_at` | Absolute expiry (timestamptz) |
| `revoked_at` | Nullable timestamptz; non-null means revoked |
| `created_at` | timestamptz |

**Deletion semantics (unchanged, restated because V2 adds analytics that could tempt otherwise):**
deletes are **hard deletes** at every status. No soft-delete, no tombstone column. A deleted row must
never appear in any dashboard, recap or Sankey figure.

**No status-history table in V2.** `application_status_events` was scoped and declined (PRD "Known
limitation"). Do not add one opportunistically — it changes every analytics definition downstream.

---

## Milestone DV1: Status model (delivery stage 1 — PRD R1)

- [x] **D7 — Widen `ApplicationStatus` to the V2 seven-value enum** (S)
  In `backend/app/models/application.py`: rename member `INTERVIEWING` → `INTERVIEWING_OA` with stored
  value `interviewing_oa`, and add `FAILED = "failed"`. Keep the existing `SAEnum(..., name="application_status",
  native_enum=True, values_callable=...)` configuration so the stored values stay exactly these strings.
  No alias for `interviewing` — the API returning `422` for it (BACKEND's B19) depends on
  `ApplicationStatus("interviewing")` raising.
  Acceptance: the enum exposes exactly the 7 values above; `ApplicationStatus("interviewing")` raises
  `ValueError`; `ApplicationStatus("failed")` and `ApplicationStatus("interviewing_oa")` resolve.
  Depends on: none — **blocks almost everything in the other two files.** Do this first and merge it
  early; backend and frontend both stall behind it.

- [x] **D8 — Alembic migration `0003` for the enum change** (M)
  PRD R1.6. Postgres: `ALTER TYPE application_status RENAME VALUE 'interviewing' TO 'interviewing_oa'`
  followed by `ALTER TYPE application_status ADD VALUE 'failed'`. **`ADD VALUE` has transaction-block
  restrictions on older Postgres** — either pin the target server version or run that statement on an
  autocommit connection (`op.get_bind().execution_options(isolation_level="AUTOCOMMIT")`) so the
  migration works against the version actually deployed. SQLite (dev/test) stores the enum as a plain
  string with no native type, so the DDL is effectively a no-op there — but any seeded/fixture rows
  still holding `interviewing` must be `UPDATE`d.
  Downgrade: reverse the rename; a value cannot be dropped from a Postgres enum, so state explicitly in
  the migration whether downgrade re-maps `failed` rows to `rejected` or refuses outright — do not leave
  rows holding a value the model can't parse.
  **No backfill of existing `rejected` rows** — rows keep whatever status they have; the new semantics
  apply going forward only.
  Acceptance: `alembic upgrade head` and `alembic downgrade -1` both run clean against Postgres *and*
  the SQLite dev DB; after upgrade, no row holds `interviewing` and inserting that value is rejected at
  the DB level on Postgres.
  Depends on: D7

- [x] **D9 — Refresh the seed script for the V2 vocabulary and V2 ranges** (S)
  `backend/scripts/seed.py` currently seeds `interviewing` rows and a V1-sized date spread. Update to
  `interviewing_oa`, add `failed` rows, and spread `date_applied` across **more than 12 months** so
  `year`, `all` and `custom` ranges return visibly different data (the PRD flags "year vs all may be
  indistinguishable" as a risk — the seed data shouldn't make it worse). Include at least one row in
  each of the five non-`saved` terminal/mid statuses so all five Sankey links are non-zero, and at least
  one `interviewing_oa` row whose `updated_at` is older than 28 days so FRONTEND's staleness nudge (R3)
  has something to render.
  Acceptance: after seeding, `GET /dashboard/stats?range=year` and `?range=week` return different
  totals; the Sankey payload has no zero-valued links; running the script twice still doesn't duplicate
  the seed user.
  Depends on: D7, D8

## Milestone DV2: Index coverage for expanded ranges (delivery stage 2 — PRD R6 + performance NFR)

- [x] **D10 — Verify index coverage for the `year` / `all` / `custom` scans** (S)
  The `all` and `year` ranges scan more rows than any V1 query did, and `custom` adds an upper bound
  (`date_applied BETWEEN start AND end`) that V1 never issued. Confirm the existing
  `ix_applications_user_id_date_applied` still serves the widened predicate, and that the single
  aggregate pass backing `status_breakdown` + the Sankey (BACKEND's B24) doesn't fall back to a
  sequential scan. Add a covering index and the migration here if it does — do not let BACKEND work
  around it with a second query.
  Acceptance: `EXPLAIN` against the D9 seed dataset shows index usage for a `year` window, an `all`
  window and a 366-day `custom` window; dashboard queries stay under ~1s (performance NFR).
  Depends on: D9. Informs BACKEND's B21/B22/B24.

## Milestone DV3: Refresh-token store (delivery stage 4 — PRD R7.3)

> This milestone is **independent of DV1/DV2** and is **not blocked by BACKEND's B25 SameSite spike** —
> the table shape is fixed by R7.3 regardless of which cookie topology is chosen. It can be built in
> parallel with the status-model work.

- [x] **D11 — `refresh_tokens` model** (S)
  New model at `backend/app/models/refresh_token.py` per the shared contract above, exported from
  `app/models/__init__.py` so `Base.metadata` picks it up. `token_hash` gets a **unique** index — it is
  the lookup key on every `POST /auth/refresh`, so an unindexed column means a full scan on the hot auth
  path. `user_id` FK with `ON DELETE CASCADE`, matching `applications`. Timestamps are timezone-aware.
  Storing only the hash is a hard security requirement (PRD NFR) — the raw token value must have no
  column to live in.
  Acceptance: model imports cleanly; `Base.metadata` includes `refresh_tokens`; deleting a user cascades
  to their refresh tokens.
  Depends on: none

- [x] **D12 — `refresh_tokens` migration `0004`** (S)
  Creates the table and the unique index on `token_hash`.
  Acceptance: `alembic upgrade head` / `downgrade -1` clean on both Postgres and SQLite; inserting two
  rows with the same `token_hash` raises an integrity error; deleting the owning user removes them.
  Depends on: D11

## Notes for parallel work

- **D7 is the critical path for the whole release.** BACKEND's B18/B19/B20 and FRONTEND's F10 all sit
  behind the enum. Merge D7 (and ideally D8) as soon as they're mergeable rather than batching them with
  the rest of this file — the same way V1 flagged D2/D3 early.
- D7 and D8 will break `backend/tests/*` and `backend/scripts/seed.py` on merge, because those still
  reference `interviewing`. D9 fixes the seed; the test files belong to BACKEND (B18/B20/B21) — land D7,
  D8 and the backend enum tasks together, or expect a red suite in between.
- **DV3 (D11/D12) has no dependency on DV1/DV2 or on the B25 spike** — it is the one V2 database chunk
  that can be done at any point, including first if the refresh-token work gets parallelized.
- FRONTEND depends on this file only through the shared contract above (status values, and the fact that
  `refresh_tokens` exists at all is invisible to it) — it builds against MSW mocks per FRONTEND_TASKS.md.
