# jTracks V2 — Frontend Tasks

**Source of truth:** [`PRD_V2.md`](./PRD_V2.md). V1's shipped requirements are in [`PRD.md`](./PRD.md);
where V2 changes V1 behavior, V2 wins.

**Owns:** everything under `frontend/`
**Do not edit:** anything under `backend/`

**Task IDs continue from V1** (F1–F9 are the shipped MVP tasks, archived at
[`v1/FRONTEND_TASKS.md`](./v1/FRONTEND_TASKS.md)). V2 starts at **F10**, so a reference to "F8" always
means the same thing in both documents.

---

## Shared contract (do not diverge without updating DATABASE_TASKS.md and BACKEND_TASKS.md)

Same entity fields as DATABASE_TASKS.md and the same API surface as BACKEND_TASKS.md, including the
`sankey` payload shape and the V2 metric contract. Keep `frontend/src/types/api.ts` in exact sync with
those two documents — it already carries per-field comments citing `backend/API_SPEC_V1.md`, and those
citations move to the V2 spec when BACKEND's B30 lands.

**`sankey.nodes` always has all 6 non-`saved` entries (including zero-value ones), but `sankey.links` omits
any link with `value: 0`** — expect 0–5 entries, not always 5, and expect nodes no link references at all
(e.g. `offer` at value 0 with nothing pointing to it). Whatever renders this (F16) must handle orphan nodes
and a variable-length `links` array without erroring or mis-laying-out the diagram.

**Status vocabulary (7 values) and their display labels — FRONTEND owns the labels:**

| Stored value | Display label |
|---|---|
| `saved` | Saved |
| `applied` | Applied |
| `interviewing_oa` | **Interviewing / OA** |
| `offer` | Offer |
| `rejected` | Rejected |
| `failed` | **Failed Interview/OA** |
| `ghosted` | Ghosted |

**"Failed Interview/OA" must not be shortened to "Failed" anywhere in the UI** (PRD R1.2). The verbose
label is deliberate — it is the *primary and only* mitigation for the mislabeling risk in the PRD's
"Known limitation: status-only analytics". There is no validation backstop; the label is the product.

**Metric contract:** `status_breakdown` is 6 entries (all non-`saved` statuses, fixed order, zero counts
included); `rejection_rate` is gone, replaced by `rejection_fail_rate` displayed as **"Rejection/fail
rate"**; `response_rate` and `ghost_rate` keep their names; `avg_time_to_response_days` is still nullable.

**Build against MSW mocks first**, as V1 did — F10–F18 and F22–F23 do not need a running backend, only an
accurate contract. Swap to the real API once the corresponding backend tasks ship.

**No auth material in `localStorage`, ever again** (PRD R7.2). The access token lives in a module-level
variable; the refresh token lives in an httpOnly cookie the JS never sees. "No auth material is present
in `localStorage`, verifiable by inspection" is a stated V2 success metric.

---

## Milestone FV1: Status vocabulary (delivery stage 1 — R1)

- [x] **F10 — Move the frontend to the V2 seven-status vocabulary** (S)
  `src/types/api.ts`: `ApplicationStatus` becomes the 7 values above (`interviewing` → `interviewing_oa`,
  plus `failed`). `src/components/StatusBadge.tsx` is the single source of truth for order, label and
  color — extend `ALL_STATUSES` to the R1.3 order (`saved, applied, interviewing_oa, offer, rejected,
  failed, ghosted`) and all four maps (`STATUS_LABEL`, `STATUS_COLOR_CLASSES`, `STATUS_FOCUS_CLASSES`,
  `STATUS_CELL_CLASSES`). Give `failed` a color distinguishable from `rejected`'s red at a glance — they
  are the two the user must never confuse.
  Consumers inherit for free and just need verifying: `table/status-select.tsx`,
  `table/applications-toolbar.tsx`, `applications/application-form-dialog.tsx`, and
  `routes/ApplicationsPage.tsx`'s `ALL_STATUSES.indexOf` sort.
  Acceptance: `tsc -b` clean; the toolbar filter, the row status select and the add/edit form all list 7
  options in R1.3's order with the exact labels above; no bare "Interviewing" or bare "Failed" string
  survives anywhere in `src/`.
  Depends on: none (types are frontend-local) — but **must ship alongside BACKEND's B19**, since from
  that point the API `422`s on `interviewing`.

- [x] **F11 — Update MSW fixtures and handlers to the V2 contract** (S)
  `mocks/fixtures/applications.ts`, `mocks/handlers/applications.ts`, `handlers/dashboard.ts`,
  `handlers/recap.ts`. Replace `interviewing` rows with `interviewing_oa`, add `failed` rows, and back-date
  some `date_applied` values past a year so `year` / `all` / `custom` return visibly different data.
  Give one `interviewing_oa` fixture an `updated_at` older than 28 days (for F22) and one that is only
  ~27 days old (the negative case). Update the dashboard and recap handlers to return the **V2 payload
  shape** — 6-entry breakdown, `rejection_fail_rate`, and a `sankey` object matching BACKEND's contract —
  so F12–F18 can be built before the backend ships. The mock's `applications.ts` handler should also
  reflect the R1.5 transition matrix if it currently validates transitions.
  Acceptance: with MSW on and no backend running, the board, analytics page and recap dialog all render
  V2 data end to end; the dashboard mock's `sankey` links satisfy `applied→interviewing_oa ===
  interviewing_oa + offer + failed`.
  Depends on: F10, and BACKEND's B21/B24 **contract** (shape only, not the running endpoint)

## Milestone FV2: Metric display & expanded ranges (delivery stage 2 — R4, R6)

- [x] **F12 — Update dashboard types and stat tiles for the redefined metrics** (S)
  `src/types/api.ts`: rename `rejection_rate` → `rejection_fail_rate` on `DashboardStats`, widen
  `DashboardRange` to `week|month|year|all|custom`, collapse `RecapRange` into that same union (recap now
  takes the full set), note in `StatusBreakdownEntry` that all 6 non-`saved` statuses always appear
  including zeros, and add the `sankey` node/link types. `routes/AnalyticsPage.tsx` and
  `components/dashboard/recap-card.tsx` gain a **"Rejection/fail rate"** tile — every existing tile
  (Applications, Interviews, Offers, Response rate, Ghost rate, Avg. reply time) stays, the Sankey and
  this tile are additive (R5.1). `components/dashboard/status-breakdown-chart.tsx` must render 6
  categories including zero-count ones without silently dropping bars.
  Acceptance: dashboard and recap render every tile against F11's mocks; a status with count 0 still
  occupies a slot in the breakdown chart; no `rejection_rate` reference remains in `src/`.
  Depends on: F10, F11

- [x] **F13 — Expanded range control with a custom date range** (M)
  R6. Replace `AnalyticsPage`'s three-button toggle and `recap-dialog.tsx`'s two-button toggle with a
  shared control offering `week | month | year | all | custom`; selecting `custom` reveals start/end date
  inputs passed through as query params by `useDashboardStats` / `useRecap`. Validate client-side before
  fetching — `start <= end` and an inclusive span of 1–366 days — with a readable message rather than
  round-tripping a `422`, but still surface the server's `422` if one comes back. **Compute the span in
  UTC**, matching the server's boundaries (R6.5); do not do local-timezone `new Date()` arithmetic on the
  ISO date strings, which is the browser-side version of the bug `backend/app/core/clock.py` exists to
  prevent. Display the server's `period_label` verbatim (R6.3) rather than reconstructing it.
  If a date-picker is needed, add it through the shadcn CLI rather than hand-rolling one.
  Acceptance: all five ranges fetch and render on both the analytics page and the recap dialog; a 400-day
  custom span is refused in the UI; the recap header shows e.g. `"Jan 1 – Mar 15, 2026"` for a custom
  range, straight from the payload.
  Depends on: F12, and BACKEND's B22/B23 contract

## Milestone FV3: Sankey (delivery stage 3 — R5)

> Visual design — colors, typography, easing/animation, node ordering, label placement — is **out of the
> PRD's scope by design (R5.7)**. The user supplies mockups and Strava-style reference material directly.
> This file fixes only the data, topology and behavior.

- [x] **F14 — Spike: choose a Sankey library and verify `html-to-image` export** (M, decision task)
  PRD open risk. Recharts is already a dependency but has **no first-class Sankey**. Evaluate: Recharts'
  limited Sankey support, a `d3-sankey` layout rendered into custom SVG, or another library. The hard
  gate is export: whatever is chosen **must serialize inside `html-to-image`** (already a dependency,
  already used by `components/dashboard/recap-dialog.tsx`) for the transparent recap PNG. Canvas-based
  renderers, and anything depending on external stylesheets or web fonts, frequently do not.
  **Verify by actually exporting a prototype chart to PNG and opening it** — not by reading docs.
  Deliverable: `docs/decisions/sankey-library.md` recording the choice, the export test result (with the
  PNG), and the bundle-size cost of any new dependency.
  Depends on: none — **blocks F15, F16, F18.** Do it first within this milestone.

- [x] **F15 — Spike: Sankey legibility at ~375px** (S, decision task)
  PRD open risk (R5.6, R8.2). Using F14's prototype and F11's fixtures, check whether a three-level
  Sankey carrying the R1.3 labels — including the deliberately long **"Failed Interview/OA"** — is
  actually readable in a 375px dashboard viewport, and separately inside the portrait Stories-format
  recap image. The recap is plausible; the mobile dashboard is the real risk.
  If it is not legible, **define and document a fallback rather than shipping an unreadable chart**:
  e.g. abbreviated/rotated labels with full text in a legend, a vertical layout under a breakpoint, or
  the dashboard falling back to the existing breakdown chart on narrow viewports while the recap keeps
  the Sankey.
  Deliverable: verdict appended to `docs/decisions/sankey-library.md`, with a screenshot at 375px and the
  chosen fallback if any.
  Depends on: F14 — **blocks F16.**

- [x] **F16 — Sankey component** (M)
  Render the backend `sankey` payload using F14's library and F15's small-viewport verdict. **Topology
  comes from the payload's explicit `nodes` and `links` — never re-derive it from `status_breakdown`**
  (R5.5). Handle R5.4 correctly: rows still in flight (`applied` / `interviewing_oa`) produce no outgoing
  edge, so a node's outgoing links legitimately sum to *less* than its value — that gap must not be drawn
  as a phantom link, and must not be normalized away by scaling links to fill the node. Node labels come
  from F10's `STATUS_LABEL` so the chart, badges and filters can't drift apart.
  Acceptance: renders R5.3's topology correctly against F11's mocks; a fixture where `applied`'s outflow
  is well below its value draws without distortion; changing a fixture count changes only the
  corresponding ribbon.
  Depends on: F14, F15, F11, and BACKEND's **B24**

- [x] **F17 — Sankey zero and degenerate states** (S)
  R5.6 — three specific cases, all of which will occur on a real new board: `total === 0`; every
  submitted row still sitting in `applied` (nodes exist, **no links at all**); and one link carrying 100%
  of the flow. Define a real empty state — matching the existing `status-breakdown-chart.tsx` pattern
  ("No applications in this range have moved past Saved yet.") — **not a blank box**. Make sure the
  100%-single-link case doesn't render a degenerate zero-height ribbon or a divide-by-zero.
  Acceptance: all three states render cleanly on the dashboard *and* inside the exported recap image.
  Depends on: F16

- [x] **F18 — Place the Sankey on the dashboard and in the recap image** (M)
  R5.1 — it appears on **both** surfaces and is **additive**: every existing highlight tile survives
  alongside it. Recap constraints carry over unchanged from V1 (R5.8): transparent background, portrait
  aspect suited to Instagram Stories, client-side render, downloadable, shareable via the native share
  sheet — `recap-dialog.tsx` already does all of this, so this is an integration, not a rewrite.
  Confirm the export still yields a **transparent** PNG with the Sankey actually in it — this is the
  failure mode F14's gate exists to catch, and it only truly proves out here.
  Acceptance: "Generate recap" produces a Stories-aspect transparent PNG containing the Sankey; the
  dashboard shows the Sankey without pushing the existing charts off-screen at desktop width; Web Share
  still works on mobile.
  Depends on: F16, F17

## Milestone FV4: Session lifecycle (delivery stage 4 — R7.6)

> Independent of FV1–FV3 and parallelizable, **but all three tasks assume BACKEND's B25 spike has
> resolved.** If B25 overrides R7.2 to cookie-borne access tokens, F19–F21 change shape substantially
> (CSRF header/double-submit handling replaces the in-memory token store) — do not start them first.

- [x] **F19 — Move the access token into memory** (M)
  R7.2. Delete the `jtracks_token` localStorage key and **both** of its touch points: `getStoredToken` /
  `storeToken` / `clearStoredToken` in `src/lib/auth-context.tsx`, and the inline
  `window.localStorage.getItem("jtracks_token")` in `src/lib/api-client.ts`'s `apiFetch`. The access token
  becomes a module-level variable in `api-client.ts` (or a small token-store module) that `auth-context`
  sets and clears. The `Authorization: Bearer` scheme itself is unchanged — that is the whole point of
  R7.2's rationale. Every request must additionally send `credentials: "include"` so the httpOnly refresh
  cookie is attached.
  Acceptance: after login, DevTools → Application → Local Storage contains **no** auth material (stated V2
  success metric); requests still carry the bearer header; a page reload logs the user out until F21 lands
  — that intermediate regression is expected, don't work around it here.
  Depends on: BACKEND's B25 (decision) and B29 (credentialed CORS) for the real cookie; buildable against
  MSW first.

- [x] **F20 — Single-flight refresh-on-`401` in the API client** (M)
  R7.6. On any `401` from an authenticated call: attempt **exactly one** `POST /auth/refresh`, retry the
  original request once on success, and on failure clear auth state and route to login. Concurrent `401`s
  **must share a single in-flight refresh promise** — the dashboard fires several parallel requests, and
  a stampede of refresh calls is the obvious failure here. Never retry a `401` that came from
  `/auth/refresh` itself, and never retry twice.
  Acceptance: with the mock returning `401` for an expired token, three concurrent dashboard calls trigger
  exactly **one** `/auth/refresh` (assert by request count) and all three resolve after it succeeds; a
  failed refresh clears state and lands on `/login` exactly once, not once per in-flight request.
  Depends on: F19

- [x] **F21 — Boot-time silent refresh and a real logout** (S)
  R7.6. `AuthProvider`'s `hydrate()` currently short-circuits when no stored token exists — after F19 that
  is *always*, so on boot it must instead attempt `POST /auth/refresh` first and only treat the user as
  logged out if that fails; `ProtectedRoute` redirects only after that resolves. `logout()` becomes async:
  `POST /auth/logout`, then clear in-memory state — and clear it even if the call throws, so a network
  failure can't strand a user in a half-logged-in UI.
  Acceptance: log in, hard-reload, stay logged in with no login screen flash (stated V2 success metric);
  log out then reload and land on login; logout with an already-cleared session still resolves.
  Depends on: F19, F20, and BACKEND's **B28**

  **Verified 2026-08-21 (live browser, not just code review):** `hydrate()`'s `refreshAccessToken()` →
  `GET /auth/me` sequence, the single-flight refresh path, and "logout with no session resolves cleanly"
  all confirmed working via real requests. **One finding, not a code defect:** in this dev setup
  `VITE_API_URL=http://localhost:8000` is a different origin from the Vite dev server
  (`http://localhost:5173`) the SPA and MSW's service worker run on. MSW's mocked `Set-Cookie` on
  `POST /auth/login` gets attributed to the `5173` origin (confirmed present via `document.cookie` there),
  not `8000` — so a genuine hard-reload's `POST /auth/refresh` to `8000` never sees the cookie and
  correctly-per-the-mock returns `401`, landing back on `/login`. This is a byproduct of testing an
  httpOnly-cookie flow through MSW's browser-mode service-worker interception across two dev-server
  origins — it would not occur against a real backend (which genuinely owns its response's `Set-Cookie`
  for its own origin) or if `VITE_API_URL` were same-origin in dev. Not fixed here since it's a dev/mock
  infrastructure question (touches `.env`, not app code) rather than part of F21's scope — flagged for a
  decision, not silently worked around.

## Milestone FV5: Staleness nudge & cleanup (delivery stage 5 — R3, R8)

> Small; the PRD says fold these into whichever stage is convenient. F22 pairs naturally with FV1 (it
> needs the new status), F24 with FV3 (the Sankey touches those surfaces anyway).

- [x] **F22 — 28-day staleness nudge on `interviewing_oa` rows** (S)
  R3. Because R2 removed the automatic safety net, an interview that goes quiet would otherwise sit
  untouched forever with no prompt. Visually flag any `interviewing_oa` row whose `updated_at` is more
  than **28 days** old. Strictly **display-only** (R3.2): changes no status, writes nothing, calls no API,
  triggers no job. The threshold is **hard-coded and must not be exposed in settings** (R3.3) — it is
  unrelated to `ghost_days_default` / `ghost_days_override`. Computed client-side from the `updated_at`
  already returned by `GET /applications` (R3.4) — **no API change is needed, don't ask for one**. Compare
  in UTC to match the server's calendar. Add a tooltip/`aria-label` explaining why it's flagged, since the
  user now has to ghost these manually.
  Acceptance: a fixture in `interviewing_oa` with a 30-day-old `updated_at` shows the flag; the 27-day-old
  one does not; a 60-day-old `applied` row does not (that is the ghosting sweep's job, not this).
  Depends on: F10, F11

- [x] **F23 — Delete `PlaceholderPage.tsx`** (S)
  R8.1. `frontend/src/routes/PlaceholderPage.tsx` is dead — verified, nothing imports it. Delete the file
  and confirm no reference survives.
  Acceptance: file gone; `npm run build` (`tsc -b && vite build`) and `npm run lint` (oxlint) clean; all
  routes still resolve.
  Depends on: none

- [x] **F24 — Responsive pass at ~375px on dashboard and recap** (S)
  R8.2 — suspected but never verified at MVP, and V2's work touches exactly these surfaces. Verify and fix
  the analytics page, the new range control **including the custom date inputs** (the most likely thing to
  overflow), the recap dialog and the recap card at a 375px viewport. The Sankey's own legibility is
  F15's call and its fallback is implemented in F16 — this task covers everything *around* it.
  Acceptance: no horizontal scroll and no clipped or unreachable controls at 375px across board, analytics
  and recap; the range control wraps rather than overflowing; the recap dialog's download/share buttons
  remain reachable.

  **Verified 2026-08-21** in a real 372px-wide same-origin iframe (genuine layout viewport, not a devtools
  emulation) logged into the live app: analytics page (default range and Custom-with-both-date-pickers-open),
  the "Pipeline flow" Sankey card, the recap dialog across Week/All ranges (including the real multi-node
  Sankey and F17's degenerate-state message), and the board/table were all checked via
  `document.documentElement.scrollWidth` vs `innerWidth` (no page-level overflow in any state) plus visual
  screenshots. Range control wraps cleanly to `Week Month Year All Custom` on one row with `Start`/`End`
  pickers below; recap dialog's `Share`/`Download` buttons fully reachable; the table's own internal
  horizontal scrollbar (pre-existing, intentional per F9) is the only scroll surface anywhere. No fixes
  were needed — F13/F15/F18/F22's sizing work already holds up at this width.
  Depends on: F13, F18

## Notes for parallel work

- **F14 and F15 are the blocking spikes in this file**, and F15 depends on F14's prototype. Neither needs
  the backend. Do them early — the same way V1 sequenced F8 behind the B15 decision — because F16, F17 and
  F18 all sit behind them, and a bad library choice is only discovered at export time.
- **F10–F13 need nothing from BACKEND being live**, only the contract in BACKEND_TASKS.md. Build against
  MSW as V1 did and swap the base URL when the endpoints ship.
- **FV4 is fully parallelizable with FV1–FV3** (different files entirely), but is gated on BACKEND's B25
  decision, whose outcome can change its shape. Don't start it before B25 lands.
- **F23 can be done at literally any time** — it is a standalone delete with no dependencies. Good filler
  when blocked on a spike.
- The riskiest sequencing in this file: **F18 (recap export) can only truly validate F14's export gate**.
  If the export turns out broken there, it invalidates F14's decision late. Mitigate by making F14's
  prototype export test as close to `recap-dialog.tsx`'s real usage as possible — transparent background,
  portrait aspect, same `html-to-image` call path.
