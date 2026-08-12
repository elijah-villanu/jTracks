# jTracks V2 — Status Model, Sankey Recap & Session Security

> **Scope note.** This document specifies **V2** of jTracks. The V1/MVP requirements live in
> [`PRD.md`](./PRD.md) and remain the historical record of the shipped system. Where V2
> changes V1 behavior, this document wins. Where V2 is silent, V1 still applies.
>
> The current API contract of record is [`backend/API_SPEC_V1.md`](./backend/API_SPEC_V1.md).
> Every contract change described here is a **breaking change to that spec**.

## Summary

V2 sharpens jTracks from "a board that tracks status" into "a board that tells you where your
job search is dying." It splits the single `rejected` outcome into a pre-interview rejection
versus a post-interview **Failed Interview/OA**, narrows auto-ghosting to the `applied` stage
only (an interview that goes quiet is now the user's call, not the scheduler's), and replaces
the recap's flat stat tiles with a **Sankey diagram** of applications flowing from submission
through to terminal outcomes — shown both on the dashboard and in the shareable recap image,
over expanded time ranges including a full year, all-time, and custom date ranges. Alongside
this, V2 closes the highest-priority gap from the security audit by replacing the
non-revocable 7-day localStorage token with a short-lived access token plus a DB-backed,
revocable refresh token in an httpOnly cookie.

---

## Problem statement

Three problems with the shipped MVP:

1. **The pipeline can't distinguish "they never wanted me" from "I didn't clear the bar."**
   Everything that isn't an offer collapses into `rejected` or `ghosted`. A user who gets
   twenty resume-screen rejections and a user who reaches five final rounds and loses all of
   them see the same dashboard, even though those are completely different problems with
   completely different fixes.

2. **The recap doesn't show a funnel.** The current recap is a list of stat tiles and a status
   breakdown. It answers "how many?" but not "where did they go?" — which is the actual
   question a job seeker has, and the thing that makes a recap worth sharing.

3. **Sessions can't be ended.** A 7-day JWT in `localStorage` with no revocation path means
   there is no working logout and no way to invalidate a leaked token. This was consciously
   deferred at MVP and flagged in `SECURITY_AUDIT.md`; V2 closes it.

A fourth, smaller problem: auto-ghosting currently applies to `interviewing` as well as
`applied`. Once you're in an interview loop, a two-week gap is normal — silently flipping
that application to `ghosted` is wrong and destroys the signal.

## Goals

- Make the terminal outcome of an application say **at what stage it died**, so pre-interview
  and post-interview failure are separately visible in every chart.
- Give the recap and dashboard a Sankey flow visualization that reads as a funnel from
  submitted applications through to outcomes.
- Extend analytics ranges to cover meaningful periods (year, all-time, custom), because a
  week's worth of applications is too thin to make a funnel legible.
- Stop the ghosting scheduler from touching applications that have reached an interview.
- Ship a real session lifecycle: short-lived access tokens, revocable refresh tokens, a
  working logout, and no auth material in `localStorage`.

## Non-goals (V2)

- **No status-history / event-log table.** V2 deliberately keeps deriving analytics from
  *current status only*. See [Known limitation: status-only analytics](#known-limitation-status-only-analytics).
- **No CSV import/export.** Designed during V2 planning, then deferred. The design of record
  is preserved in [Deferred: CSV import/export](#deferred-csv-importexport).
- **No enforcement of the pre/post-interview split** as a transition rule. The distinction is
  a reporting convention, not a validation constraint.
- **No "log out all devices" / multi-session management.** Single-session logout only.
- **No refresh-token rotation or reuse detection.**
- **No onboarding/education UX** explaining the status distinction — deferred, see
  [Deferred: status-distinction onboarding](#deferred-status-distinction-onboarding).
- **No back-compatibility** for the old `interviewing` enum value or the old `rejection_rate`
  field. V2 is a hard cutover.
- Everything in V1's non-goals list still stands (no browser extension, no team features, no
  native app, no resume storage).

## Target users

Unchanged from V1: an individual job seeker managing their own private board. V2 adds no new
persona. The status split is aimed specifically at the user who is *getting interviews* — the
MVP served the "am I getting responses at all?" question adequately; V2 serves "where in the
funnel am I losing?"

---

## Requirements

Prioritized as **must-have** unless marked otherwise. Sequencing is given in
[Delivery sequence](#delivery-sequence).

### R1 — Status model changes (must-have)

**R1.1 — Rename `interviewing` → `interviewing_oa`.**
The stored enum value is `interviewing_oa`. The frontend display label is
**"Interviewing / OA"** (OA = online assessment). No API alias for the old value; a request
sending `status=interviewing` is a `422`.

**R1.2 — New status `failed`.**
Stored enum value `failed`. The frontend display label is **"Failed Interview/OA"** — the
verbose label is deliberate, and is the primary mitigation for the mislabeling risk described
in [Known limitation](#known-limitation-status-only-analytics). Do not shorten it to "Failed"
in the UI.

**R1.3 — Final `ApplicationStatus` enum (6 → 7 values):**

| Stored value | Display label | Meaning |
|---|---|---|
| `saved` | Saved | Bookmarked, not yet submitted |
| `applied` | Applied | Submitted; ghosting clock running |
| `interviewing_oa` | Interviewing / OA | In an interview loop or online assessment |
| `offer` | Offer | Offer received |
| `rejected` | Rejected | Rejected — **by convention, before reaching interview/OA** |
| `failed` | Failed Interview/OA | Reached interview/OA and did not pass |
| `ghosted` | Ghosted | No response past the threshold |

**R1.4 — Semantics are conventional, not enforced.**
`rejected` meaning "pre-interview" and `failed` meaning "post-interview" governs how
**analytics and the Sankey group outcomes**. It is *not* a transition constraint. Both statuses
remain reachable from `applied`, `interviewing_oa`, `offer` and `ghosted`. There is no UI
lockout. The product relies on clear labeling, not validation, to keep users honest.

**R1.5 — V2 transition matrix.** Replaces `ALLOWED_TRANSITIONS` in
`backend/app/services/transitions.py`. Self-transitions remain always allowed. Anything not
listed is a `400`.

| From ↓ / To → | `saved` | `applied` | `interviewing_oa` | `offer` | `rejected` | `failed` | `ghosted` |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `saved` | — | yes | no | no | no | no | no |
| `applied` | no | — | yes | yes | yes | yes | yes |
| `interviewing_oa` | no | yes | — | yes | yes | yes | yes |
| `offer` | no | no | yes | — | yes | yes | no |
| `rejected` | no | yes | yes | no | — | yes | no |
| `failed` | no | yes | yes | yes | yes | — | no |
| `ghosted` | no | yes | yes | yes | yes | yes | — |

Unchanged rules carried from V1: nothing returns to `saved`; any move **into** `applied`
requires the row to end up with a non-null `date_applied` (server defaults it to
`clock.utc_today()` when the client omits it, so this never fails in practice).

**R1.6 — Migration.**
There is no production data; the dev database may be reset. An Alembic migration is still
required so the schema is reproducible:
- Postgres: `ALTER TYPE ... RENAME VALUE 'interviewing' TO 'interviewing_oa'` and
  `ALTER TYPE ... ADD VALUE 'failed'`. Note `ADD VALUE` has transaction-block restrictions on
  older Postgres; the migration must account for the target server version.
- SQLite (dev/test) stores the enum as a string with no native type — the migration is
  effectively a no-op there, but any seeded/fixture rows using `interviewing` must be updated.
- **No backfill of existing `rejected` rows.** Rows keep whatever status they have; the new
  semantics apply going forward only.

### R2 — Ghosting scope narrows to `applied` only (must-have)

**R2.1** `GHOSTABLE_STATUSES` becomes `{applied}`. The daily sweep no longer considers
`interviewing_oa`.

**R2.2** `failed` joins `offer` and `rejected` as a status the sweep never touches.
`failed → ghosted` is not an automatic transition (it remains a legal *manual* one per R1.5).

**R2.3** Once an application reaches `interviewing_oa`, only the user can move it to
`ghosted`. All other sweep behavior is unchanged: daily, UTC, idempotent, driven by
`date_applied + effective_days` where `effective_days` is `ghost_days_override` or the user's
`ghost_days_default`.

**R2.4** All date/time logic added or touched in V2 **must** use `app/core/clock.py`
(`utc_now`/`utc_today`/`to_utc_date`), never `date.today()` or `datetime.now()`.

### R3 — Staleness nudge for `interviewing_oa` (must-have)

Because R2 removes the automatic safety net, interviews that go quiet would otherwise sit
untouched forever with no prompt.

**R3.1** An application in `interviewing_oa` with no activity for **28 days** (4 weeks) is
visually flagged on the board.

**R3.2** This is a **display-only** nudge. It changes no status, writes nothing, triggers no
job, and sends no notification.

**R3.3** The 28-day threshold is **hard-coded**. It is not configurable and is not exposed in
settings. It is unrelated to `ghost_days_default` / `ghost_days_override`.

**R3.4** "No activity" is measured from the row's `updated_at`. Computed client-side from data
already returned by `GET /applications`; **no API change is required**.

### R4 — Metric redefinitions (must-have)

Applies to both `GET /dashboard/stats` and `GET /dashboard/recap`. The existing rule that both
endpoints consider **only submitted applications** (non-null `date_applied`) is unchanged, so
`saved` rows remain invisible to all stats.

**R4.1 — `status_breakdown`** returns exactly the **6** non-`saved` statuses, in the fixed
order `applied, interviewing_oa, offer, rejected, failed, ghosted`, including zero-count
entries. (Was 5.)

**R4.2 — `response_rate`** = `(interviewing_oa + offer + rejected + failed) / total * 100`.
Everything that left `applied` other than by ghosting counts as a response.

**R4.3 — `ghost_rate`** = `ghosted / total * 100`. Unchanged.

**R4.4 — `rejection_rate` is renamed to `rejection_fail_rate`** and redefined as
`(rejected + failed) / total * 100`. The display label is **"Rejection/fail rate"**. The old
field name is removed outright (hard cutover).

**R4.5 — "Interviews"** — the derived count used in the recap highlights — becomes
`interviewing_oa + offer + failed`. `offer` and `failed` necessarily passed through the
interview stage, so all three count. (Was `interviewing + offer`.)

**R4.6 — `avg_time_to_response_days`** is unchanged in definition and retains its existing
caveat: with no persisted status history, `updated_at` is a proxy for "first move away from
`applied`" and is disturbed by any later edit to the row. V2 does not fix this.

All rates remain percentages 0–100, rounded to 1 decimal, `0.0` when `total` is 0.
`avg_time_to_response_days` remains nullable.

### R5 — Sankey flow visualization (must-have)

**R5.1 — Placement.** The Sankey appears in **both** the dashboard and the shareable recap
image. It is **additive** to the recap: all existing highlight tiles (Applications, Interviews,
Offers, Response rate, Ghost rate, Avg. reply time) survive alongside it, plus the renamed
Rejection/fail rate.

**R5.2 — Hierarchy.** Three levels. `saved` is excluded entirely; the flow starts at
submission.

```
Level 1                Level 2                        Level 3
                    ┌─ Rejected            (terminal)
Applied ────────────┼─ Ghosted             (terminal)
(Submitted)         └─ Interviewing / OA ──┬─ Offer                (terminal)
                                           └─ Failed Interview/OA  (terminal)
```

**R5.3 — Link derivation.** Computed from **current status counts only**, over the selected
range's submitted applications:

| Link | Value |
|---|---|
| `Applied` node total | all submitted applications in range |
| `Applied → Interviewing / OA` | `interviewing_oa + offer + failed` |
| `Applied → Rejected` | `rejected` |
| `Applied → Ghosted` | `ghosted` |
| `Interviewing / OA → Offer` | `offer` |
| `Interviewing / OA → Failed Interview/OA` | `failed` |

**R5.4 — In-flight applications.** Rows still sitting in `applied` or `interviewing_oa` at the
end of the period **do not flow anywhere**. They are not routed to a "pending" node and are not
given a terminal edge; they simply account for the difference between a node's inflow and its
total outflow. The renderer must handle nodes whose outgoing links sum to less than their
inflow without distorting the diagram.

**R5.5 — API.** Both `GET /dashboard/stats` and `GET /dashboard/recap` return a new `sankey`
object. Proposed shape (backend workstream may refine, but nodes and links must be explicit —
the frontend must not re-derive the topology):

```json
"sankey": {
  "nodes": [
    { "key": "applied",         "label": "Applied",              "value": 120 },
    { "key": "interviewing_oa", "label": "Interviewing / OA",     "value": 34 },
    { "key": "rejected",        "label": "Rejected",              "value": 51 },
    { "key": "ghosted",         "label": "Ghosted",               "value": 28 },
    { "key": "offer",           "label": "Offer",                 "value": 3 },
    { "key": "failed",          "label": "Failed Interview/OA",   "value": 19 }
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

**R5.6 — Zero/degenerate states.** The Sankey must render sensibly when `total` is 0, when
every application is still in `applied` (no links at all), and when a single link carries 100%
of the flow. Define a specific empty state rather than rendering a blank box.

**R5.7 — Visual design is out of this document's scope.** The user will supply mockups and
reference material (Strava-style annual/period recap aesthetic) directly to the frontend
implementation agent. This PRD fixes the *data and topology* only. Colors, typography,
easing/animation, node ordering and label placement are the frontend's brief, not a
requirement here.

**R5.8 — Recap image constraints carry over from V1**: transparent background, portrait aspect
ratio suited to Instagram Stories, client-side render, downloadable and shareable via the
native share sheet.

### R6 — Expanded analytics ranges (must-have)

**R6.1** Both `GET /dashboard/stats` and `GET /dashboard/recap` accept the same range set:
`week | month | year | all | custom`. (Previously `stats` took `week|month|all` and `recap`
took `week|month` only.)

**R6.2 — Custom ranges** take explicit `start` and `end` ISO dates when `range=custom`.
Validation: both required when `range=custom`, `start <= end`, and the **inclusive** day count
`(end - start).days + 1` must be between **1 and 366**. Out-of-bounds is a `422`. The 366 cap
accommodates a full leap year.

**R6.3 — `period_label`:**

| Range | `period_label` |
|---|---|
| `week` | `"This week"` |
| `month` | `"This month"` |
| `year` | `"This year"` |
| `all` | `"All time"` |
| `custom` | The actual range, e.g. `"Jan 1 – Mar 15, 2026"` |

**R6.4 — Time-series bucketing** for `applications_over_time` (proposal; backend may adjust,
but `time_series_granularity` must always state which was used):

| Range | Window | Buckets |
|---|---|---|
| `week` | last 7 days inclusive | daily, zero-filled → exactly 7 points |
| `month` | last 30 days inclusive | daily, zero-filled → exactly 30 points |
| `year` | last 365 days inclusive | monthly, zero-filled → exactly 12 points |
| `all` | unbounded | monthly, only months with data (unchanged) |
| `custom` | `start`…`end` inclusive | daily zero-filled if span ≤ 92 days, else monthly zero-filled |

**R6.5** All window boundaries are computed in **UTC** via `app/core/clock.py`.

### R7 — Session lifecycle: refresh tokens and revocation (must-have)

Closes the `SECURITY_AUDIT.md` item deferred at MVP.

**R7.1 — Two-token model.** A short-lived access token plus a long-lived refresh token.
Recommended lifetimes: access **15–30 minutes**, refresh **7–30 days** (backend picks exact
values and puts them in config). The current 7-day access token is retired.

**R7.2 — Token storage and transport — decision made on the user's behalf, flagged for
override:**

| Token | Storage | Transport |
|---|---|---|
| **Refresh** | httpOnly cookie | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/auth` |
| **Access** | **In frontend memory only** — never `localStorage`, never a cookie | `Authorization: Bearer` header (existing scheme, unchanged) |

The user's instruction was "move off `localStorage` entirely" and left the access token's
destination to this document. **Rationale for keeping the access token in memory rather than
also moving it to a cookie:** it fully satisfies "off `localStorage`" (an in-memory variable is
not persisted and is not readable by a different tab or by injected script after reload); it
leaves `get_current_user` and the `HTTPBearer` dependency untouched across all 13 authenticated
endpoints; and it avoids introducing a CSRF surface on every state-changing endpoint, which
cookie-borne access tokens would require mitigating. Cost: the access token is lost on page
reload and must be re-obtained via a silent refresh call on app boot (R7.6). If the user
prefers cookie-borne access tokens, that is a viable alternative but adds CSRF defenses
(double-submit token or required custom header) as a hard requirement.

**`SameSite=Lax` chosen over `Strict`:** Google sign-in uses Google Identity Services in-browser
and posts an ID token to our own API rather than doing a cross-site top-level redirect back to
us, so `Strict` would technically work today — but `Lax` is the safer default if the OAuth flow
ever changes to a redirect, and it still blocks cross-site `POST`, which is what matters for
the refresh endpoint. See [Risks](#open-questions--risks) for the deployment-topology
constraint this creates.

**R7.3 — Server-side refresh-token store.** A new `refresh_tokens` table. Cookie flags and
server-side storage are independent concerns: the flags protect the token in transit and from
script access, while the table is what makes revocation *possible at all*. Without it, logout
would be cosmetic and a stolen refresh token would stay valid until natural expiry.

| Column | Notes |
|---|---|
| `id` | UUID PK |
| `user_id` | FK → `users.id`, `ON DELETE CASCADE` (matches the existing `applications` pattern) |
| `token_hash` | Hash of the token, never the raw value |
| `expires_at` | Absolute expiry |
| `revoked_at` | Nullable; non-null means revoked |
| `created_at` | |

**R7.4 — Endpoints.**

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/auth/refresh` | Reads the refresh cookie, validates against the store (exists, not expired, not revoked), returns a new access token. `401` on any failure. |
| `POST` | `/auth/logout` | Revokes the presented refresh token (sets `revoked_at`) and clears the cookie. Idempotent — always `204`, even with no/invalid cookie. |

`POST /auth/signup`, `/auth/login` and `/auth/oauth/google` are all modified to additionally set
the refresh cookie. Their JSON bodies still return the access token.

**R7.5 — No rotation.** The refresh token is static until expiry. Reuse detection and
token-family revocation are explicitly out of scope. Documented as an accepted trade-off.

**R7.6 — Frontend session handling.**
- On app boot, attempt `POST /auth/refresh` to recover a session before deciding the user is
  logged out.
- On any `401` from an authenticated call, attempt exactly **one** silent refresh and retry the
  original request; if that also fails, clear state and route to login.
- Concurrent `401`s must not trigger a refresh stampede — in-flight refreshes must be shared.
- Logout calls `POST /auth/logout` and clears in-memory state.

**R7.7 — Credentialed CORS.** Cookie auth requires `allow_credentials=True`, reversing the MVP's
deliberate choice. This is confirmed in-scope. It **requires a strict, explicit origin
allowlist** — wildcard origins are incompatible with credentialed CORS and must not be used.

**R7.8 — Single-session logout only.** No "log out all devices," no session listing, no
introspection endpoint.

### R8 — Cleanup (nice-to-have)

**R8.1** Delete the dead `frontend/src/routes/PlaceholderPage.tsx` and any references to it.

**R8.2** Confirm or fix recap-modal and dashboard responsiveness at small viewports
(~375px). This was suspected but never verified at MVP; the Sankey work touches these surfaces
anyway, so verify as part of R5. If the Sankey cannot render legibly at 375px, define a
documented fallback rather than shipping an unreadable chart.

---

## Known limitation: status-only analytics

**V2 deliberately does not persist status history.** The `applications` table stores only the
*current* status. This was an explicit decision (option C of three considered), on the
reasoning that the flow is entirely user-driven and a user who follows the intended convention
will not produce a misclassified row.

The consequences, accepted knowingly:

1. **A post-interview outcome recorded as `rejected` is counted as a pre-interview death.**
   Nothing in the data records that the application ever reached `interviewing_oa`. Mitigation
   is the explicit **"Failed Interview/OA"** display label (R1.2), not validation.

2. **An `interviewing_oa` application manually moved to `ghosted` is drawn under
   `Applied → Ghosted`,** i.e. as a pre-interview ghost. There is no level-3 `Ghosted` node
   because, with status-only data, it is not computable which ghosts passed through interview.
   This is a real and expected miscount given R2 now *requires* users to ghost interviews
   manually. Accepted as-is.

3. **`avg_time_to_response_days` remains a proxy** based on `updated_at` (R4.6).

The fix for all three is a status-event log (`application_status_events` with
`from_status`/`to_status`/`changed_at`/`source`). It was scoped and declined for V2. If any
future version wants true flow counts, per-stage dwell times, or an accurate time-to-response,
that table is the prerequisite — and it should be introduced *before* more analytics are built
on top of the current-status model.

---

## Non-functional requirements

- **Performance.** Dashboard and recap queries stay under ~1 second for a typical user (low
  hundreds of applications). The `all` and `year` ranges now scan more rows than any V1 query
  did; the Sankey must be derived from the same aggregate pass as `status_breakdown`, not a
  second set of queries.
- **Security.** Refresh tokens are stored hashed, never in plaintext. Revocation must be
  checked on every refresh. Credentialed CORS requires an explicit origin allowlist (R7.7). All
  existing protections stay: per-user isolation on every query, `404`-not-`403` for other users'
  rows, rate limiting, SSRF guards on autofill.
- **Correctness of time handling.** Everything date-related uses `app/core/clock.py`. This is a
  hard requirement, not a style preference — the off-by-one bug it fixed is exactly the class of
  bug that expanded ranges and the Sankey would reintroduce.
- **Responsiveness.** Dashboard including the Sankey usable down to ~375px viewports.
- **Reliability.** The narrowed ghosting sweep must remain idempotent and must not touch
  `interviewing_oa`, `failed`, `offer` or `rejected` rows under any circumstances.
- **Documentation.** `backend/API_SPEC_V1.md` must be updated (or superseded by a V2 spec) to
  reflect the new enum, the renamed metric, the `sankey` payload, the expanded ranges and the
  two new auth endpoints. The spec is the contract of record and going stale defeats its purpose.

## Success metrics

- The user's own board shows a non-trivial Sankey — i.e. real applications distributed across
  at least `applied`, `interviewing_oa` and two terminal statuses — and the funnel matches what
  the user knows to be true about their search.
- The user can answer "am I losing people before or after the interview?" from the dashboard in
  one glance, without doing arithmetic.
- Logout demonstrably works: after `POST /auth/logout`, the revoked refresh token returns `401`
  from `/auth/refresh`, verified by test.
- A session survives a page reload via silent refresh, and an expired access token is
  transparently renewed without the user seeing a login screen.
- No auth material is present in `localStorage` — verifiable by inspection.
- The ghosting sweep, under test, produces zero transitions on `interviewing_oa` rows.
- The full V2 flow is demoable end-to-end as a portfolio piece: add applications, advance one
  to Interviewing/OA, mark one Failed Interview/OA, watch `applied` rows auto-ghost while the
  interview row does not, then generate a Sankey recap.

## Constraints & assumptions

- **Stack unchanged.** React 19 + TS + Vite + Tailwind v4 + shadcn/Base UI + react-router v7;
  FastAPI + SQLAlchemy 2.0 + Alembic + Postgres/SQLite + PyJWT + APScheduler + slowapi.
- **No live data.** Local dev only; the database may be reset. No backfill obligation.
- **Hard cutover.** The API is unversioned and has one user. No `/v2` namespace, no enum alias,
  no deprecation window. Frontend and backend ship together.
- **Single developer**, no deadline. Favor common, well-documented patterns.
- **Workstream convention** (soft): DATABASE owns `models/` + `db/` + `alembic/`; BACKEND owns
  `api/` + `schemas/` + `services/` + `core/` + `scheduler/`; FRONTEND owns `frontend/`. R1 and
  R7.3 cross the DATABASE boundary; R5/R6 are BACKEND + FRONTEND; R3 and R8 are FRONTEND-only.
- **Confirmed:** `saved` remains reachable only via creation and can only move to `applied` — a
  saved job the user decides against is deleted, not marked `rejected`. This is enforced by the
  R1.5 transition matrix at the API level; the frontend adds no additional lockout beyond that.
  Deleted applications — whether an abandoned `saved` row or an outright delete of any other
  row, at any status — are hard-removed and must never appear in any analytics, dashboard, or
  Sankey figure, regardless of what status they held before deletion. No soft-delete/tombstone
  is introduced in V2.
- **Assumed:** the Sankey uses the same "submitted applications only" filter as every other
  dashboard metric, so `saved` rows never appear.

## Open questions / risks

- **Deployment topology now constrains the cookie design.** Hosting is still undecided (V1 open
  question, still open). `SameSite=Lax` cookies are **not sent on cross-site requests at all** —
  so if the frontend and API end up on different registrable domains (e.g. a `*.vercel.app`
  frontend calling a `*.fly.dev` API), the refresh cookie will silently never arrive and auth
  will break in production while working fine locally (`localhost:5173` → `localhost:8000` is
  same-site). **Either commit to a same-site deployment** (`app.example.com` +
  `api.example.com`) **or switch to `SameSite=None; Secure`** with a strict origin allowlist and
  explicit CSRF defenses. This decision should be made before R7 is implemented, not after.
- **Sankey legibility at 375px** is unproven. A three-level Sankey in a portrait Stories-format
  image is plausible; the same chart inside a mobile dashboard viewport is the risk. Needs a
  spike or an early visual check.
- **Sankey library choice is open.** The existing charts use Recharts, which has no first-class
  Sankey. Options: Recharts' limited Sankey support, a d3-sankey layout rendered into custom
  SVG, or another library. Whatever is chosen must render inside `html-to-image` for the recap
  export — some chart libraries (canvas-based, or ones relying on external stylesheets or web
  fonts) do not serialize cleanly. **Verify export compatibility before committing.**
- **`year` vs `all` may be indistinguishable in practice** for a user whose search is under a
  year old. Not a blocker, but the two ranges may look identical for a while.
- **No rotation means a stolen refresh token is usable until expiry or manual logout** (R7.5).
  Accepted; documented so it isn't rediscovered as a surprise.
- **Signup enumeration via `409`** remains a conscious V1 trade-off, unchanged in V2.

---

## Out of scope (V2)

### Deferred: CSV import/export

CSV import/export was fully scoped during V2 planning and then **deliberately cut from V2**.
It is not a V2 deliverable. The decisions below are recorded as the **design of record** so
that whenever this is built, it starts from these answers rather than re-litigating them.

**Architecture.** A dedicated backend endpoint — server-side parsing, validation and insert in
a single transaction — rather than the frontend parsing the file and looping `POST
/applications`. Chosen for atomicity, a single rate-limit surface, and validation consistent
with the rest of the API.

**Import modes.** Two: **additive** (merge into the existing board) and **replace entire
board** (destructive full replacement).

**Duplicate handling.** **Update-in-place.** A row matching an existing application updates
that application rather than skipping, creating a duplicate, or prompting per-conflict. The
match key was not finalized — likely `company` + `title` + `job_url`; **this needs deciding
before implementation.**

**Malformed rows.** **Partial success**, not all-or-nothing. Valid rows import; invalid rows
are reported per-row with line numbers. Requires a results UI along the lines of
"42 imported, 3 updated, 2 errors on lines 7 and 19."

> Note the tension to resolve at implementation time: partial success and "one transaction"
> pull in opposite directions. The intended reading is that the *successful subset* commits
> atomically — validate everything first, then insert the valid rows in one transaction —
> not that each row commits independently.

**Export.** The exported CSV shape must **exactly match** the supported import shape, so that
export → import round-trips cleanly. This constrains both schemas to a single shared column
set; the exact columns (and whether `id` is included, which determines whether round-tripping
updates or duplicates) were not finalized.

**Still undecided if resumed:** the exact column list and header names; whether `id` is
exported; the duplicate match key; file size and row count limits; whether import runs
transition validation or (like `POST /applications` today) accepts any status directly.

### Deferred: status-distinction onboarding

A future UX — possibly a new-user onboarding step or an inline explainer — teaching the
difference between `Rejected` (pre-interview) and `Failed Interview/OA` (post-interview), to
reduce the mislabeling that the status-only analytics model is vulnerable to. Explicitly **not
a V2 deliverable**; recorded here because it is the natural product-side mitigation for the
[known limitation](#known-limitation-status-only-analytics), and pairs with the eventual
status-event-log work.

### Also out of scope for V2

- Status-history / event-log table (see [Known limitation](#known-limitation-status-only-analytics))
- Refresh-token rotation, reuse detection, "log out all devices", session management UI
- Any back-compat shim for the `interviewing` enum value or the `rejection_rate` field
- Hard validation enforcing the pre/post-interview stage split
- Configurable staleness threshold (R3.3 is hard-coded at 28 days)
- Notifications, reminders, or scheduled recap generation of any kind
- Everything already out of scope in V1: browser extension, job-board scraping beyond
  Greenhouse/Workday, resume/cover-letter management, team boards, native mobile app

---

## Delivery sequence

Confirmed ordering. Each stage is independently shippable and leaves the app in a working
state.

1. **R1 + R2 — status model and ghosting scope.** The foundation; everything downstream depends
   on the final status vocabulary. Includes the Alembic migration, `transitions.py` rewrite,
   scheduler change, and frontend labels/filters.
2. **R4 + R6 — metric redefinitions and expanded ranges.** Backend-first; gets the numbers and
   windows right before anything draws them.
3. **R5 — Sankey.** Dashboard and recap, backend payload then frontend render. Visual design
   brief arrives separately (R5.7).
4. **R7 — refresh tokens and revocation.** Independent of 1–3; can be parallelized if desired,
   but resolve the deployment-topology question first (see Risks).
5. **R3 + R8 — staleness nudge and cleanup.** Small; fold into whichever stage is convenient.
