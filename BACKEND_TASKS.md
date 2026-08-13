# jTracks V2 — Backend Tasks

**Source of truth:** [`PRD_V2.md`](./PRD_V2.md). V1's shipped requirements are in [`PRD.md`](./PRD.md);
where V2 changes V1 behavior, V2 wins.

**Owns:** `backend/app/api/`, `backend/app/schemas/`, `backend/app/services/`, `backend/app/core/`,
`backend/app/scheduler/`, `backend/tests/`, `backend/API_SPEC_V1.md` (frozen as historical by B30) and
`backend/API_SPEC_V2.md` (created by B30)
**Read-only:** `backend/app/models/`, `backend/app/db/`, `backend/alembic/`, `backend/scripts/` (owned by
DATABASE_TASKS.md — import from these, don't edit them; if a model needs to change, note it there rather
than editing directly)
**Do not edit:** anything under `frontend/`

**Task IDs continue from V1** (B1–B17 are the shipped MVP tasks, archived at
[`v1/BACKEND_TASKS.md`](./v1/BACKEND_TASKS.md)). V2 starts at **B18**, so a reference to "B14" always
means the same thing in both documents.

---

## Shared contract (do not diverge without updating DATABASE_TASKS.md and FRONTEND_TASKS.md)

Same `applications` / `users` / `refresh_tokens` entity fields as in DATABASE_TASKS.md, including the
7-value `ApplicationStatus` enum.

> ### ⚠️ Read before touching any date logic
> **Every date/time value in V2 goes through `backend/app/core/clock.py`** (`utc_now()`, `utc_today()`,
> `to_utc_date()`). Never `date.today()`, never `datetime.now()`, never `.date()` on a stored
> `timestamptz`. This is a hard requirement (PRD R2.4 and the correctness NFR), not a style preference:
> `clock.py` exists because the V1 dashboard computed `updated_at.date() - date_applied` across two
> different calendars and reported every response time a day high on any non-UTC host. Expanded ranges
> (R6) and the Sankey are exactly the class of work that reintroduces it. `to_utc_date()` in particular
> is required whenever a stored timestamp is compared against a `date` column, because psycopg hands
> back `timestamptz` in the *session* timezone.

**API surface (V2).** Changes from V1 marked. Every one of these is a **breaking change** to
`backend/API_SPEC_V1.md`, which B30 replaces with a standalone `backend/API_SPEC_V2.md`.

```
POST   /auth/signup                  CHANGED: additionally sets the refresh cookie
POST   /auth/login                   CHANGED: additionally sets the refresh cookie
POST   /auth/oauth/google            CHANGED: additionally sets the refresh cookie
POST   /auth/refresh                 NEW  -> { access_token, token_type } | 401
POST   /auth/logout                  NEW  -> 204 always (idempotent)
GET    /auth/me

GET    /applications?status=         CHANGED: status is one of 7 values; `interviewing` -> 422
POST   /applications
GET    /applications/{id}
PATCH  /applications/{id}            CHANGED: V2 transition matrix (R1.5)
DELETE /applications/{id}
POST   /applications/autofill        unchanged

GET    /settings                     unchanged
PATCH  /settings                     unchanged

GET    /dashboard/stats?range=week|month|year|all|custom[&start=&end=]    CHANGED
GET    /dashboard/recap?range=week|month|year|all|custom[&start=&end=]    CHANGED
```

**Both dashboard endpoints gain a `sankey` object** with explicit nodes and links — the frontend must
never re-derive the topology:

```json
"sankey": {
  "nodes": [
    { "key": "applied",         "label": "Applied",            "value": 120 },
    { "key": "interviewing_oa", "label": "Interviewing / OA",  "value": 34 },
    { "key": "rejected",        "label": "Rejected",           "value": 51 },
    { "key": "ghosted",         "label": "Ghosted",            "value": 28 },
    { "key": "offer",           "label": "Offer",              "value": 3 },
    { "key": "failed",          "label": "Failed Interview/OA","value": 19 }
  ],
  "links": [
    { "source": "applied",         "target": "interviewing_oa", "value": 34 },
    { "source": "applied",         "target": "rejected",        "value": 51 },
    { "source": "applied",         "target": "ghosted",         "value": 28 },
    { "source": "interviewing_oa", "target": "offer",           "value": 3 },
    { "source": "interviewing_oa", "target": "failed",          "value": 19 }
  ]
}
```

**Metric contract (V2):** `status_breakdown` is exactly 6 entries (all non-`saved` statuses, fixed order
`applied, interviewing_oa, offer, rejected, failed, ghosted`, zero counts included);
`response_rate = (interviewing_oa + offer + rejected + failed) / total`; `ghost_rate = ghosted / total`;
**`rejection_rate` is removed and replaced by `rejection_fail_rate = (rejected + failed) / total`**;
`avg_time_to_response_days` unchanged (still the `updated_at` proxy, still nullable). All rates are
percentages 0–100 rounded to 1 decimal, `0.0` when `total` is 0. Both endpoints still consider **only
submitted applications** (non-null `date_applied`), so `saved` rows remain invisible to all stats.

**R3 (the 28-day staleness nudge) requires no API change** — the frontend computes it client-side from
the `updated_at` already returned by `GET /applications`. Do not add an endpoint, a field or a job for it.

---

## Milestone BV1: Status model & ghosting scope (delivery stage 1 — R1, R2)

- [ ] **B18 — Replace `ALLOWED_TRANSITIONS` with the V2 transition matrix** (M)
  Rewrite `backend/app/services/transitions.py` to encode R1.5 exactly:

  | From ↓ / To → | `saved` | `applied` | `interviewing_oa` | `offer` | `rejected` | `failed` | `ghosted` |
  |---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
  | `saved` | — | yes | no | no | no | no | no |
  | `applied` | no | — | yes | yes | yes | yes | yes |
  | `interviewing_oa` | no | yes | — | yes | yes | yes | yes |
  | `offer` | no | no | yes | — | yes | yes | no |
  | `rejected` | no | yes | yes | no | — | yes | no |
  | `failed` | no | yes | yes | yes | yes | — | no |
  | `ghosted` | no | yes | yes | yes | yes | yes | — |

  Self-transitions stay always-allowed; anything unlisted is a `400`. Carry forward the V1 rules:
  nothing returns to `saved`, and any move **into** `applied` requires the row to end up with a non-null
  `date_applied` (server-defaulted to `clock.utc_today()` when the client omits it).
  **Do not add validation enforcing the pre/post-interview split** (R1.4) — `applied → failed` and
  `interviewing_oa → rejected` are both legal. The convention is a reporting convention, and the product
  relies on labeling, not lockout.
  Acceptance: `backend/tests/test_transitions.py` rewritten to assert all 42 non-self ordered pairs plus
  the 7 self-transitions against the table above; `applied → failed` allowed; `offer → ghosted` refused.
  Depends on: D7

- [ ] **B19 — Carry the 7-value enum through schemas and the status filter** (S)
  `app/schemas/application.py` and `GET /applications?status=`. No alias, no deprecation shim — a request
  sending `status=interviewing` is a `422` from pydantic, not a `400` and not a `500`.
  Acceptance: `PATCH /applications/{id}` with `status=interviewing` returns `422`; `failed` and
  `interviewing_oa` are accepted on create, patch and the list filter; `GET /applications?status=failed`
  filters correctly.
  Depends on: D7

- [ ] **B20 — Narrow the ghosting sweep to `applied` only** (S)
  R2. In `transitions.py`: `GHOSTABLE_STATUSES` becomes `frozenset({S.APPLIED})`, and `FAILED` joins
  `OFFER`/`REJECTED` in `TERMINAL_STATUSES`. `app/services/ghosting.py` needs no logic change beyond
  picking up the narrowed set — keep it daily, UTC (`utc_today()`), idempotent, and driven by
  `date_applied + effective_days`. Once a row reaches `interviewing_oa`, only the user moves it to
  `ghosted` (R2.3); `failed → ghosted` is a legal *manual* transition but never an automatic one (R2.2).
  Acceptance: `tests/test_ghosting.py` gains a case where a long-overdue `interviewing_oa` row and a
  long-overdue `failed` row are both untouched by the same sweep that correctly ghosts an overdue
  `applied` row; re-running the sweep transitions nothing (idempotency preserved). This is a stated V2
  success metric — "the ghosting sweep produces zero transitions on `interviewing_oa` rows."
  Depends on: D7, B18

## Milestone BV2: Metric redefinitions & expanded ranges (delivery stage 2 — R4, R6)

> Backend-first by design (PRD delivery sequence): get the numbers and the windows right before anything
> draws them.

- [ ] **B21 — Redefine the dashboard metrics for the V2 status set** (M)
  `app/services/dashboard_service.py` + `app/schemas/dashboard.py`. Implement R4.1–R4.5 per the metric
  contract above: 6-entry fixed-order `status_breakdown` including zero counts; the widened
  `response_rate`; **rename `rejection_rate` → `rejection_fail_rate` and remove the old field outright**
  (hard cutover, no alias); the recap's derived "Interviews" count becomes
  `interviewing_oa + offer + failed` (R4.5 — `offer` and `failed` necessarily passed through interview).
  Keep `_RESPONDED` in sync with R4.2 so `avg_time_to_response_days` averages over the same population
  the rate describes, and keep its documented `updated_at`-proxy caveat comment (R4.6 — V2 does not fix
  this).
  Acceptance: values hand-verified against the D9 seed dataset; `status_breakdown` has exactly 6 entries
  in R4.1's order even when `total` is 0; every rate is `0.0` at `total = 0`; no response anywhere still
  contains a `rejection_rate` key.
  Depends on: D7, D9

- [ ] **B22 — Expanded range set and custom-range validation** (M)
  R6.1–R6.5, on `GET /dashboard/stats`. Accept `week | month | year | all | custom`. For `custom`:
  `start` and `end` are both required, `start <= end`, and the **inclusive** day count
  `(end - start).days + 1` must be 1–366 (the cap accommodates a leap year) — anything else is a `422`.
  Bucketing per R6.4 (week → 7 daily zero-filled points; month → 30 daily; year → 12 monthly zero-filled;
  all → monthly, data months only, unchanged; custom → daily zero-filled if span ≤ 92 days, else
  monthly), and `time_series_granularity` must always report which was actually used. All window
  boundaries computed in UTC via `clock.py`.
  Acceptance: a 367-day custom span returns `422`; a 92-day span returns daily points with granularity
  `day` and a 93-day span returns monthly; `range=year` returns exactly 12 points; `range=week` exactly
  7; **the diff contains no `date.today()` or `datetime.now()`**.
  Depends on: B21

- [ ] **B23 — Put the recap on the shared range set and V2 period labels** (S)
  `GET /dashboard/recap` currently accepts only `week|month` and carries its own `_period()` helper.
  Unify it with B22's range handling so both endpoints take an identical range set, and implement R6.3's
  labels: `"This week"`, `"This month"`, `"This year"`, `"All time"`, and for custom the actual range
  (e.g. `"Jan 1 – Mar 15, 2026"`). Add a **"Rejection/fail rate"** highlight alongside the existing V1
  tiles — R5.1 is explicit that every existing highlight survives, the Sankey is additive.
  Acceptance: all five ranges return a correct `period_label` / `period_start` / `period_end`; the
  `Interviews` highlight uses R4.5's definition; `RecapRangeParam` is gone in favour of the shared type.
  Depends on: B21, B22

## Milestone BV3: Sankey payload (delivery stage 3 — R5)

- [ ] **B24 — Emit the `sankey` object from both dashboard endpoints** (M)
  R5.3/R5.5. Nodes and links exactly as in the shared contract above. Derivation, over the selected
  range's submitted applications only: `Applied` node value = all submitted; `Applied → Interviewing/OA`
  = `interviewing_oa + offer + failed`; `Applied → Rejected` = `rejected`; `Applied → Ghosted` =
  `ghosted`; `Interviewing/OA → Offer` = `offer`; `Interviewing/OA → Failed Interview/OA` = `failed`.
  **Computed from the same aggregate pass as `status_breakdown`, not a second set of queries**
  (performance NFR — `year` and `all` already scan more rows than any V1 query).
  R5.4: rows still sitting in `applied` or `interviewing_oa` **do not flow anywhere** — no "pending"
  node, no synthetic terminal edge. A node's outgoing links legitimately sum to less than its value, and
  the payload must not fabricate a link to balance it.
  R5.6: when `total` is 0, still return a well-formed object (all six nodes at value 0, empty `links`)
  rather than omitting the key — the frontend should have exactly one shape to render.
  Acceptance: against a hand-built fixture, `Applied → Interviewing / OA` equals
  `interviewing_oa + offer + failed` and the three `Applied` outflows sum to `total` minus the rows still
  in `applied`; `total = 0` returns the zero payload; the endpoint issues no additional DB round-trip
  versus B21 (assert by query count or by review).
  Depends on: B21. **Blocks FRONTEND's F16.**

## Milestone BV4: Session lifecycle — refresh tokens & revocation (delivery stage 4 — R7)

> Independent of BV1–BV3 and parallelizable, **but B25 must land before B28/B29.** The PRD says so in
> its own risks section: resolve the deployment-topology question *before* R7 is implemented, not after.

- [ ] **B25 — Spike: deployment topology & refresh-cookie `SameSite`** (S, decision task)
  PRD open question. `SameSite=Lax` cookies are **not sent on cross-site requests at all**, so a
  `*.vercel.app` frontend calling a `*.fly.dev` API means the refresh cookie silently never arrives —
  auth breaks in production while working perfectly on `localhost:5173 → localhost:8000`, which is
  same-site. Decide one of:
  (a) commit to a same-site deployment (`app.example.com` + `api.example.com`) and keep `SameSite=Lax`, or
  (b) switch to `SameSite=None; Secure` with a strict origin allowlist **and** explicit CSRF defenses.
  **R7.2's token-storage split is confirmed and not in scope for this spike** — access token in frontend
  memory via the existing `Authorization: Bearer` scheme, refresh token in the httpOnly cookie. That
  keeps `get_current_user` and `HTTPBearer` untouched across all 13 authenticated endpoints and confines
  the CSRF-defense surface to `/auth/refresh` alone rather than every state-changing endpoint. Do not
  reopen it.
  Deliverable: `docs/decisions/cookie-topology-samesite.md` stating the chosen topology, the exact cookie
  attributes to implement, and whether CSRF work is in or out of scope.
  Depends on: none — **blocks B28, B29, and FRONTEND's F19–F21.** Do it first within this milestone.

- [ ] **B26 — Two-token configuration and minting** (S)
  R7.1. `core/config.py`: drop `ACCESS_TOKEN_EXPIRE_MINUTES` from its current 7 days to **15–30 minutes**,
  add a refresh lifetime (7–30 days) and the cookie name/path/samesite settings. `core/security.py`:
  mint refresh tokens as **opaque high-entropy random values, not JWTs** (they are validated against the
  DB, so a signed self-describing token buys nothing and leaks structure), and hash them for storage —
  the raw value is returned to the caller once and never persisted (security NFR). Add a token-type
  claim to the access token so it can't be replayed at `/auth/refresh`.
  Acceptance: unit test shows an access token expiring inside the configured window; the value written to
  `token_hash` is not equal to the value handed to the caller; the existing dev-secret / weak-secret
  startup validation still passes.
  Depends on: none (does not need B25 — lifetimes and hashing are topology-independent)

- [ ] **B27 — Refresh-token service: issue, validate, revoke** (M)
  New `app/services/refresh_token_service.py` over the D11 table. `issue(user)` creates a row and returns
  the raw token. `validate(raw)` looks the row up **by hash** and requires: exists, `expires_at` in the
  future, `revoked_at is null` — all three checked on every refresh (security NFR). `revoke(raw)` sets
  `revoked_at = clock.utc_now()` and is idempotent. **No rotation, no reuse detection, no token families**
  (R7.5) — leave a comment saying this is deliberate and documented, so it isn't rediscovered as a bug.
  Optionally piggyback expired-row cleanup on the existing APScheduler job rather than adding a new one.
  Acceptance: unit tests cover all four validate outcomes (valid / unknown hash / expired / revoked);
  revoking an already-revoked token is a no-op, not an error; no raw token value appears in the DB.
  Depends on: D11, D12, B26

- [ ] **B28 — `/auth/refresh`, `/auth/logout`, and refresh cookies on the existing auth endpoints** (M)
  R7.4. `POST /auth/refresh` reads the refresh cookie, validates via B27, returns a new access token;
  `401` on **any** failure with a single undifferentiated message (don't leak whether a token was
  unknown, expired or revoked). `POST /auth/logout` revokes the presented token and clears the cookie —
  **always `204`, even with no cookie or an invalid one** (idempotent). `POST /auth/signup`, `/auth/login`
  and `/auth/oauth/google` additionally set the cookie; their JSON response shape is unchanged, still
  returning only the access token. The clear must use the same attributes the cookie was set with, or the
  browser keeps it. Rate-limit `/auth/refresh` alongside the existing login/signup limits.
  Note the existing constraint in `api/routes/auth.py`: **no `from __future__ import annotations` in this
  module** — slowapi's decorator wrapper breaks FastAPI's resolution of stringified annotations and
  silently demotes body params to query params. Keep real annotation objects on the new handlers.
  Acceptance: the stated V2 success metric — after `POST /auth/logout`, replaying the same refresh cookie
  at `/auth/refresh` returns `401`; logout with no cookie still returns `204`; the Set-Cookie carries
  `HttpOnly`, `Secure`, `Path=/auth` and the `SameSite` value B25 chose.
  Depends on: B25, B27

- [ ] **B29 — Credentialed CORS with a strict origin allowlist** (S)
  R7.7. Flip `allow_credentials=False` → `True` in `app/main.py`, reversing the MVP's deliberate choice
  now that there is an ambient cookie credential. The wildcard guard in `config.py`'s
  `_validate_cors_origins` **stays** and becomes load-bearing — wildcard origins are incompatible with
  credentialed CORS. Update the now-wrong comment block in `main.py` that says auth is "never a cookie".
  Add the deployment origins B25 settled on.
  Acceptance: a preflight from an allowlisted origin returns `Access-Control-Allow-Credentials: true`; a
  non-allowlisted origin is refused; startup still fails hard on `CORS_ORIGINS=*`.
  Depends on: B25

## Milestone BV5: Documentation (delivery stage 5)

- [ ] **B30 — Write `backend/API_SPEC_V2.md` as the complete standalone API specification** (L)
  Documentation NFR: the spec is the contract of record, and every R-series change above breaks
  `API_SPEC_V1.md`. **This is a new file, not an in-place edit and not a diff.** `API_SPEC_V2.md` must
  fully document the API *as it exists after V2* — every endpoint, every request and response shape,
  the auth flow, errors, rate limits, operational limits — so that someone reading it alone, with no
  access to `API_SPEC_V1.md`, understands the entire surface. V1 endpoints that V2 did not touch
  (`/health`, `/applications/autofill`, `/settings`, `GET /auth/me`) get their full documentation carried
  over, not a "see V1" pointer. `API_SPEC_V1.md` stays in the repo unmodified as the historical V1
  record; add a one-line header note there pointing at V2 as the current contract.
  Structure: mirror `API_SPEC_V1.md`'s existing 11-section layout (Overview → Authentication → Endpoint
  reference → Background behavior → Data model notes → Schemas → Errors → Rate limiting → Operational
  limits & security → Verification → Changelog) so the two are comparable section-for-section and nothing
  gets dropped in the carry-over. It is ~1,550 lines in V1 and will be longer; if that exceeds one
  sitting, split by section (endpoint reference first, then schemas, then the operational sections) —
  but the deliverable is one complete file, not a partial one.
  V2-specific content that must be right: the 7-value enum with its display labels; the R1.5 transition
  matrix (replacing §6.10); `rejection_fail_rate` in place of `rejection_rate`; the `sankey` payload on
  both dashboard endpoints; the expanded range set with custom-range validation and its `422`s; the
  two-token auth model with `POST /auth/refresh` and `POST /auth/logout`; the refresh cookie now set by
  signup/login/oauth and its exact attributes per B25; credentialed CORS (replacing §9.3); and the
  narrowed ghosting sweep in the background-behavior section. §2.5's "lifecycle gaps" section documented
  the missing logout — rewrite it as the accepted-trade-off note for no refresh-token rotation (R7.5).
  Acceptance: every endpoint and field in this file's shared contract is documented in `API_SPEC_V2.md`;
  every endpoint still served by the app appears there, including the ones V2 didn't change; no mention
  of `interviewing` or `rejection_rate` survives except in the changelog section as an explicitly-marked
  "removed in V2" entry; `API_SPEC_V1.md`'s body is unchanged apart from the header pointer.
  Depends on: B19, B22, B23, B24, B28

## Notes for parallel work

- **B25 is the only blocking spike in this file** and it has no code dependencies — do it early, the way
  V1 front-loaded B8/B11/B15. It gates B28, B29 and three frontend tasks.
- **BV4 is fully parallelizable with BV1–BV3.** Different files, different tests, no shared state. If two
  work sessions are available, run BV4 alongside BV2/BV3.
- Everything in BV1 blocks on DATABASE's **D7** (the enum). D7/D8 plus B18/B19/B20 should land together —
  in between, `backend/tests/` and the seed script won't import.
- FRONTEND does not need these endpoints live to start: F10–F18 build against MSW mocks matching the
  shared contract above. What it needs is for **this contract to stay accurate** — if B24 refines the
  `sankey` shape (R5.5 permits it), update this file and FRONTEND_TASKS.md in the same commit.
- **B30 is the largest single task in the release** and is last for a reason — it depends on five other
  tasks and rewrites ~1,500 lines of spec. Don't let it get squeezed; the PRD calls out that a stale spec
  defeats the purpose of having one.
- Reminder, because it will bite otherwise: **`clock.py` for every date**. B20, B22, B23, B24 and B27 all
  touch date/time logic.
