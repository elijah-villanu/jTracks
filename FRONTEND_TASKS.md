# jTracks V2 — Frontend Tasks

**Source of truth:** [`PRD_V2.md`](./PRD_V2.md). V1's shipped requirements are in [`PRD.md`](./PRD.md);
where V2 changes V1 behavior, V2 wins.

**Owns:** everything under `frontend/`
**Do not edit:** anything under `backend/`

**Task IDs continue from V1** (F1–F9 are the shipped MVP tasks, archived at
[`v1/FRONTEND_TASKS.md`](./v1/FRONTEND_TASKS.md)). V2 starts at **F10**, so a reference to "F8" always
means the same thing in both documents.

**V2.1's tasks live in their own section at the end of this file** ([jump](#jtracks-v21--frontend-tasks-21))
and continue the same sequence from **F25**. Everything between here and that heading is the V2 section,
unchanged.

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
  **Superseded 2026-08-31 by F33:** the "table's own internal horizontal scrollbar is intentional"
  exception recorded above is **retired**. R13.1 forbids it, and F30–F32 removed it — at 375px the board
  now renders as a card list with `documentElement.scrollWidth` 360 ≤ 375 and no scrolling container
  anywhere on the page. The rest of this entry still stands.
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

---

# jTracks V2.1 — Frontend Tasks (2.1)

**Source of truth:** [`PRD_V2_1.md`](./PRD_V2_1.md). The baseline of record is
[`PRD_V2.md`](./PRD_V2.md) (status model, Sankey data contract, expanded ranges, session security);
where V2.1 changes V2 behavior, V2.1 wins; where V2.1 is silent, V2 still applies. Requirement numbers
continue V2's, so a bare "R5" or "R13" is unambiguous across both PRDs.

**Owns:** everything under `frontend/`, plus `docs/decisions/`
**Do not edit:** anything under `backend/`

**Task IDs continue from V2** (F10–F24 above are the shipped V2 tasks). V2.1 starts at **F25**, so a
reference to "F16" means the same thing across V1, V2 and V2.1.

**Shared contract: N/A for V2.1 — deliberately empty.** PRD_V2_1.md is confirmed **frontend-only** (its
Q6, resolved): no backend change, no schema change, no `backend/API_SPEC_V1.md` change, no new endpoint,
no new field, no migration. There is nothing here for DATABASE_TASKS.md or BACKEND_TASKS.md to know about
or diverge from. The V2 shared-contract block near the top of this file still applies verbatim and is an
*input* to V2.1, not a subject of it — the sankey payload, the recap payload, the status enum and every
metric definition are frozen. **If a task below appears to need an API or schema change, the task is
wrong**: descope it (PRD_V2_1.md's Non-goals say so explicitly), don't expand the contract.

**Explicitly out of scope — do not create tasks for these:**

- ~~**R15 (Mobbin MCP).** Confirmed *skipped* for V2.1~~ — **superseded, see `PRD_V2_1.md`'s R15.**
  Mobbin MCP is now adopted: installed in `.mcp.json` (`mobbin`), governed by
  `.claude/rules/mobbin-ui.md`, and permissioned in `.claude/settings.local.json`. Milestone FV9's
  F42/F43 below cite the Mobbin references gathered with it. There is still no dedicated task for
  Mobbin itself — it's tooling, not a deliverable — so this remains "not a task," just no longer
  "not used."
- **R14.1 — the motion pass that already landed.** The MagicUI MCP server, `.claude/rules/magicui-ui.md`,
  `docs/decisions/magicui-conventions.md`, `main.tsx`'s `<MotionConfig reducedMotion="user">`, and
  `BlurFade`/`BorderBeam`/`NumberTicker` across Analytics, Login, Signup, the Applications header and
  Settings are **done and merged**. Context for FV10, not scope-to-build.
- **R14.6's motion candidates** — an offer-celebration effect, status-change transitions in the table,
  chart draw-on animation. The PRD records these as discussed but **not approved**. Chart draw-on
  additionally collides with R12.5's export prohibition. If one is later approved it becomes a new task,
  not an expansion of one below.
- **R11.5 — type scale, `--radius`, table/card density.** `[unconfirmed]` and not assumed in scope.
  `--radius: 0.625rem` stays as it is.
- Marketing infrastructure and any SEO program beyond a `<title>` + description meta tag.

## Milestone FV6: Theming overhaul (delivery stage 1 — R11)

> First stage per the PRD's delivery sequence: everything in FV7–FV11 should be *built* in the final
> palette rather than re-themed twice. Q2 is resolved (neutral + one accent hue; light/dark/system in
> scope) so nothing blocks this milestone. Q7's reference material has not arrived — R11.2 explicitly
> authorizes picking a reasonable default hue rather than waiting for it.

- [x] **F25 — Theme provider: light / dark / system, persisted, with no flash on load** (M)
  R11.1. `frontend/src/index.css` already ships a complete `.dark` token block (lines 42–74) and
  `@custom-variant dark (&:is(.dark *))` (line 5), and components across the tree carry `dark:` variants —
  all of it dead code, because nothing ever adds `.dark` to the document. Add
  `frontend/src/lib/theme-context.tsx` plus `frontend/src/hooks/useTheme.ts`, mirroring the existing
  `lib/auth-context.tsx` / `hooks/useAuth.ts` split, exposing `theme: "light" | "dark" | "system"` and
  `setTheme`. The provider toggles `.dark` on `document.documentElement` (`.dark` on `<html>` makes every
  `dark:*` descendant selector match) and subscribes to
  `matchMedia("(prefers-color-scheme: dark)")` so `system` tracks live OS changes, not just the value at
  mount. `system` is the default for a first-time visitor.
  Persist under a `jtracks_theme` `localStorage` key. This is **not** auth material and does not violate
  F19's "no auth material in localStorage, ever again" rule — say so in a comment so a future session
  doesn't "fix" it. Mount the provider in `frontend/src/main.tsx` inside `<MotionConfig>` and outside
  `<BrowserRouter>`, so `/login`, `/signup` and the later landing route are covered too, not just the
  authenticated tree.
  No-flash: add a small synchronous inline script in `frontend/index.html`'s `<head>`, before the
  `/src/main.tsx` module script, that reads the same `jtracks_theme` key and `prefers-color-scheme` and
  sets the class before first paint. Keep the key name documented in one place so the two can't drift.
  Also set the CSS `color-scheme` property on `:root`/`.dark` so native scrollbars, form controls and the
  canvas background follow the theme.
  Acceptance: toggling the class by hand in DevTools is no longer the only way to see dark mode; with
  `theme = "dark"`, a hard reload paints dark with **no light flash** (throttle CPU 6× to make a flash
  visible if one exists); with `theme = "system"`, changing the OS appearance while the tab is open
  updates the app without a reload; `tsc -b` and `npm run lint` clean.
  Depends on: none — **blocks F26, F27, F28, F29** and every "verify in both themes" acceptance below.

- [x] **F26 — Theme control in the app shell** (S)
  R11.1's "a visible control in the app shell (`AppLayout`)". `components/layout/AppLayout.tsx` has two
  nav surfaces that both need it: the desktop action cluster (the `hidden items-center gap-3 sm:flex`
  div holding Paste a Link / Add Job / Log out) and the mobile `Sheet` body below the `Separator`.
  Three states, not a binary switch — a two-way toggle cannot express `system`.
  Per `.claude/rules/shadcn-ui.md` this is structural/interactive UI, so it is shadcn, never MagicUI.
  Two acceptable shapes: a segmented button group following the existing `dashboard/date-range-control.tsx`
  precedent (`role="group"` + `aria-label`, one button per option), or a shadcn dropdown menu — which is
  **not installed** (`frontend/src/components/ui/` has no `dropdown-menu.tsx`), so add it via
  `npx shadcn@latest add dropdown-menu` from `frontend/` rather than hand-rolling a menu.
  Build it as a standalone `components/layout/theme-toggle.tsx`: R11.1 also requires the control on the
  landing page, and that half lands in **F43** with the landing header (the route doesn't exist yet) —
  exporting it once means F43 drops it in instead of building a second one.
  Acceptance: reachable and operable by keyboard at both desktop and 375px widths; all three states
  selectable; selection survives a reload; the control has a real accessible name and announces the
  active option (an icon-only trigger needs an `sr-only` label, like the existing "Open menu"
  `SheetTrigger`).
  Depends on: F25

- [x] **F27 — Give `--primary` / `--ring` a real accent hue in both token blocks** (M)
  R11.2, confirmed direction: neutral base + one accent hue. Today both blocks in
  `frontend/src/index.css` are entirely zero-chroma — `--primary: oklch(0.205 0 0)` light /
  `oklch(0.922 0 0)` dark, `--ring: oklch(0.708 0 0)` / `oklch(0.556 0 0)`. Pick one hue and apply it to
  `--primary`, `--primary-foreground`, `--ring` and the `--sidebar-primary`/`--sidebar-ring` pair in
  **both** `:root` and `.dark`. `--chart-1`..`--chart-5` and the rest of the grayscale base are
  deliberately **not** rethought (R11.2 is explicit) — leave them alone; status colors are F28's job.
  Every surface currently relying on a zero-chroma `--primary`/`--ring` must be re-verified once it
  carries chroma: `Button`'s default variant, `AppLayout`'s skip link (`bg-primary text-primary-foreground`),
  the two `Briefcase` logo icons (`text-primary`), the global `outline-ring/50` rule in `index.css`'s
  `@layer base`, and every explicit focus ring (`applications-table.tsx`'s `SortButton` and the staleness
  warning both use `focus-visible:outline-ring`).
  Acceptance: `--primary` and `--ring` carry nonzero chroma in both blocks; primary buttons, links and
  every focus ring meet WCAG AA (4.5:1 text, 3:1 non-text) against their real backgrounds in **both**
  themes, measured with a contrast tool and written down — not eyeballed; no color moved outside
  `index.css`.
  Depends on: F25

- [x] **F28 — Make the status palette theme-aware and drive it from one place** (M)
  R11.3 + R11.4. Status color is currently defined in two disconnected places:
  `STATUS_BREAKDOWN_COLORS` in `components/dashboard/status-breakdown-chart.tsx` (hardcoded hex, whose own
  doc comment says *"This app has no reachable dark mode yet ... so these are hardcoded rather than
  theme-aware. Dark-safe equivalents exist if a toggle ever ships: `interviewing_oa #d97706`,
  `offer #059669`"*), and `STATUS_COLOR_CLASSES` / `STATUS_FOCUS_CLASSES` / `STATUS_CELL_CLASSES` in
  `components/StatusBadge.tsx` (Tailwind palette classes that already carry `dark:` variants). F25 makes
  that "if a toggle ever ships" condition true — apply the dark-safe values and re-check the badge maps in
  the real dark theme rather than trusting them.
  `STATUS_BREAKDOWN_COLORS` is consumed as raw fill/stroke strings by `dashboard/sankey-chart.tsx` (node
  `fill`, ribbon `stroke`) as well as by the breakdown chart's `<Cell fill>`, so promoting it to CSS
  variables (`--status-applied` … in both `:root` and `.dark`, mapped through `@theme inline`) is what
  satisfies R11.3's "made once, in the token layer, and flow to all of them".
  **Export caveat (R12.5 / R11.4):** `RecapCard` renders `SankeyChart` inside the `html-to-image` subtree
  and is deliberately self-contained (its own gradient background, because the export canvas is
  transparent). Verify a `var(--status-*)` fill actually serializes through `toBlob` at `pixelRatio: 4`.
  If it does not, the recap path keeps resolved literal values while the token layer stays the single
  source — and either way `RecapCard` must **not** start depending on `.dark` state, since the exported
  PNG has no theme context.
  R11.3's two hard constraints hold: all seven statuses stay mutually distinguishable in both themes, and
  color is never the only carrier of meaning (WCAG 1.4.1) — `StatusBadge`'s label text, the breakdown
  chart's permanent `LabelList`, and every `ChartDataTable` stay exactly as they are.
  Acceptance: status colors visibly differ between light and dark and are legible in both; `rejected` and
  `failed` remain unmistakable at a glance in both themes (F10's standing constraint); the breakdown
  chart, the Sankey nodes/ribbons, the badges, the row cell tints and the status-select items all change
  together from a single edit; a real recap export still shows correctly-colored nodes and ribbons.
  Depends on: F25, F27

- [x] **F29 — Both-theme sweep, token-discipline audit, and the palette decision record** (M)
  R11.1's "dark mode is not shipped until every route has been checked in it", R11.4, and the PRD's
  *dark mode doubles the verification surface* risk. Open every surface that exists **today** in both
  themes and fix what breaks: `/` (table + toolbar), `/analytics` (all five stat tiles, both Recharts
  charts, the Sankey card, `DateRangeControl` including the open `Calendar` popovers), `/profile`,
  `/login`, `/signup`, plus `ApplicationFormDialog`, `AutofillDialog`, `ConfirmAppliedDialog` and
  `RecapDialog` with its card preview. Include the shipped MagicUI accents: `BorderBeam`'s
  `colorFrom`/`colorTo` and `NumberTicker`'s className overrides (per the conventions doc) must still read
  correctly on a dark card.
  Token discipline: grep `src/` for hardcoded `#`, `oklch(` and `rgb(` outside `index.css`. The known
  permitted exceptions are `recap-card.tsx`'s self-contained gradient
  (`from-slate-900 via-slate-800 to-slate-950`, deliberate per R11.4) and whatever F28 concluded about
  export serialization. Everything else is a finding.
  Record the decision (per the PRD's Documentation NFR): the chosen accent hue, its oklch value, the
  rationale, and the contrast results, in `docs/decisions/magicui-conventions.md`'s theming section —
  which currently asserts the project is fixed at `baseColor: "neutral"` with "every existing color
  grayscale (`oklch(... 0 0)`, zero chroma)", a claim F27 makes false.
  Acceptance: a written checklist of every route and dialog above × light/dark with no contrast failure;
  no unexplained hardcoded color outside `index.css`; the conventions doc no longer claims the palette is
  grayscale and names the actual hue.
  **Done:** sweep performed in a real browser against MSW fixtures; the checklist, measured contrast
  numbers and the token-discipline findings are in `docs/decisions/magicui-conventions.md`'s "F29 live
  both-theme sweep" table. Every listed route and dialog passed in both themes, including the two states
  that need driving rather than just visiting (`ConfirmAppliedDialog` via a real `saved → applied`
  transition, and both tones of `ApplicationFormDialog`'s notice banner via the autofill flow). Two
  carry-overs are recorded there rather than fixed, neither a contrast failure: `--primary` used as
  *body text* clears only 3.45:1 in light (the `link` Button/Badge variant is defined but never invoked
  — fix before anyone uses it), and `applications-over-time-chart.tsx`'s `TREND_COLOR` still duplicates
  `--status-applied` as a literal. One thing genuinely not re-verified: an actual `toBlob` recap export
  (the export path runs but did not complete in this environment) — fold that into F48's per-skin
  reference baselines. **Resolved by F35/F39/F48:** the export path is fine; it only needs the Chrome
  window *visible*, and five real 1080×1920 baselines now exist. F48 additionally measured the exported
  card's contrast off the PNG itself.
  Depends on: F27, F28

## Milestone FV7: Applications table without horizontal scroll (delivery stage 2 — R13)

> **Sequencing choice: run this concurrently with FV6, not strictly after it.** The PRD proposes R13
> second, but the two milestones share no files — FV6 owns `index.css`, `main.tsx`, the new theme context,
> `AppLayout.tsx`, `StatusBadge.tsx` and `status-breakdown-chart.tsx`; FV7 owns `applications-table.tsx`,
> `ApplicationsPage.tsx` and a new card-list component. The single coupling runs one way: the table (and
> the new card rendering) *consume* the status class maps F28 rewrites, so **F33's both-theme check waits
> on F28** while F30–F32 do not. R13 is also the highest day-to-day UX payoff in this file, and Q4 is
> fully resolved (A + B combined), so nothing blocks starting it now.

- [x] **F30 — Kill the blanket `whitespace-nowrap` at the call site, set per-column wrap rules** (S)
  R13.3. `frontend/src/components/ui/table.tsx` puts `whitespace-nowrap` on **both** `TableHead` (line 71)
  and `TableCell` (line 84), so none of the six columns can wrap, and the container's `overflow-x-auto`
  (line 9) turns that into a horizontal scrollbar. Fix at the call site in
  `components/table/applications-table.tsx` — per-column `className`s that opt specific columns back into
  wrapping and give Company / Job Title sane min/max widths. **Do not edit the shadcn primitive** to do
  it: R13.3 is explicit that changing `table.tsx` would silently change behavior for every future table.
  Optional bonus, explicitly *not* a required deliverable (R13.2 option D): the Status cell packs a
  `StatusBadge`, a `StatusSelect` and the conditional staleness warning into one flex row, making it the
  widest cell on the board. Dropping the redundant `StatusBadge` where `StatusSelect` already shows the
  same status reclaims that width cheaply. Do it if convenient, skip it without guilt — and if you do,
  leave the staleness warning's `role="img"` + `aria-label` + visually-hidden duplicate untouched.
  Acceptance: at ~700px the table wraps long company/title text instead of extending the row;
  `components/ui/table.tsx` is unchanged; sort, status-change and edit interactions all still behave.
  Depends on: none

- [x] **F31 — Column-priority hiding at intermediate widths** (M)
  R13.2 option A. Below an intermediate breakpoint (the exact value is an implementation decision — the
  PRD deliberately doesn't fix it) drop Location, then Date Applied, from the `COLUMNS` array in
  `applications-table.tsx` — both the `<th>` and the matching `<td>`, kept in sync so the
  `colSpan={columnCount}` on the "No applications match your filters." empty row stays correct.
  R13.4 is the hard part: Tailwind's `hidden` is `display:none`, which removes the cell from assistive
  tech too, so a hidden column's value must be genuinely present elsewhere **on the same screen** — fold
  Location / Date Applied into the Company or Job Title cell as a secondary line at those widths, or emit
  them as visually-hidden text in the row. "It's in the edit dialog" does not satisfy R13.4 for a column
  hidden on the primary screen.
  The sort buttons for hidden columns disappear with their headers — confirm that leaves `sortKey` in a
  valid state. A user can be sorted by `location` and then narrow the window; the sort must keep applying,
  not throw and not silently reset.
  Acceptance: at the chosen intermediate width there is no horizontal scrollbar and both hidden columns'
  values are still readable in every row; `aria-sort` still reports correctly on the remaining columns;
  resizing while sorted by a now-hidden column neither errors nor loses the sort.
  Depends on: F30

- [x] **F32 — Card-list rendering below the narrow breakpoint** (L)
  R13.2 option B. Below a narrow breakpoint (`sm`-ish), render stacked cards instead of a `<table>` — one
  card per application carrying all five data fields plus the same status control, staleness warning and
  edit button. Drive both renderings off the same `applications` prop and the same label source so the two
  cannot drift.
  R13.5 is what makes this large rather than medium: a `<table>`'s `aria-sort`, `<th scope>` semantics and
  `TableCaption` count sentence have no automatic equivalent in a `<div>` list. The card rendering needs
  **its own sort control that announces its state** — `applications-table.tsx`'s `SortButton` pattern
  (accessible name is just the column name, state carried solely by the parent `<th aria-sort>`) does not
  transfer, so a standalone control must carry the state in its own accessible name or an adjacent live
  region — and **its own count summary** equivalent to the caption's "Showing N of M tracked
  applications." `ApplicationsPage`'s two polite live regions (`actionStatus`, `tableStatus`) live on the
  page rather than the table, so they should keep working for both renderings — verify that, don't assume
  it.
  Both renderings must go through the same `onStatusChange` → `handleStatusChange` path, so the
  Saved→Applied `ConfirmAppliedDialog` flow and its `finalFocusRef` focus restore (which resolves the
  target lazily via `statusSelectId(application.id)`) still work from a card. That id must stay unique:
  switching renderings in JS mounts only one at a time, but a CSS-only `hidden` / `sm:block` swap would
  mount both and duplicate every DOM id on the page.
  Acceptance: at 375px there is **no horizontal scrollbar**
  (`document.documentElement.scrollWidth === innerWidth`) and every value from all five columns is
  visible; sorting from the card rendering works and announces its state; the count summary is present;
  changing a card from `Saved` to `Applied` opens the confirm dialog and returns focus correctly on close;
  no duplicate DOM ids at any width.
  Depends on: F30, F31

- [x] **F33 — 375px and accessibility non-regression verification for the board** (M)
  R13.1 and R13.5, plus the PRD's *a UI overhaul is the most efficient way to silently undo an
  accessibility audit* risk. F24 above already verified the rest of the app at 372px and recorded that
  "the table's own internal horizontal scrollbar (pre-existing, intentional per F9) is the only scroll
  surface anywhere" — that scrollbar is exactly what R13.1 now forbids, so this task retires F24's
  documented exception.
  Verify at a real narrow layout viewport (a genuine ~375px window, not a devtools emulation — the F21 and
  F24 verification notes above show the difference matters here), at the intermediate breakpoint, and at
  desktop: no horizontal scroll on the page or the table container; `aria-sort` present and correct; the
  sort button's accessible name still just the column name; the staleness warning keeps its `role="img"`,
  `aria-label` and visually-hidden duplicate in **both** renderings; both polite live regions still
  announce; axe run and compared against the pre-V2.1 baseline. Do all of it in both themes.
  Acceptance: written results for all three widths × both themes; no new axe violation; F24's "intentional
  internal horizontal scrollbar" exception explicitly retired in this file.

  **Verified 2026-08-31** against MSW fixtures in real same-origin iframes (genuine layout viewports, not
  devtools emulation), measuring `documentElement.scrollWidth` vs `innerWidth` and, separately,
  `[data-slot="table-container"]`'s `scrollWidth` vs `clientWidth`:

  | Width | Rendering | Page overflow | Table container overflow | Columns |
  |---|---|---|---|---|
  | 375px | cards | none (360 ≤ 375) | n/a | all 5 fields per card |
  | 640px | table | none (625 ≤ 640) | none | Company, Job Title, Status |
  | 700px | table | none (685 ≤ 700) | none (651/651) | Company, Job Title, Status |
  | 900px | table | none (885 ≤ 900) | none (851/851) | + Date Applied |
  | 1023px | table | none (1008 ≤ 1023) | none | all 6 |
  | 1024px | table | none (1009 ≤ 1024) | none | all 6 |
  | 1280px | table | none (1265 ≤ 1280) | none (1118/1118) | all 6 |

  R13.4 confirmed live: at 900px the Company cell carries `Location: Remote` and at 700px the Job Title
  cell also carries `Date Applied: …`, both as real DOM with `sr-only` prefixes (not `aria-hidden`).
  `aria-sort` present and correct on remaining headers; the card list's sort combobox exposes all 10
  field+direction pairs, re-sorts correctly, and announces via both its own value ("Company, descending")
  and the page's `tableStatus` region ("19 of 19 applications shown, sorted by Company descending.");
  count summary present and wired with `aria-describedby`; the staleness warning keeps `role="img"` +
  `aria-label` + `tabIndex 0` in both renderings; both polite live regions fire from the card rendering;
  **zero duplicate DOM ids at every width** (19 unique `status-select-*`, one rendering mounted at a time).
  **axe (4.10.2) clean — zero violations** at 375px/cards/dark, 700px/table/dark and 1536px/table/dark.
  Both themes checked; the card rendering was reviewed visually in dark as well as light.

  **One fix was required, and it was not the table's.** Between roughly 640px and 885px the *page* scrolled
  horizontally because `AppLayout`'s desktop action cluster (`hidden items-center gap-3 sm:flex`, ~534px
  wide, needing ~885px of viewport with the logo and nav) became visible at `sm`. Measured at 700px:
  `scrollWidth` 882 with the cluster, 778 with F26's `ThemeToggle` temporarily removed — i.e. **pre-existing**,
  merely widened ~104px by FV6, and only a defect once R13.1 forbade page-level horizontal scroll. Fixed by
  gating the cluster (and the `SheetTrigger`/`SheetContent`) at `lg` instead of `sm`, so the mobile Sheet —
  which already carries every action including the theme toggle — covers everything below 1024px. Verified
  after the change: no overflow at 640/700/1023, clean handoff at 1024 (hamburger hidden, cluster visible,
  exactly one visible `ThemeToggle`, no duplicated controls).

  **Not verified:** the `Saved → Applied` confirm-dialog focus restore *from a card*. It verifies correctly
  from the **table** (focus returns to the row's status trigger), and the card path shares the same
  `StatusControl`, the same unique `statusSelectId`, and the same lazy `finalFocusRef` lookup — but synthetic
  clicks leave Base UI's Select popup mounted and real pointer events did not land in the iframe rig, so
  `document.activeElement` could not be read cleanly at 375px. Worth one manual keyboard pass before relying
  on it. (An unrelated PATCH failure seen mid-verification was a harness artifact: the backend's
  `CORS_ORIGINS` allows only port 5173 and the mock server was briefly on 5174; PATCH preflights bypass the
  service worker and hit the real backend. It does not reproduce on 5173.)
  Depends on: F32, and **F28** (status colors must be final before the both-theme pass)

## Milestone FV8: Sankey & recap visual restructure (delivery stage 3 — R12)

> **F34 resolved — Q3/R12.6 answered, F48–F50 appended.** PRD_V2_1.md's Q3 and R12.6 are now fully
> resolved: the recap becomes a three-skin selectable design (Strava/Duolingo/Beli, see R12.7), and
> the previously-undescribed "something else" is superseded by the broader design-overhaul
> direction recorded in R16 (Milestone FV11, this same file). F35–F39 cover the five originally-
> confirmed sub-items; F48–F50 below cover the recap skin system.
>
> Depends on FV6 landing first — status colors are the chart's primary visual language (R11.3), so
> restructuring the chart before the palette is final means making the same visual judgments twice.

- [x] **F34 — Blocker: get Q3's undescribed item and R12.6's recap scope described** (S, decision task)
  A question for the user, not a spike resolvable by reading code. Ask for (a) the "something else" beyond
  R12.1 / R12.2 / R12.3 that Q3 records as still-pending, and (b) whether the recap card changes further
  beyond R9's shipped layout (three hero stats + schematic `weighted={false}` Sankey + logo/date footer in
  `dashboard/recap-card.tsx`) — and if so, what specifically reads wrong today. Ideally grounded in
  reference material committed to `frontend/reference/` the way `strava_reference.PNG` grounded R9; Q7
  records that more reference material is coming but had not arrived as of the PRD revision. Reference
  material lives in the repo so the intent is recoverable later; it never ships in the bundle.
  Deliverable: the answer written back into `PRD_V2_1.md` — Q3 and R12.6 struck through and resolved, the
  same way Q1/Q2/Q4/Q5/Q6 already are — **and** whatever concrete tasks it implies appended to this
  milestone as **F48+**.
  Acceptance: Q3 no longer reads "not yet described"; R12.6 is either scoped into named tasks in this file
  or explicitly recorded as out of scope for V2.1.
  **Resolved:** the user confirmed the "something else" is superseded by a broader design-overhaul
  direction (grounded in Mobbin references reviewed directly, plus `strava_reference.PNG` for the recap).
  `PRD_V2_1.md`'s Q3, R12.6 are struck through/resolved and a new R12.7 + R16 record what it implies —
  F48–F50 (recap skin system, this milestone) and Milestone FV11's F51–F54 (board view, entry-flow/
  settings/stat-tile polish).
  Depends on: none — **blocks FV8's completion**, but not F35–F39's start (those five sub-items are
  confirmed and independently buildable).

- [x] **F35 — Export-compatibility baseline, before touching anything** (S)
  R12.5, and the PRD's *the recap export is the most fragile thing V2.1 touches* risk, which says
  explicitly: verify with a real export **early, not at the end**. Before any R12 change, run
  `dashboard/recap-dialog.tsx`'s real Download path
  (`toBlob(cardRef.current, { pixelRatio: 4 })` — `backgroundColor` deliberately omitted so the outer
  canvas stays transparent) and keep the resulting 1080×1920 PNG as the reference to diff F39 against.
  Do the same for the two degenerate states F17 handles (`total === 0`, and everything still sitting in
  `applied` — both render `SankeyEmptyPlaceholder` rather than a diagram, since `d3-sankey` returns null
  coordinates when `links.length === 0`).
  Also write the standing rule into the code: `recap-card.tsx` and `sankey-chart.tsx`'s `weighted={false}`
  path sit **inside** the exported subtree, so **no Motion/MagicUI component may be placed there** — an
  in-flight animation serializes at whatever frame it happens to be on, and Motion's inline transforms
  aren't guaranteed to survive serialization. Decorative motion *around* the card in the dialog is fine.
  Acceptance: a pre-change reference PNG exists at 1080×1920 with the schematic Sankey fully drawn and a
  transparent outer canvas; both degenerate states captured too; a comment in `recap-card.tsx` states the
  no-animation-inside-the-export rule so the next session doesn't have to rediscover it.

  **Done 2026-09-01.** Three baselines captured in `frontend/reference/`, all produced by the app's *real*
  Download path (`toBlob(cardRef.current, { pixelRatio: 4 })`), taken against FV6's final palette and
  before any R12 change:

  | File | State | Bytes |
  |---|---|---|
  | `recap-baseline-all.png` | All-time, schematic Sankey fully drawn (6 ribbons, all 6 funnel statuses) | 1,780,269 |
  | `recap-baseline-empty-total.png` | `total === 0` (Week range) — `SankeyEmptyPlaceholder` | 1,779,593 |
  | `recap-baseline-inflight-only.png` | `links.length === 0` with `total > 0` — "All 17 applications are still in flight" | 1,779,520 |

  Verified 1080×1920 with a transparent outer canvas. The all-time export was produced twice in separate
  page loads and came back **byte-identical** (1,780,269 both times), which is useful for F39: a
  pixel/byte diff against this baseline is meaningful, not noisy.

  > **Superseded by F48 (2026-09-03).** The recap is now three selectable skins, so a single all-time
  > baseline no longer identifies what it is a baseline *of*. `recap-baseline-all.png` was deleted and
  > replaced by one file per skin (`recap-baseline-strava.png`, `-duolingo.png`, `-beli.png`); the two
  > degenerate-state files kept their names but were re-shot against the Strava skin, whose card
  > background F48 made transparent. Byte counts in the table above are therefore historical — see F48
  > for the current set. The regeneration recipe below is unchanged and still correct.

  *How to regenerate (F39 and F48 will need this).* The export cannot be captured with a browser download
  in this setup, so the bytes are POSTed to a tiny local receiver instead: run a Node HTTP server that
  writes `POST /save?name=<n>` bodies into `frontend/reference/`, then in the page patch
  `URL.createObjectURL` to `fetch(...)` the blob to it and no-op `HTMLAnchorElement.prototype.click` for
  `[download]` anchors so nothing actually downloads, then click Download. Two environment gotchas, both
  cost real time here: **(1)** run the dev server on **port 5173** — the backend's `CORS_ORIGINS` allows
  only 5173/127.0.0.1:5173, and non-simple requests preflight past the service worker to the real backend;
  **(2)** `toBlob` is intermittently slow in this sandbox — observed 232ms, 351ms, ~36s and ~138s for the
  same work, and it sometimes appears to hang entirely. It is **not** broken: retry with patience (and a
  fresh page load) rather than concluding the export path is defective. The third-state payload was
  produced by stubbing `window.fetch` to blank `sankey.links` on the `/dashboard/recap` response.
  Depends on: F28 (take the baseline against the final palette, or the diff is meaningless)

- [x] **F36 — Container-measured responsive sizing instead of a scaled fixed viewBox** (M)
  R12.1. `routes/AnalyticsPage.tsx` renders
  `<SankeyChart data={stats.sankey} width={343} height={170} fontSize={9} className="h-auto w-full" />`,
  and `sankey-chart.tsx` emits `viewBox="0 0 343 170"` alongside `width`/`height` — so the SVG scales to
  the card and the "9px" labels actually render at `9 × (cardWidth / 343)` px: a different size at every
  viewport width, divorced from the page's real type scale. Measure the container (a `ResizeObserver`, or
  equivalent, on a wrapping element) and lay the chart out at real pixel dimensions so label size is a
  constant, chosen value at every width.
  Two things this must not break. First, the recap path passes explicit
  `width={230} height={110} marginX={4} marginY={5} fontSize={6} weighted={false}` from `recap-card.tsx`
  into a fixed 270px-wide export target — keep the explicit-size API working for that caller rather than
  making measurement mandatory. Second, the d3-sankey layout already depends on `width`/`height` through
  `.extent(...)` inside the `useMemo`, so re-measuring reruns the layout — make sure a resize can't thrash
  (measure → layout → element resizes → measure again).
  Acceptance: at 375px, ~700px and desktop the Sankey's labels render at the same computed font-size
  (check the element inspector's computed value, not by eye); the recap card's chart is sized identically
  to before; no resize feedback loop on a slow drag-resize.

  **Verified 2026-09-01** in a real browser: labels compute to **9px at both 296px and 1088px** measured
  widths (read from `getComputedStyle`, not by eye), the SVG's `width`/`viewBox` track the measured
  container 1:1, and at 375px the page still has no horizontal overflow (FV7's guarantee intact).

  **Two defects found and fixed in `useMeasuredWidth` during that pass** — both invisible without a
  browser, and the reason the chart rendered as an empty box on first load:
  - The first measurement was only ever delivered inside `requestAnimationFrame`. A hidden or occluded
    tab is served no frames (Chrome throttles rAF *and* `ResizeObserver` delivery there), so
    `measuredWidth` stayed `null` and the component sat in its `effectiveWidth <= 0` placeholder branch
    indefinitely. The width is now seeded **synchronously** from `getBoundingClientRect()` when the node
    attaches; rAF is kept only to debounce subsequent resizes, which is what it's actually for.
  - The observer was bound once in a `useEffect` keyed on `[enabled]`, capturing `measureRef.current`.
    But this component *swaps its wrapper element* — the zero-width placeholder is a different `<div>`
    than the resolved chart — so the observer went on watching a detached node and no resize after first
    paint was ever measured. Re-bound via a callback ref, which re-attaches whenever the node changes.
  Depends on: F35

> **Visual guidance for F37/F38 (not a separate task):** [Churnkey's flow/stat chart](https://mobbin.com/screens/3ba4f8e2-b296-454f-b5a8-c89c6f3c0ccf) — inline
> percentage labels per branch, its stat-card-adjacent framing — is the user-curated reference for
> this Sankey's visual treatment. Folded in here rather than a new task since this surface is
> already F37/F38's.

- [x] **F37 — Make in-flight applications legible instead of silent blank space** (M)
  R12.2. R5.4 deliberately gives in-flight rows no outgoing edge, and `sankey-chart.tsx` implements that
  honestly by passing each node's `value` as d3-sankey's `fixedValue` — so a node's unfilled remainder is
  real, correct, and completely unexplained: the user cannot tell "still open" from "chart bug". Make the
  shortfall readable — a distinct visual treatment for the unfilled portion of the node rect, an explicit
  annotation, or an inline caption.
  Two hard rules. It must **not** invent a phantom node or link (R5.4/R5.5 forbid it — this is rendering
  only; topology comes from the payload). And it must be reflected in the `ChartDataTable` text
  alternative too, not just the SVG, since that table is the *only* thing a screen reader gets from this
  chart. The shortfall is derivable per node as `node.value − sum(outgoing link values)` from the
  payload's own `nodes`/`links` — never from `status_breakdown`.
  Match the voice of the existing `SankeyEmptyPlaceholder`, which already covers the *total* in-flight
  case ("All N applications are still in flight — outcomes will appear here as they land.") when
  `links.length === 0`, so the two readings are consistent.
  Acceptance: on a fixture where `applied`'s outflow is well below its value, a user can tell how many
  applications are still open without being told (a stated V2.1 success metric); the `ChartDataTable`
  summary/rows carry the same fact; a fixture with zero shortfall shows no annotation at all (no "0 in
  flight" noise); no new node or link appears in the DOM.
  Depends on: F36

- [x] **F38 — Label collision fixes plus keyboard-reachable hover/focus detail** (L)
  R12.3 — both halves are must-have in V2.1, not nice-to-have. Today `sankey-chart.tsx` places every label
  with `const labelOnRight = x0 < width / 2`; on a three-column layout the **middle** column satisfies
  that test, so its label is drawn to the right, straight over the outgoing ribbons. Labels must not
  overlap ribbons or each other at any supported width, and the middle column needs its own placement
  rule. The deliberately long "Failed Interview/OA" is the worst case and **must not be shortened** (V2
  shared contract, PRD R1.2).
  Interaction: add per-node or per-link detail on hover **and** focus. This is what makes the task large —
  the `<svg>` is `aria-hidden="true" focusable="false"` on purpose, with the real content exposed through
  `ChartDataTable`, a deliberate WCAG 1.1.1 decision documented in the component. **Do not un-hide the SVG
  and start bolting ARIA onto `<rect>`/`<path>` nodes**; that regresses the model F16's a11y work
  established. Either put the keyboard-reachable affordance on real focusable elements outside the
  `aria-hidden` subtree, or anchor shadcn's `Tooltip`/`Popover` (both already installed) appropriately —
  per `.claude/rules/shadcn-ui.md`, an interactive affordance is shadcn's job, not a hand-rolled SVG
  event handler.
  Dashboard chart only: the recap's `weighted={false}` render is a static export target and gains no
  interaction (F35's rule).
  Acceptance: at 375px, ~700px and desktop, no label overlaps a ribbon or another label in any of F11's
  fixtures including the all-seven-statuses case; hover shows detail; Tab reaches every detail affordance
  and Escape dismisses it; `ChartDataTable` is unchanged in structure and still the text alternative; axe
  reports no new violation on `/app/analytics`.
  Depends on: F36

- [x] **F39 — Tune node/ribbon geometry and re-verify the export against F35's baseline** (M)
  R12.4 plus R12.5's close-out. `nodeWidth(10)`, `nodePadding(12)` and `UNWEIGHTED_STROKE_WIDTH = 5`
  landed ahead of the PRD and may be tuned further, under two invariants: the weighted dashboard chart's
  thickness stays ∝ value (the `strokeWidth={weighted ? Math.max(1, link.width ?? 0) : …}` path), and the
  recap's unweighted mode stays uniform. Only tune if F36–F38 actually made something read worse —
  "no change needed" is a legitimate outcome, but record which it was and why.
  Then re-run the real export and diff against F35's reference: 1080×1920, transparent outer canvas,
  schematic Sankey fully drawn, no blank, missing or mid-animation regions, and both degenerate states
  still exporting cleanly.
  Acceptance: an updated export PNG differing from F35's baseline only in the intended ways; any geometry
  change justified in a code comment against the two invariants; the dashboard chart's ribbon thickness
  still verifiably tracks link values.

  **Done 2026-09-01.** Re-exported all three states through the app's real Download path, against the same
  MSW fixtures F35 used (17 sent / 7 interviews / 29%), so the diff is data-identical.

  | State | F35 baseline | After F36–F38 | Δ |
  |---|---|---|---|
  | all-time | 1,780,269 | **1,781,795** | +1,526 bytes |
  | `total === 0` | 1,779,593 | 1,779,593 | **byte-identical** (`cmp`) |
  | `links.length === 0` | 1,779,520 | 1,779,520 | **byte-identical** (`cmp`) |

  Only the state containing a real Sankey moved — the two placeholder states are bit-for-bit unchanged,
  which localises the change to Sankey geometry and rules out collateral drift in the stats block, footer
  or card chrome.

  **The single visual difference is F38's label fix reaching the recap.** In the baseline, the middle
  column's "Interviewing / OA" label was drawn to the *right* of its node, directly over its own outgoing
  ribbons; it now sits above the node, clear of both the incoming and outgoing ribbons. That is the same
  defect F38 fixed on the dashboard, inherited here because `sankey-chart.tsx` is shared — an improvement,
  not a regression, so **the all-time baseline has been re-baselined** to the new export (old byte count
  recorded above for traceability). The other two files were left untouched since they are identical.

  **No further geometry tuning was needed** — "no change needed" per this task's own wording. `nodeWidth(10)`,
  `nodePadding(12)` and `UNWEIGHTED_STROKE_WIDTH = 5` all still read correctly at both scales; nothing
  F36–F38 changed made anything read worse. The one geometry value that did move (`topInset`, from
  `marginY` to `max(marginY, fontSize + 6)` when a pass-through node exists) was required by F38's
  above-node label placement, not a discretionary tune, and is justified in a comment at its definition.

  Both invariants verified, not assumed:
  - *Weighted dashboard thickness ∝ value* — measured `stroke-width` against link values: 7→60.53,
    3→25.94, 3→25.94, 2→17.29, 2→17.29. Every ratio is exactly **8.647**.
  - *Recap unweighted stays uniform* — all ribbons render at the constant `UNWEIGHTED_STROKE_WIDTH`,
    confirmed in the exported PNG.

  Export contract re-confirmed on the new file: **1080×1920**, RGBA, corner alphas `0, 0, 9, 9` (transparent
  outer canvas; the 9s are the card's rounded-corner blend), centre opaque, schematic Sankey fully drawn,
  no blank/missing/mid-animation regions. Exporting twice produced byte-identical output, so the export is
  deterministic and future diffs are signal.

  *Environment note that cost real time:* `toBlob` only works reliably when the Chrome window is actually
  **visible**. With `document.visibilityState === "hidden"` the export either hangs for minutes or silently
  yields a blank/garbage file — one run wrote 2,522 bytes of JavaScript because the capture hook grabbed a
  Vite HMR module blob instead of the PNG. Guard any capture hook on `blob.type === "image/png"`, and
  foreground the window before exporting. Visible, the same export takes ~300ms.
  Depends on: F35, F36, F37, F38

- [x] **F48 — Recap skin-selector infrastructure, plus the "Strava" skin (transparent background)** (L)
  R12.7. Introduces a small "recap skin" concept: the same recap data rendered by one of several
  interchangeable card designs, selected by the viewer inside `dashboard/recap-dialog.tsx`. Migrates the
  *existing* `recap-card.tsx` design into the first skin ("Strava"), with one deliberate change: **this
  skin's card background becomes transparent** (no `bg-gradient-to-b from-slate-900 via-slate-800
  to-slate-950` div) instead of the current opaque dark gradient, per the user's explicit requirement and
  the layout sketch at `frontend/reference/strava_reference.PNG` — a floating stat overlay rather than a
  filled card. This narrows R11.4's/F28's prior "recap card gradient is a permanent exception" note to the
  other two skins (F49, F50) only.
  **Legibility risk, must be handled, not skipped.** The opaque gradient existed to guarantee contrast for
  light stat text and Sankey status colors regardless of what the card is shared onto — dropping it means
  the same text could land on a light background (e.g. a plain white Instagram Stories canvas) and become
  unreadable. This skin needs its own legibility treatment independent of a solid backdrop (a text shadow/
  stroke, a subtle scrim behind just the type, or similar), verified by actually exporting the card over
  both a light and a dark test background — not assumed from the on-screen dialog view alone, since the
  dialog's own background is not what the export composites onto.
  **Selector mechanism.** A horizontally paged view the viewer can page through — shadcn's `carousel`
  component (Embla-based; not yet installed — `npx shadcn@latest add carousel` from `frontend/`) is the
  natural fit, per `.claude/rules/shadcn-ui.md`. Needs visible previous/next controls and dot-style
  pagination (not swipe-only — touch drag is a nice-to-have on top, never the only path), each
  keyboard-focusable with a real accessible name ("Recap design 1 of 3, Strava" style), and the current
  selection announced so a screen-reader user knows which skin is active. Defaults to the Strava skin and
  **remembers the last-picked skin per user** (a `jtracks_recap_skin` `localStorage` key, same
  non-auth-material justification F25 documents for its theme key).
  Extend F35's export-safety baseline to **one reference PNG per skin** (currently just one) so future
  changes to any skin have something real to diff against.
  Acceptance: exactly one skin renders in the exportable subtree at a time; Download/Share always export
  whichever skin is currently selected, still 1080×1920 with a transparent *outer* canvas; the Strava
  skin's card itself has a transparent background and its text/Sankey content stays legible when
  composited over both a light and a dark test image; the selector is fully keyboard-operable with correct
  accessible names/announcements; `tsc -b`/lint clean.
  Depends on: F35 (needs re-baselining per skin), F28 (final status/token palette for the two skins that
  do use it).

  **Done 2026-09-03.** New `components/dashboard/recap-skins/` package: `types.ts` (ids + the props every
  skin takes), `shared.tsx` (`RECAP_LITERAL_COLORS`, `featuredStats`, the shared `RecapFooter`/eyebrow),
  one file per skin, and `index.ts` holding the `RECAP_SKINS` registry that the slide order, dots,
  accessible names and default all derive from — adding a fourth skin is one entry plus one baseline, and
  touches neither the dialog nor `recap-card.tsx`. `recap-card.tsx` is now a dispatcher over that
  registry; the design that used to live in it is `recap-skins/strava-skin.tsx`. Persistence is
  `hooks/useRecapSkin.ts` on `jtracks_recap_skin`, guarded by `isRecapSkinId` so a stale or hand-edited
  value falls back to the default rather than rendering `undefined`. Selector is shadcn `carousel`
  (installed via `npx shadcn@latest add carousel`) with real Previous/Next buttons and a dot row — drag is
  additive, never the only path.

  *Export target.* All three cards mount so Embla can measure them; `exportCardToBlob` reads
  `cardRefs.current[skinId]`, so exactly one skin is ever inside the subtree handed to `toBlob`. Download
  filenames are now skin-qualified (`jtracks-recap-all-strava.png`) so exporting several designs doesn't
  overwrite one file.

  *Two real defects found by measuring rather than eyeballing.* **(1)** The carousel blew the dialog out to
  842px inside its own 384px cap: `DialogContent` is a `grid`, and Embla's flex track of `basis-full`
  slides gave the column a three-cards-wide max-content minimum. `min-w-0` floors it (384 / 352 viewport /
  270 card, no page overflow). **(2)** The stored skin was being destroyed on *every* dialog open — Embla
  emits its first `select` before it has measured, an unmeasured carousel reports snap 0, and that 0 flowed
  into `setSkinId` and wrote "strava" over the user's choice with no interaction of their own. Fixed with a
  restore guard (`hasRestoredStoredSkin`) that ignores Embla's selects until it has actually landed on the
  remembered skin, re-attempted on `reInit`. Verified end-to-end: picked Beli, full reload + re-login, and
  the dialog reopened on Beli having jumped straight there.

  *Reduced motion.* Embla writes an inline `transform` from its own rAF loop, so it is reached by neither
  the app-root `<MotionConfig reducedMotion="user">` (Motion components only) nor `index.css`'s global
  reduced-motion reset (CSS only) — it would have animated regardless of the OS setting, which
  `.claude/rules/magicui-ui.md` forbids. Now `opts={{ duration: 0 }}` under `prefers-reduced-motion`.

  *Strava legibility without a backdrop — measured off real 1080×1920 exports, not the dialog preview.*
  The card background is transparent; each block of content keeps a scrim beneath just the type. Sampling
  the flat scrim from the PNG and compositing it over both extremes:

  | Element | over white | over black |
  |---|---|---|
  | Stat values (#ffffff) | **14.48:1** | 18.17:1 |
  | Muted labels (#cbd5e1) | **9.76:1** | 12.24:1 |
  | Sankey labels (#f8fafc) | **13.84:1** | 17.36:1 |
  | Ribbon vs scrim | 1.60:1 | 1.65:1 |

  Sanity-checked the helper against black-on-white = 21.00 first, because the FV6 pass had a contrast
  routine silently mis-parse `oklch()` and report 1.79 for everything.
  The scrim alpha is **0.92, and it is the Sankey that sets it, not the text** — text clears AA at ~0.72,
  but the ribbons are drawn by the shared chart at `strokeOpacity={0.35}`, so a light backdrop bleeding
  through cost them most of their separation (1.63:1 over black vs **1.23:1** over white at 0.72). At 0.92
  they are 1.60/1.65, i.e. the chart looks the same whatever it is shared onto. Done in the skin rather
  than by raising the chart's stroke opacity, which the dashboard (F37/F38) also renders. One alpha for
  every panel: a denser scrim behind only the chart read as two mismatched greys over a light background.
  Ribbon separation stays low in absolute terms, but it is unchanged from the opaque gradient and the
  ribbons carry nothing alone — nodes are full-opacity colour and `ChartDataTable` exposes every flow as
  text.

  *A11y.* Tab order Week/Month/Year/All/Custom → 3 dots → Next → Download → Share → Close (Previous absent
  only because correctly disabled on slide 1). Dots measure exactly 24×24 (WCAG 2.5.8) around an 8px
  visual dot. Arrow keys page correctly (right → Duolingo, left → Strava). Selection announces through its
  own polite region ("Recap design 2 of 3: Duolingo. One oversized headline stat over a two-tile grid."),
  kept separate from the existing export/fetch region so the two can't overwrite each other. The carousel
  stays mounted during a refetch — each slide swaps its own card for a same-sized placeholder — so changing
  the range can't drop focus.

  *Narrow width.* Checked at a 372px viewport via a same-origin iframe (`resize_window` is a no-op in this
  environment): no horizontal scroll (scrollWidth 357 ≤ clientWidth 372), dialog 325 / viewport 293, and
  the 270px card, control row and share row all fit.

  Baselines in `frontend/reference/`, all 1080×1920, colour type 6 (RGBA), all four corner alphas 0:

  | File | State | Bytes |
  |---|---|---|
  | `recap-baseline-strava.png` | Strava, all-time | 170,618 |
  | `recap-baseline-duolingo.png` | Duolingo, all-time | 977,351 |
  | `recap-baseline-beli.png` | Beli, all-time | 147,865 |
  | `recap-baseline-empty-total.png` | Strava, `total === 0` | 155,398 |
  | `recap-baseline-inflight-only.png` | Strava, `links.length === 0` | 158,335 |

  Each re-exported twice and SHA-256-compared: byte-identical, so future diffs are signal. `recap-baseline-all.png` deleted (superseded).

  *Trap worth repeating from F39:* exports only work with the Chrome window **visible**. Hidden, `toBlob`
  hung long enough to take the CDP channel down at 45s; visible, the same export is ~300–600ms. Also
  beware stubbing `window.fetch` to force a degenerate state — restoring the original does **not** refetch,
  and re-exporting against the stale state silently overwrote a good baseline with a placeholder render
  here. Change the range to force a real refetch and assert on the card's text before trusting the export.

- [x] **F49 — "Duolingo" skin: single dominant hero stat + secondary grid** (M)
  R12.7. Second recap skin, informed by the [Duolingo Year-in-Review reference](https://mobbin.com/screens/81b67776-4a5d-40d9-860e-9b3b4122357a): one clearly dominant stat
  (Applications sent) rendered oversized at the top, the remaining stats (rejection rate, interviews)
  arranged in a compact grid below it, opaque colored card background (unlike the Strava skin —
  transparency is Strava-only), same logo/date-range footer treatment reused from the existing shell so
  the three skins don't each reinvent that piece.
  Acceptance: renders correctly inside the F48 selector and exports cleanly at 1080×1920 with its own
  reference PNG; shares the same underlying recap data as the other two skins (no skin-specific data
  fetching).
  Depends on: F48.

  **Done 2026-09-03.** `recap-skins/duolingo-skin.tsx`. Took the reference's *hierarchy* — one figure big
  enough to be the whole point of the card, everything else deliberately secondary — not its palette or
  mascot art; the card is painted in the app's own teal accent family (F27) rather than Duolingo's blue.
  Applications sent renders at 80px (sized against a four-digit value so a busy year can't wrap the one
  element the skin is built around), with Interviews and Rejection rate demoted to a two-tile grid of light
  tiles beneath. Opaque background, as F48 scoped transparency to Strava alone, so it needs no scrim.
  Reuses the shared `RecapFooter`, per this task's requirement that the three skins not each reinvent it.

  First pass left the hero panel reading as a number stranded in empty space — the reference pairs its
  figure with a one-line claim, so this now shows the payload's own `headline` beneath the caption. That
  needed no new data: `headline` was already on the recap response and already spoken by the dialog's live
  region. No skin-specific fetching — every skin receives only `RecapSkinProps`, which carries the one
  payload and nothing else, so the constraint is enforced by the type rather than by convention.
  Exports at 1080×1920 RGBA, deterministic across two runs; baseline `recap-baseline-duolingo.png`
  (977,351 bytes — much larger than the other two because the card is a full-bleed gradient rather than
  mostly flat colour or transparency).

- [x] **F50 — "Beli" skin: ranked-stat layout, and Download/Share button styling** (M)
  R12.7. Third recap skin, informed by the [Beli monthly-recap reference](https://mobbin.com/screens/7fe2981e-cefd-4a7a-8e57-61ab97fb8e7f): a ranked-list-style presentation
  of the stats, opaque card background. Also gives the dialog's existing Download/Share buttons a visual
  treatment nodding to Beli's bottom share-icon row — styling only; **no custom per-app share buttons** are
  added, since `navigator.share()` already hands the OS's own app-icon sheet on mobile, and a hand-rolled
  row can't reliably deep-link into specific apps from a plain web share call the way a native sheet does.
  Acceptance: renders correctly inside the F48 selector and exports cleanly at 1080×1920 with its own
  reference PNG; Download/Share styling changes don't alter `handleDownload`/`handleShare` logic, only
  their presentation.
  Depends on: F48.

  **Done 2026-09-03.** `recap-skins/beli-skin.tsx`. Warm paper card — deliberately the light one of the
  three, which gives the selector a real choice at a glance and also demonstrates the export is genuinely
  theme-independent (it stays paper-coloured with the app in dark mode). Heavy display headline
  (`"{period_label} in applications"`), a pair of label-above-number stat columns, then the ranked list
  that gives this skin its reason to exist.

  *The ranking is real data, not a re-arrangement of the same three figures.* It comes from
  `status_breakdown`, already on the `GET /dashboard/recap` payload — a different projection of the same
  response, not a second request, which is what this task's "no skin-specific data fetching" acceptance
  asks for. Zero-count statuses are dropped (an outcome nobody reached shouldn't hold a rank), the rest
  ordered by count, capped at 5.

  Took two passes to get the list right in a 9:16 frame. Bunched under the stat columns it left the bottom
  third of the card empty; spread with `justify-between` each hairline sat tucked under its own row above a
  void, reading as an underline rather than a separator. Each row is now an equal-height band (`flex-1`)
  with centred text, which puts the rules at even intervals and lets a sparse list still read as a list.
  Contrast checked against this skin's own fixed background (#fdf4e9): headline #c2381c at 4.97:1, stat
  numbers and rows #14425a at 9.83:1, muted labels #4a5b66 at 6.48:1 — all past AA. (The initial coral was
  #e8492b at 3.56:1, which only passed as large text; darkened rather than relying on the size exemption.)

  *Download/Share (styling only).* Centred row of icon-over-label actions with 44px circular targets,
  nodding to the reference's bottom share row. `handleDownload`/`handleShare`, the `supportsShare` feature
  gate and the disabled conditions are untouched — the diff is class names and markup around the existing
  calls. Deliberately **not** per-app share buttons: `navigator.share()` already hands the OS its own
  app-icon sheet on mobile, and a hand-rolled row can't reliably deep-link into those apps from a plain web
  share call. Both actions verified still working end-to-end (the export announcements read back
  "Recap image downloaded as jtracks-recap-all-strava.png").
  Baseline `recap-baseline-beli.png`, 1080×1920 RGBA, 147,865 bytes, deterministic across two runs.

## Milestone FV9: Public landing page (delivery stage 4 — R10)

> Largest new surface in V2.1, and the PRD sequences it fourth for two concrete reasons: it must be built
> in the final palette (R11), and its product visual reuses the restructured Sankey/recap (R10.4 + R12).
> Building it earlier means building it twice. Q1 is resolved — a genuine public marketing page, routing
> option B. **F40 is a repo-wide change, not a new-file change**: R10.1 calls it "a repo-wide find, not a
> single file," and it is.

- [x] **F40 — Move the authenticated app under `/app`** (M)
  R10.1, confirmed approach B. `/` becomes unconditionally public; the board becomes `/app`, plus
  `/app/analytics` and `/app/profile`. `/login` and `/signup` stay top-level, because a visitor reaches
  them from the public landing page before authenticating. Every touch point, all of which hardcode bare
  paths today:
  - `frontend/src/App.tsx` — the `<Route index>` / `analytics` / `profile` block nested under `AppLayout`
    gains the `/app` prefix.
  - `frontend/src/components/ProtectedRoute.tsx` — `ProtectedRoute`'s unauthenticated redirect stays
    `/login` (explicitly unchanged per R10.1); `GuestRoute`'s `<Navigate to="/" replace />` becomes
    `/app`, or an already-signed-in user hitting `/login` gets bounced to the marketing page instead of
    their board.
  - `frontend/src/components/login-form.tsx` — `?? "/"` in
    `const redirectTo = (location.state as { from?: Location } | null)?.from?.pathname ?? "/"` becomes
    `?? "/app"` (it feeds both `navigate(redirectTo, { replace: true })` call sites).
  - `frontend/src/components/signup-form.tsx` — both `navigate("/", { replace: true })` calls become
    `/app`.
  - `frontend/src/components/layout/AppLayout.tsx` — `NAV_LINKS`'s `{ to: "/", label: "Tracker" }`, and
    the `ROUTE_TITLES` map keyed by `"/"` / `"/analytics"` / `"/profile"`, which feeds the route-change
    screen-reader announcement (a stale key silently degrades it to "Page — navigated"). `handleLogout`'s
    `navigate("/login")` is unchanged. The logo lockup is not currently a link — if F43 makes it one,
    point it deliberately.
  Grep `src/` (including `src/mocks/`) for any surviving bare `"/"`, `"/analytics"` or `"/profile"` before
  calling this done.
  Acceptance: signing in lands on `/app`; deep-linking to `/app/analytics` while logged out redirects to
  `/login` and returns to `/app/analytics` after signing in; an authenticated user visiting `/login` lands
  on `/app`; the route-change announcement still names the right page on all three app routes; no bare-path
  navigation survives; `tsc -b` and `npm run lint` clean.
  Depends on: none within FV9 — but do it **before F41**, which needs `/` free.
  **Done 2026-09-08.** `App.tsx`, `ProtectedRoute.tsx`, `login-form.tsx`, `signup-form.tsx`,
  `layout/AppLayout.tsx`. `path="app"` sits on the layout route rather than being repeated across three
  children, so the prefix exists in exactly one place.

  *One thing the task's file list didn't predict.* `NavLink` marks a link active when the location
  equals its path **or is a descendant of it**, so an un-`end`ed `/app` lights up "Tracker" on
  `/app/analytics` and `/app/profile` too. The pre-F40 `to="/"` never had this problem — the descendant
  test requires a `/` separator immediately after the prefix, which the root path can never produce — so
  this is work the prefix created, not a latent bug. `NAV_LINKS` now carries an `end` flag, true only on
  the index link, passed to both the desktop and the mobile `NavLink`.

  *Verified by real render, not by reading.* An SSR harness (built with `vite build --ssr`, then
  deleted) rendered `<App />` inside `MemoryRouter` with a stubbed `AuthContext`, at every route and in
  both auth states:

  | Route | user | Rendered | Active nav link |
  |---|---|---|---|
  | `/app` | signed in | `AppLayout` + Applications, 12,000 B | `Tracker` — exactly one `aria-current="page"` |
  | `/app/analytics` | signed in | `AppLayout` + Analytics, 18,173 B | `Analytics` |
  | `/app/profile` | signed in | `AppLayout` + Settings, 15,720 B | `Profile` |
  | `/app/analytics` | signed out | 0 B — `ProtectedRoute` took its `Navigate to="/login"` branch | — |
  | `/login` | signed out | LoginPage, 7,696 B | — |
  | `/login` | signed in | 0 B — `GuestRoute` took its `Navigate to="/app"` branch | — |

  Every rendered nav emitted exactly `/app`, `/app/analytics`, `/app/profile`, and exactly one
  `aria-current="page"` on the correct link at each route — the `end` fix observed rather than argued.
  `ROUTE_TITLES`' three keys are those same three pathnames, so the route-change announcement still
  names the page; a stale key degrades it to "Page — navigated" with no error, which is why this was
  checked against rendered hrefs rather than assumed.

  *What is reasoned, not observed.* Effects don't run under `renderToString`, so the table above
  observes the **guard decision**, not where the redirect lands. "Signing in lands on `/app`", "returns
  to `/app/analytics` after signing in" and "an authenticated user visiting `/login` lands on `/app`"
  rest on single unambiguous lines (`?? "/app"` in `login-form.tsx`, `<Navigate to="/app" replace />` in
  `GuestRoute`) read rather than driven in a browser.

  Grepped `src/` **including `src/mocks/`** for every `navigate(`, `<Navigate`, `Link to=`, `NavLink`
  and `href="/`. The only surviving bare `"/"` is `mocks/handlers/autofill.ts`'s
  `parsed.pathname.split("/")` — URL parsing, not routing. `tsc -b` clean; `oxlint` reports 19 warnings,
  all pre-existing `only-export-components`, none in a file touched here.

  **Follow-up verification in a real browser (independent pass), and one defect it caught.** The
  three criteria left as "reasoned" above were then driven for real against a mocked dev server
  (`VITE_ENABLE_MOCKS=true`, port 5181, MSW fixture credentials). Two passed as argued. One did not:

  > **Deep-linking to `/app/analytics` while logged out returned to `/app`, not `/app/analytics`.**

  `/login` renders *inside* `GuestRoute`, so the moment a successful sign-in sets `user`, that guard
  re-renders and its `<Navigate to="/app" replace />` runs — beating `login-form`'s own
  `navigate(redirectTo)`. The value the form computed from `location.state.from` was discarded every
  time, so the return trip this acceptance criterion asks for never worked. History state was
  confirmed intact (`{usr:{from:{pathname:"/app/analytics"}}}`), which is what ruled out the form's
  own logic and pointed at the guard.

  The race **predates F40** — before it, `GuestRoute` and the form's fallback were both `"/"`, so the
  two agreeing on the wrong answer looked like the right one — but F40's acceptance requires the
  return trip, so it is fixed here rather than inherited: `GuestRoute` now reads the same `from`
  state `ProtectedRoute` writes, and falls back to `/app` only when there is none.

  Re-verified after the fix, all observed in-browser rather than argued:

  | Criterion | Result |
  |---|---|
  | Deep-link `/app/analytics` logged out → `/login` → sign in | lands `/app/analytics`, `h1` "Analytics" |
  | Plain sign-in, no `from` state | lands `/app` |
  | Authenticated visitor to `/login` | bounced to `/app` |
  | Route-change announcement, all three routes | "Applications/Analytics/Settings — navigated" — no stale-key degradation |
  | `end` flag / nav active state | exactly one `aria-current="page"`, correct link, on each of the three routes |

  Note for whoever tests this next: the *authenticated visitor to `/login`* case cannot be reached by
  a full page reload under the dev mock — the access token is in memory (F19) and the mock's
  refresh-cookie limitation means a reload lands logged out. It has to be exercised client-side,
  after signing in, or against the real backend.

- [x] **F41 — Public landing route that does no authenticated work** (M)
  R10.2. Add `frontend/src/routes/LandingPage.tsx` at `/`, declared in `App.tsx` **outside** both
  `ProtectedRoute` and `GuestRoute` so it renders identically whether or not the visitor is signed in —
  that stable-URL-while-signed-in property is the entire rationale for choosing routing option B. Three
  things it must not do:
  - **Not mount `ApplicationsProvider`.** It currently wraps `ProtectedRoute` in `App.tsx` and fires
    `GET /applications` from a `useEffect` on mount (`lib/applications-context.tsx`).
  - **Not call any authenticated endpoint at all.**
  - **Not block render on the boot-time `POST /auth/refresh` (R7.6).** `AuthProvider` sits above the
    router in `main.tsx` and holds `isLoading: true` until `hydrate()`'s refresh + `GET /auth/me` settle;
    `ProtectedRoute` and `GuestRoute` both gate on that. The landing route must paint immediately and must
    not read `isLoading` as a render gate. (The refresh call itself still fires — that's `AuthProvider`'s
    job and outside R10.2's scope; what's forbidden is the landing *render* depending on it.)
  Acceptance: logged out, load `/` with the network panel open — the page paints and **no**
  `/applications`, `/dashboard/*` or `/settings` request is made (a stated V2.1 success metric); logged
  in, `/` still shows the landing page and does not redirect to `/app`; with the network throttled, the
  landing page renders fully before `/auth/refresh` resolves.
  Depends on: F40

  **Done 2026-09-08.** `routes/LandingPage.tsx`, declared in `App.tsx` as a `path="/"` sibling of both
  guarded branches — not under `GuestRoute` (which would bounce a signed-in visitor to `/app`), not
  under `ProtectedRoute`, and not under the `ApplicationsProvider` wrapper, which is attached to the
  protected `<Route element>` and so is not an ancestor of `/` at all. The component never imports
  `useAuth`, so there is no `isLoading` to gate on.

  *Two of the three acceptance criteria are observed.* The same SSR harness rendered `/` in four auth
  states — signed out/settled, signed in/settled, signed out with `isLoading: true`, signed in with
  `isLoading: true` — and returned **byte-identical 19,453-byte HTML** in all four, carrying
  `<h1>Know exactly where your job search stalls.</h1>` and no `Loading...` gate. That covers "logged
  in, `/` still shows the landing page and does not redirect to `/app`" and "renders fully before
  `/auth/refresh` resolves" directly: both guards render a literal `Loading...` div while `isLoading`,
  and it never appeared.

  *The network criterion is verified statically, and that is a real gap.* No browser tooling was
  available this session, so "load `/` with the network panel open" was **not** performed. What was done
  instead: a script walked the landing route's entire transitive import graph — 24 modules — and
  grepped each for `fetch(`, `apiClient`, `useAuth`, `useApplicationsContext`, `useDashboardStats`,
  `useRecap`, `ApplicationsProvider` and `isLoading`. Every hit is prose in a doc comment (`useTheme.ts`
  citing `useAuth`'s shape; this page's own rule comment; `types/api.ts` and `demo-data.ts` naming
  `src/mocks/` in order to forbid it). No module in the graph is capable of issuing a request. Combined
  with the route structure above that is a strong argument — but it is an argument, not an observation,
  and deserves a browser spot-check when one is at hand.

  **That spot-check has since been performed, and the criterion passes.** Chrome, production
  `vite preview` build, network recording started before the load of `/`. The complete request list:

  ```
  GET  /                              200
  GET  /assets/index-<hash>.js        200
  GET  /assets/index-<hash>.css       200
  GET  /assets/LandingPage-<hash>.js  200
  POST http://localhost:8000/auth/refresh   (pending)
  OPTIONS http://localhost:8000/auth/refresh (pending)
  ```

  No `/applications`, no `/dashboard/*`, no `/settings` — the stated V2.1 success metric, observed.
  The `POST /auth/refresh` is `AuthProvider`'s boot refresh, which this task explicitly permits
  ("the refresh call itself still fires — that's `AuthProvider`'s job"); it was still `pending` while
  the page was fully painted and interactive, which is the "renders before `/auth/refresh` resolves"
  criterion observed as well rather than inferred from the absence of a `Loading...` div. Signed in,
  `/` was also confirmed live to render the landing page rather than redirect to `/app`.

- [x] **F42 — Hard-coded demo data and the product visual** (M)
  R10.2 + R10.4. Define the demo data in the landing page's own module (e.g.
  `routes/landing/demo-data.ts`), typed against the real `Sankey` / `DashboardRecap` types in
  `src/types/api.ts` — never a fetch, never the MSW handlers (which don't run in production anyway), never
  another user's shape of data. The numbers must satisfy the same invariants the real payload does or the
  chart renders something the product never would: all six non-`saved` nodes present including zero-value
  ones, links with `value: 0` omitted, and `applied→interviewing_oa === interviewing_oa + offer + failed`
  per the V2 shared contract above.
  Render the **actual** `SankeyChart` (and/or `RecapCard`) against it rather than a screenshot, so the
  landing page cannot drift from the product (R10.4). Both are already free of auth dependencies —
  `SankeyChart` takes a plain `data` prop, `RecapCard` a plain `recap` prop — so this shouldn't require
  contortion. If it turns out to, R10.4 permits a static asset fallback, but the regeneration obligation
  must then be written into the component's own file, not just recorded in a task.
  `RecapCard` renders its own dark gradient background and is deliberately theme-independent (R11.4) —
  check it doesn't look stranded on a light landing section. A deliberate framing treatment around it is
  fine; making the card follow `.dark` is not.
  **Design references (Mobbin), per PRD R10.3:** funnel/flow presentation from
  [Amplitude's funnel dashboard](https://mobbin.com/screens/6c9ff58e-4bfa-4587-830e-bf121f7012f0) and
  [Mixpanel's flow diagram](https://mobbin.com/screens/cc657e26-9efb-49ae-a0fb-f54a3c5dde50); the
  shareable-recap emphasis from
  [Spotify Wrapped's shareable card](https://mobbin.com/screens/6b681412-559a-4fbf-af3e-1e97b4207e84)
  (portrait stat card + explicit Share action) and
  [Polarsteps' shareable stats card](https://mobbin.com/screens/cca74022-8ef8-4b95-83a6-c968b545d5e4)
  (dark stat card with Download/Share actions). Extract layout/framing direction only, per
  `.claude/rules/mobbin-ui.md`'s handoff rule — don't copy either verbatim.
  Acceptance: the product visual is a live render of the real component; changing a demo link value
  visibly changes the rendered chart; nothing in the landing module imports from `src/mocks/`; the visual
  is legible at 375px and in both themes.
  Depends on: F41, F39 (the restructured chart is what gets shown)
  **Done 2026-09-08.** `routes/landing/demo-data.ts` plus the product-visual section of
  `routes/LandingPage.tsx`.

  *The task text was stale and the difference mattered.* It says "`RecapCard` renders its own dark
  gradient background." As of F48–F50 it is a dispatcher over three skins, one of which
  (`strava-skin.tsx`) has a **transparent** background. Dropped onto a landing section that skin would
  composite onto whatever sits behind it — the "looks stranded" risk the task warns about, in a new
  form. **Chose `skin="beli"`**: opaque, so it composites onto nothing, and its warm paper palette
  belongs to neither theme, which is what an exported image actually is. Duolingo is opaque too, but it
  is painted in the app's own teal accent (F27), so it would read as more page chrome rather than as an
  artefact the product made. The card stays theme-independent — nothing here makes it follow `.dark`.
  The framing treatment the task permits is a bordered `bg-muted` inset, taken from the Polarsteps
  reference's card-on-a-sheet, which gives the cream card a defined edge in light mode where it would
  otherwise float.

  *Rendered both visuals, not one.* The section is a 12-column grid: `SankeyChart` at `lg:col-span-7`
  and the recap card at `lg:col-span-5`, each in a titled card with a subtitle naming its sample data
  (the Mixpanel dashboard-embed framing). They answer different questions — the flow is the analytical
  story the Amplitude/Mixpanel references are about, the card is the shareable artefact the
  Spotify-Wrapped/Polarsteps references are about — and the layout has room for both side by side.

  *Invariants are enforced by construction, not by hand.* The hand-authored data is per-status counts;
  `buildDemoSankey` derives all six nodes and every link from them and filters `value: 0` links out, so
  `applied->interviewing_oa === interviewing_oa + offer + failed` cannot be broken by editing a number.
  An `import.meta.env.DEV`-gated assertion re-checks all three rules at module load anyway, guarding the
  one remaining risk (a future edit to the derivation itself); it is stripped from production builds.
  Two separate cohorts: all-time (128) behind the flow, one month (34) behind the card — reusing the
  all-time totals under a card labelled "This month" would be the landing page telling a story the
  product wouldn't. Nothing under `src/routes/landing/` imports from `src/mocks/`; the one non-type
  import is `STATUS_LABEL` from `components/StatusBadge`, deliberately, so the demo cannot show a status
  name the product doesn't use.

  *Live render observed.* An SSR harness rendered the real `SankeyChart` against `DEMO_SANKEY` at a
  fixed width. Node labels came back as `["Applied (128 · 42 in flight)", "Interviewing / OA (9)",
  "Rejected (41)", "Ghosted (27)", "Offer (3)", "Failed Interview/OA (6)"]`, and the component's own
  `ChartDataTable` emitted `Applied -> Interviewing / OA  18` — that is 9 + 3 + 6, the contract
  equality, coming out of the real component rather than out of the fixture. Mutating one demo link
  (`applied->ghosted`, 27 -> 3) and re-rendering the same component changed the output: `Ghosted (3)`,
  shortfall `42 in flight` -> `66 in flight`, HTML differs. That is "changing a demo link value visibly
  changes the rendered chart" observed.

  *Not observed:* legibility at 375px and in both themes. The chart's width comes from a
  `ResizeObserver`, which never fires under `renderToString`, so the narrow render was reasoned from
  measurements rather than seen — see F44 for those numbers and for the two layout changes they forced.

  **Follow-up verification in a real browser (independent pass), and one defect it caught.** Both
  visuals were then loaded in Chrome against a production `vite preview` build, in both themes and at
  a real 375px layout viewport. The Sankey and the recap card both render live with the demo numbers,
  and the Beli card sits legibly on its inset panel in light mode (the framing treatment doing exactly
  the job it was chosen for — cream on white would have floated). But at desktop width:

  > **The pipeline card was 614px tall around a 220px chart — 318px of measured dead space, over half
  > the card empty.**

  The two cards share a grid row and the recap column sets its height (a fixed 480px card plus
  framing), while the chart stayed pinned at the size that suits narrow widths. The grid stretches
  both columns to the taller one, so the funnel sat in the top third of its card with a void beneath —
  the same failure mode F50's Beli list hit, in a different place, and on the flagship visual of the
  marketing page.

  Fixed by letting the chart's height track the layout instead of being a constant: 500px from `lg`
  up, which is exactly where `lg:grid-cols-12` creates the second column and therefore the
  stretching, and 220px below it, where the grid is a single column, each card is content-sized, and
  F15/F36's narrow-width legibility work is calibrated. A media query rather than CSS because
  `SankeyChart` takes a numeric `height` prop — it draws an SVG, it does not lay one out.

  Measured after the fix: dead space 318px → 38px, matching the recap column's own 53px, with no
  label collisions at the larger size (the extra height separates the `Offer` / `Failed Interview/OA`
  labels that sat closest together). At 375px the chart is unchanged and the page still reports zero
  overflowing elements.

- [x] **F43 — Landing sections: hero, feature trio, footer, and the landing theme control** (M)
  R10.3 (the four-section layout is `[unconfirmed]` in the PRD — treat it as the working proposal and
  confirm the *copy* with the user rather than re-planning the structure). Top to bottom: hero (product
  lockup, one-line value proposition, one-sentence subhead, primary CTA → `/signup`, secondary CTA →
  `/login`), F42's product visual, a feature trio (auto-ghosting after a configurable threshold; funnel
  analytics that separate pre- from post-interview failure; the shareable Stories-format recap), and a
  footer (logo lockup, a link into the app, minimal legal/attribution).
  Copy discipline: no section may make a claim the product does not do, and the feature copy must match
  shipped V2 behavior — in particular **"Failed Interview/OA" must not be softened to "Failed" in
  marketing copy either** (R10.3, and the V2 shared contract above).
  This also closes out R11.1's second half: place F26's exported theme control in the landing header. Use
  shadcn primitives for anything interactive (`Button` with a router `Link` for the CTAs); MagicUI comes
  later in F45, not here.
  **Design references (Mobbin), per PRD R10.3:** hero from
  [Linear](https://mobbin.com/screens/b7c17da1-eac4-4a8d-b7e9-2b8d6ef30f66) (restrained, product-first,
  single confident headline); feature trio from
  [incident.io](https://mobbin.com/sites/sections/0e8ee7bc-4aa3-4f1b-805f-89117f5d5d68) (dark-mode
  3-column icon/heading/description, single accent color); footer from
  [Visitors](https://mobbin.com/sites/sections/17c6b36b-7e35-4efa-8000-9c5fdf472dc3) (minimal: logo, a
  couple of link columns, plain legal text). Extract layout/spacing/hierarchy direction only, per
  `.claude/rules/mobbin-ui.md`'s handoff rule — build with shadcn primitives, not copied markup.
  Acceptance: a visitor can state what jTracks does from the hero alone and reach `/signup` in one click
  (a stated success metric); every feature claim maps to a shipped behavior; no shortened status label
  anywhere on the page; the theme control works on `/` and its choice carries into `/app`.
  Depends on: F41, F42, F26
  **Done 2026-09-08.** All four sections in `routes/LandingPage.tsx`, structure exactly as proposed —
  the task said to confirm copy, not to re-plan the layout, so the layout wasn't re-planned. The
  product visual is F42's section, carrying both visuals.

  *References confirmed before taking direction from them.* Each named Mobbin URL was re-fetched and the
  returned image actually looked at, not inferred from `app_name`. Linear's hero came back as expected
  (one oversized two-line headline, one small subhead, product visual immediately beneath, CTAs in the
  top nav) and the hero follows that restraint. Visitors' footer came back as a short prose column plus
  narrow link columns in small muted type, which is the shape used here. **incident.io's section is not
  literally a 3-column grid** as the task describes it — it is three stacked icon/heading/description
  rows in a left column beside a product image. Took what the task was actually after (bordered icon
  tile, bold heading, muted body, one accent colour used sparingly) and laid it out as the trio the task
  asks for: three columns at `md`, stacked below. **Mixpanel's `cc657e26-...` never surfaced** across
  three separate searches; other Mixpanel Flows screens did, and the framing direction was taken from
  [`22fd2eb0-...`](https://mobbin.com/screens/22fd2eb0-af19-4efe-80f7-6af3d4f42d94) — a flow chart
  embedded in a dashboard as a titled card with a subtitle and explanatory text, which is the pattern
  both product-visual cards use. Flagging the substitution rather than claiming the named screen.

  *Copy discipline.* Every feature claim is annotated in the source with the code that backs it
  (`SettingsPage`'s ghost-days field; the separate `rejected`/`failed` statuses and Sankey sinks;
  `recap-dialog.tsx`'s 270x480-at-`pixelRatio: 4` export over the full range set, three skins, Download
  always and Share gated on `navigator.share`). Grepping the rendered HTML for `Failed[^<]*` returns two
  matches and both are the full **"Failed Interview/OA"** — the label is never softened, including
  inside the recap card's own ranked-outcomes list. **The copy itself is awaiting user confirmation**
  and was surfaced verbatim in the session report; it is a draft, not a sign-off.

  *Theme control.* F26's exported `ThemeToggle` is placed in the landing header unchanged.
  `ThemeProvider` sits above `BrowserRouter` in `main.tsx` and persists to the single `jtracks_theme`
  key, so the choice made on `/` is the same provider state `/app` reads — verified by reading the
  provider, not by clicking through in a browser.

  *One deliberate responsive omission.* "Log in" is hidden below `sm` in the header; see F44 for the
  measurement that forced it. Both remaining `/login` entry points (hero secondary CTA, footer) sit
  above the fold on a phone. The header lockup is **not** a link (it would point at the page you are
  already on); the footer lockup **is**, and points at `/app` — F40 flagged that call as F43's to make.

- [x] **F44 — Landing accessibility, 375px responsiveness, metadata, and bundle isolation** (M)
  R10.5, R10.6, and the PRD's Bundle-cost NFR. This is the first page a screen-reader user or a crawler
  will ever see and it does not get a lower bar than the app.
  - **Landmarks and headings:** real `<header>` / `<main>` / `<footer>`, exactly one `<h1>`, no skipped
    heading levels, every CTA reachable and labeled. The app's skip link lives in `AppLayout`, which the
    landing route does not render — decide deliberately whether `/` needs its own.
  - **375px:** legible and unclipped, no horizontal scroll
    (`document.documentElement.scrollWidth === innerWidth`), verified in a real narrow layout viewport.
  - **Metadata (R10.6):** a real `<title>` and description meta tag for the landing route.
    `frontend/index.html` currently carries only a bare `<title>jTracks</title>` and no description.
    Route-scoped title handling is fine. Nothing beyond title + description — no OG image generation, no
    sitemap, no structured data (Non-goals).
  - **Bundle:** route-level code-split the landing page (`React.lazy` + `Suspense` on the `/` route) so its
    decorative dependencies stay out of the authenticated app's critical path and vice versa. Confirm
    against a real `vite build` chunk listing, not by assumption.
  Acceptance: axe clean on `/` in both themes; correct landmark and heading outline; no horizontal scroll
  at 375px; `<title>` and description present; `vite build` shows the landing page in its own chunk that
  the `/app` entry does not pull in.
  Depends on: F43

  **Done 2026-09-08.** `routes/LandingPage.tsx`, `hooks/useDocumentMetadata.ts`, `index.html`,
  `App.tsx`.

  *Landmarks and headings — observed.* Server-rendered the page and read the outline out of the real
  HTML rather than off the JSX:

  ```
  header
  main    id="landing-main"
  section aria-labelledby="hero-heading"
  H1      "Know exactly where your job search stalls."
  section aria-labelledby="visual-heading"
  H2      "One search, two views"
  H3      "Pipeline flow"     H3 "Shareable recap"
  section aria-labelledby="features-heading"
  H2      "Three things jTracks does for you"
  H3      "Ghosting handled for you"
  H3      "A funnel that separates the two ways you lose"
  H3      "A recap worth posting"
  footer
  nav     aria-label="Footer"
  H2      "Product"
  ```

  Exactly one `<h1>`, no skipped levels, real `<header>`/`<main>`/`<footer>` elements, every section
  labelled by its own heading. `SankeyChart` contributes its `sr-only` `<table>`/`<caption>` fallback,
  so the funnel is readable to a screen reader here exactly as it is in-app. **`/` gets its own skip
  link** — the deliberate call the task asks for: `AppLayout`'s isn't rendered on this route, and the
  header puts five focusable controls ahead of the content, so it earns one; same markup and same
  visually-hidden-until-focused treatment as the app's.

  *375px — reasoned, and it changed the build.* No browser was available, so this was measured on paper
  rather than driven, and the measurement found a real defect: wordmark ~83px + theme group 92px +
  "Log in" ~62px + "Get started" ~88px + gaps + `px-4` = **~385px**, i.e. a horizontal scroll at 375px
  on the one page R13.1 most obviously applies to. Fixed the way F33 fixed `AppLayout`'s cluster — hide
  one control at the narrow end (`hidden sm:inline-flex` on "Log in"), bringing it to ~315px — plus
  `flex-wrap` on the header row as a standing safety net so a future label change wraps instead of
  scrolling. The recap card is a fixed 270px, so its inset panel drops to `px-2` below `sm`, giving the
  card ~291px of room instead of ~279px. **Still unverified in a real narrow viewport**, and the layout
  has no margin below roughly 358px.

  *axe in both themes — not verified, but one real contrast defect was caught anyway.* No axe run was
  performed; every colour on the page is a token from `index.css` (the recap card's fixed literals are
  its own documented, theme-independent exception) and the interactive controls are unmodified
  shadcn/Radix primitives already swept in both themes under F29 — but that is inheritance, not a clean
  axe report on this URL, so treat it as open.

  The one defect found came from reading the project's own record rather than from a tool: the hero
  eyebrow was first drafted as `text-primary`, following the incident.io reference's accent-coloured
  line. `docs/decisions/magicui-conventions.md` measures `--primary` as body text at **3.44:1** in light
  — under the 4.5:1 floor — and says outright to flag it "before either gets used." That eyebrow would
  have been the app's first live instance. Changed to `text-muted-foreground`; the accent still carries
  the page through the primary CTAs (5.75:1) and the `aria-hidden` icons (3:1 non-text floor). The
  conventions doc's F27 flag has been updated with the outcome and with the fact that the underlying gap
  — `--primary` needing a darker light-mode value — is still unfixed.

  *Metadata — observed.* `index.html` carries the real title and description, because `/` is the
  crawlable entry point and a crawler that doesn't run JS sees only that file;
  `useDocumentMetadata.ts` re-applies the same pair on mount and restores the previous values on unmount
  so client-side movement between `/` and `/app` stays correct. Served the production build with
  `vite preview` on port 5180 (`--strictPort`; 5173 and 8000 deliberately untouched, re-checked with
  `netstat` after shutdown) and fetched `/`: `status=200`, with
  `<title>jTracks — see where your job search stalls</title>` and the `<meta name="description">` both
  present in the delivered bytes. Nothing beyond title + description was added.

  *Bundle — observed against a real chunk listing.* `React.lazy` + `Suspense` on the `/` route only.
  `npm run build`:

  ```
  dist/index.html                          2.55 kB | gzip:   1.29 kB
  dist/assets/index-CTFXgTOA.css          90.43 kB | gzip:  15.72 kB
  dist/assets/LandingPage-CVwL485W.js      9.55 kB | gzip:   3.29 kB
  dist/assets/index-Ck57Lb5U.js        1,137.54 kB | gzip: 353.58 kB
  ```

  Checked the emitted bytes rather than trusting the file name. `index.html` links only
  `index-Ck57Lb5U.js` and the CSS — no `modulepreload` for the landing chunk. The app entry's only
  reference to it is a dynamic `(0,b.lazy)(()=>...import("./LandingPage-CVwL485W.js"),[])` with an empty
  preload list, and grepping the app entry for three landing-only strings ("Know exactly where your job
  search stalls", "Three things jTracks does for you", "One search, two views") returns **0** for each
  while the landing chunk returns **1** for each. `LandingPage-*.js` statically imports only
  `./index-*.js`. So the `/app` entry does not pull the landing page in.

  *Known bundle caveat.* The landing chunk is small because `SankeyChart`, `RecapCard` and the `ui/`
  primitives live in the shared entry — correct, since the app uses them too. But `sankey-chart.tsx`
  imports `STATUS_BREAKDOWN_COLORS` from `status-breakdown-chart.tsx`, which pulls in `ui/chart.tsx` and
  hence **Recharts**, for one colour map. That costs the `/app` entry nothing (Recharts is already on
  its critical path) but it is dead weight for a visitor on `/`. Fixing it means moving that constant
  out of F28's file, which is outside this milestone — logged here rather than done.

  **Follow-up verification in a real browser (independent pass).** The two criteria left unverified
  above were then driven in Chrome against a production `vite preview` build:

  | Criterion | Result |
  |---|---|
  | axe clean on `/`, light theme | **0 violations** (axe-core 4.10.2, full document) |
  | axe clean on `/`, dark theme | **0 violations** |
  | No horizontal scroll at 375px | `scrollWidth 360 === clientWidth 360` at `innerWidth 375`, **0** elements extending past the viewport, measured in a real 375px layout viewport |
  | Recap card fits at 375px | rendered at its exact 270px, right edge at 315px — 60px of margin |
  | `<title>` + description delivered | present in the bytes served for `/` |

  Landmark and heading outline re-confirmed live: one `<h1>`, `h1 → h2 → h3` with no skipped level,
  real `<header>`/`<main>`/`<footer>`, and a skip link (`#landing-main`) — the task left that call
  open and it was taken. The six controls that render with empty text content are the Sankey's
  keyboard-reachable node buttons (F38); all six carry real accessible names ("Applied: 128
  applications, 42 still in flight"), which is why axe passes rather than flagging 4.1.2.

  *The bundle caveat above is narrower than the real gap.* Recharts is dead weight for a `/` visitor,
  but so is the entire authenticated app: `index.html` loads the 1.1 MB entry chunk as its only
  module script, and that chunk was confirmed to contain `aria-sort` (the applications table),
  `jtracks_recap_skin` (the recap dialog) and `Add application`. The acceptance criterion as written
  — "the landing page in its own chunk that the `/app` entry does not pull in" — genuinely passes,
  and that direction is what the criterion tests. The other direction does not hold: this task's own
  rationale asks for the split to work "**and vice versa**," and a landing visitor still downloads
  every app route. The cause is that every other route in `App.tsx` is statically imported, so
  `React.lazy` on `/` alone cannot separate them. Fixing it means code-splitting the authenticated
  routes too, which changes the app's own loading behaviour and needs its own verification — out of
  scope here, recorded so it is a decision rather than an oversight.

## Milestone FV10: Motion on the new surfaces & conventions upkeep (delivery stage 5 — R14.2, R14.3, R14.5)

> Last stage by design, per the PRD's delivery sequence — motion gets applied to finished layouts rather
> than reworked as they change. R14.1's motion pass is **already shipped and is not scope-to-build here**;
> it is the set of conventions the tasks below inherit. R14.6's candidates (offer celebration,
> status-change transitions, chart draw-on) are **not approved** and are not scheduled — see the
> out-of-scope list at the top of this section.

- [x] **F45 — Apply the existing motion conventions to the landing page** (M)
  R14.2 + R14.3 + R14.4. Use the values already fixed in `docs/decisions/magicui-conventions.md` rather
  than inventing per-page numbers: `BlurFade` at `duration 0.4s / easeOut / offset 6px / blur 6px /
  direction down`, a `0.08s` stagger step **between sibling groups** (never within a group), `BorderBeam`
  at `duration 8s`, `NumberTicker`'s default spring. `AnalyticsPage.tsx`'s
  `ENTRANCE_STAGGER_SECONDS = 0.08` constant is the existing precedent to match.
  R14.3 is the rule most likely to break here: **at most one continuous/looping accent visible per view.**
  A marketing page is exactly where this will feel wrong in the moment; the conventions doc is the
  tiebreaker, not taste. Entrance animations are exempt (they run once and settle); continuous ones are
  rationed to one.
  Any MagicUI component not already in the approved table (`border-beam`, `number-ticker`, `blur-fade`)
  goes through the full workflow first: `searchRegistryItems` → `getRegistryItem(name, { includeSource:
  true })` to read the real source → `npx shadcn@latest add @magicui/<name>` from `frontend/`. Never
  hand-copy MCP source; never edit the installed `components/ui/*.tsx` to hardcode colors — override
  MagicUI's non-neutral defaults at the call site with this project's tokens (F27's new accent included).
  Everything must sit under `main.tsx`'s `<MotionConfig reducedMotion="user">` (R14.4) — no portal outside
  that tree, no library that ignores it.
  Acceptance: no more than one continuous accent visible on the landing page at a time; every timing value
  matches the conventions doc; with the OS reduced-motion setting on, nothing on `/` animates; any newly
  installed component was added via the CLI and ships none of MagicUI's hardcoded default colors.
  Depends on: F44

  **Done 2026-09-08.** `frontend/src/routes/LandingPage.tsx` — the only file changed. No component
  was installed and no `components/ui/*.tsx` was touched: everything this page needed
  (`blur-fade`, `border-beam`) is already in the conventions doc's approved table, so the
  discovery → inspect → CLI-install workflow had nothing new to run through. The *installed*
  sources were still read before wiring anything, rather than the API being recalled from memory.

  *Every number came from the doc, not from this page.*

  | Value used | Where it comes from |
  |---|---|
  | `BlurFade` `duration 0.4s` / `easeOut` / `offset 6px` / `blur 6px` / `direction down` | Component defaults, left untouched — the doc's "Only `delay` is customized per group." Not one of them is passed explicitly. |
  | `ENTRANCE_STAGGER_SECONDS = 0.08`, group *N* at `0.08 * N` → 0 / 0.08 / 0.16 / 0.24s | "A fixed `0.08s` step between sibling `BlurFade` groups." The constant is a copy of `AnalyticsPage.tsx`'s, same name and same doc comment intent, so the two pages read as one convention. |
  | `BorderBeam duration={24}` | "Continuous accent (`BorderBeam`). `duration=24s`." Shipped at `8` to match the doc's then-current value; both were changed to **24** on 2026-09-09 (see the follow-up note at the end of F46). |
  | `colorFrom="var(--foreground)"`, `colorTo="var(--muted-foreground)"` | The theming section's literal example, and identical to `stat-tile.tsx`/`signup-form.tsx`'s call sites. MagicUI's `#ffaa40`/`#9c40ff` defaults are overridden at the call site; the installed file was not edited. |
  | No `NumberTicker` anywhere | Its "Not for" column. This page has no KPI tile — its only figures are caption text ("128 applications") and numbers inside `RecapCard`, which F35 puts off-limits regardless. |

  One detail worth recording because it lives in the component rather than in our numbers:
  `blur-fade.tsx` adds a fixed `0.04` to whatever `delay` it is given
  (`transition={{ delay: 0.04 + delay, ... }}`), so the four groups actually start at
  0.04 / 0.12 / 0.20 / 0.28s and the cascade has fully settled by ~0.68s. That offset applies
  identically on Analytics and every other page using `BlurFade`, so it is a constant, not a
  divergence — but it is the kind of thing that looks like a bug in a future measurement if it
  isn't written down.

  *Four groups, and nothing staggered inside one.* Hero, product visual, feature trio, footer —
  exactly the four sibling groups the conventions doc's landing row told F45 to expect, each
  wrapped whole. The trio is one `BlurFade`, not three; the hero's eyebrow/headline/subhead/CTA
  pair arrive together; the footer's two columns arrive together. The `<header>` is deliberately
  **not** a fifth group: the page frame stays put while the content cascades into it.
  (`AppLayout`'s header does animate, but for a reason that doesn't transfer — there the header
  *is* the shell's own content and mounts once per session.)

  *The one continuous accent: the "Pipeline flow" card, and the two alternatives were rejected on
  the doc's terms rather than on taste.* R14.3 is the rule this task called out as most likely to
  break, so the reasoning is spelled out in the source too:
  - **The recap card beside it** — rejected because the two cards share one grid row, so a second
    beam would be a second continuous accent visible simultaneously. That is precisely the failure
    mode the rule exists to prevent, and it would be visible at every width (the two cards stack
    below `lg`, but both still sit in one viewport on a phone).
  - **The hero's primary CTA** — rejected on the approved-components table's own wording:
    `border-beam` is "not for" structural/interactive elements, being a decorative overlay and
    never a substitute for a real state indicator. Beaming the one control the page is trying to
    get clicked is exactly that mistake.
  - **The pipeline-flow card wins** because the doc reserves the beam for "the single most
    important element" in a view, and on `/` that is the visual the `<h1>`'s claim rests on ("Know
    exactly where your job search stalls"). It is also the wider column (`lg:col-span-7`) and the
    first read.

  *Mobbin was re-checked for this call rather than assumed.* Three landing sections were fetched
  and the images actually looked at — [Twenty](https://mobbin.com/sites/sections/abe261e4-d901-42f1-bea3-0a806e2d0669),
  [incident.io](https://mobbin.com/sites/sections/c11ccc48-4f3a-41ae-a89b-62155ee8b946) and
  [ClickUp](https://mobbin.com/sites/sections/8327bdfc-5c9d-4240-b4af-9431eebd0f9e). All three put
  the visual emphasis on the *product visual* (an app window, a phone panel, a board screenshot)
  rather than on the CTA, and incident.io splits its visual into a wide primary panel plus a
  narrower secondary one — the same 7/5 shape this page already had. That supports crowning the
  wider product panel and leaving the CTA plain. Nothing was copied; the references informed one
  emphasis decision, which is all a screenshot can inform about motion.

  *Structural care, so the animation doesn't quietly change the page it wraps.* `Card` needed
  `relative` for the beam's `absolute inset-0` overlay (same as `StatTile`/the auth cards), and
  `Card`'s own `overflow-hidden` + `rounded-xl` clip the beam to the border. `BlurFade` translates
  and blurs but never scales, so `SankeyChart`'s `ResizeObserver` (F36) measures the same content
  width during the entrance as after it. The footer wrapper is a plain `motion.div` with no
  className, so the `<footer>` landmark and the `min-h-screen` + `flex-1` sticky-footer layout are
  both unchanged.

  *Verified.* `npx tsc -b` clean; `npm run lint` exits 0 with only the pre-existing
  `only-export-components` warnings (none in this file). `npm run build` succeeded and F44's split
  still holds — `dist/assets/LandingPage-*.js` **9.55 kB → 9.83 kB** and the shared entry
  1,137.54 kB → 1,137.62 kB, i.e. the pass costs ~0.3 kB because `BlurFade`/`BorderBeam` already
  ship in the entry chunk for the other pages, so only the call sites are new. The file contains
  exactly one `<BorderBeam` element and four `<BlurFade delay=` elements (`grep -c`), which is the
  shape this task specifies.

  *Not verified — no browser tool was available this session, and F47 owns the matrix.* Stated
  plainly so it is re-checked rather than assumed:
  - **Nothing on `/` animates with OS reduced motion on** — reasoned, not observed. Both components
    animate via `motion.*` under `main.tsx`'s `<MotionConfig reducedMotion="user">` (the route is
    `React.lazy`-loaded inside `BrowserRouter`, which is inside that provider), and neither
    portals out of the tree. That is the same inheritance every other animated page relies on, but
    it has not been driven on this URL.
  - **That exactly one continuous accent is visible at any scroll position** — the page contains
    exactly one `BorderBeam` and no other looping accent, so "one visible" follows from "one
    exists"; not confirmed by looking.
  - **That 375px is still scroll-free.** The wrappers add no layout-affecting CSS (an unstyled
    `motion.div`; `filter`/`transform` don't change layout boxes), so F44's measured
    `scrollWidth 360 === clientWidth 360` should be untouched — should, not observed.
  - **How the beam reads on the pipeline card in dark mode**, and how the cascade feels at real
    speed. Both are judgement calls that need eyes on the page.

- [x] **F46 — Update the conventions doc and its per-page inventory** (S)
  R14.5 and the PRD's Documentation NFR — the doc is updated in the **same change** as the code, not
  after. Two parts to `docs/decisions/magicui-conventions.md`:
  - **Conventions.** Its "Theming — never ship MagicUI's hardcoded defaults" section currently opens by
    stating the project is fixed at `baseColor: "neutral"` and that "every existing color is grayscale
    (`oklch(... 0 0)`, zero chroma)" — false once F27 lands. Correct it, and confirm F29's accent-hue
    decision record is in place alongside it.
  - **Per-page inventory table.** Add a **Landing (`LandingPage.tsx`)** row, and revise any existing row
    whose usage changed — Analytics' is the likeliest, since FV8 restructures the Sankey card that its
    third `BlurFade` group wraps. The table's stated purpose is that a future session can check
    consistency instead of re-deriving it; a stale row costs more than a missing one.
  Acceptance: the doc contains no claim contradicted by the shipped code; the inventory has a row for
  every page using MagicUI, including the landing page; the theming section names the actual accent hue.
  Depends on: F45, F29

  **Follow-up (2026-09-09): `BorderBeam` duration is now 24s project-wide, replacing 8s.** F46's audit
  of the inventory table surfaced that `login-form.tsx` had shipped `duration={26}` since the original
  animation commit while every other call site passed 8; it was recorded as a deviation rather than
  silently changed. Resolving it went through three steps, and the middle one is the informative part:
  login was first aligned *down* to 8, which made the 8s pace obvious on a page you actually sit and
  type into — the beam reads as active and attention-seeking there, not ambient. The user chose 24
  (close to login's original 26), then extended it to every call site for uniformity.
  Shipped: `login-form.tsx`, `signup-form.tsx`, `stat-tile.tsx` and `LandingPage.tsx` all pass
  `duration={24}`; `docs/decisions/magicui-conventions.md` now documents 24 as *the* value in both its
  timing section and all four affected inventory rows, with no per-page exception left standing.
  Worth recording because it caused real confusion twice: `duration` is passed straight to Motion as
  the time for **one full lap** of the border (`ease: "linear"`, `repeat: Infinity`), so **a higher
  number is slower**. 8 was the fastest beam in the project, not the calmest.
  No behaviour outside the beam changed; `tsc -b` and lint stayed clean.

  **Done 2026-09-08.** `docs/decisions/magicui-conventions.md`, edited in the same change as F45's
  code rather than after it.

  *Theming section — the false claim is corrected and the hue is named.* The section now separates
  what is still true from what isn't, against the real files:
  - **Still true:** `frontend/components.json` does still set `baseColor: "neutral"`, and most of
    the palette (`--background`, `--foreground`, `--card`, `--muted`, `--border`, `--input`,
    `--secondary`, `--accent`, the `--sidebar-*` set apart from its primary/ring pair, and
    `--chart-1`..`--chart-5`) is still zero-chroma in both `:root` and `.dark`.
  - **No longer true:** the accent hue is named as shipped — **teal, `h = 195`** — with the values
    re-read from `frontend/src/index.css` at write time rather than copied from the doc's own
    older table: `--primary` `oklch(0.62 0.11 195)` / `oklch(0.75 0.11 195)`, `--ring`
    `oklch(0.60 0.10 195)` / `oklch(0.66 0.10 195)`, `--sidebar-primary`/`--sidebar-ring` the
    same, `--primary-foreground` near-black `oklch(0.145 0 0)` in both themes, and the status
    palette in `--status-*` as literal hexes.
  - **A third thing, found while checking:** the old sentence was already wrong before F27.
    `--destructive` has always been red (`oklch(0.577 0.245 27.325)`), shipped with shadcn's
    neutral base. Recorded, so "every existing color is grayscale" doesn't get re-derived from
    scratch and re-believed.
  - **F29's accent-hue decision record confirmed present** in the same file, immediately below:
    "Palette decision record (F27/F28)" (why teal, the two values contrast measurement forced,
    the contrast table) plus the "F29 live both-theme sweep" section and its independent
    in-browser re-measurement. The theming section now points at both by name.
  - One MagicUI-specific consequence added: the accent hue existing does **not** make it the right
    color for an accent component. All four `BorderBeam` call sites pass
    `var(--foreground)`/`var(--muted-foreground)`, never `var(--primary)` — a teal beam would
    compete with the primary CTAs and the teal focus ring instead of reading as ambient.

  *Every inventory row was checked against the code before being left alone.*

  | Row | Checked | Outcome |
  |---|---|---|
  | Analytics | `AnalyticsPage.tsx`, `stat-tile.tsx` | **Revised for FV8.** The third `BlurFade` still wraps the same "Pipeline flow" `Card`, but F36 dropped its fixed `width={343}` (the Sankey now self-measures via `ResizeObserver`) and F38 added `interactive` (focusable per-node buttons + `ChartDataTable`). Both are still safe under an entrance wrapper, and the row now says why instead of leaving the reader to re-derive it. |
  | Login | `login-form.tsx` | **Real discrepancy found.** The beam ships `duration={26}`, not the documented `8` — unchanged since the original animation commit, while Signup, `StatTile` and now the landing page all pass 8. Recorded in both the timing section and the row, and deliberately **not** silently "fixed": changing a shipped page's motion isn't F46's call to make in a doc pass. |
  | Signup | `signup-form.tsx` | Accurate — `BlurFade delay={0}`, `BorderBeam` with token colors, `cn("relative", className)` on the card. (Its beam read `duration={8}` at audit time; changed to **24** on 2026-09-09 along with every other call site.) |
  | Applications | `ApplicationsPage.tsx` | Accurate — one `BlurFade` around the header title/description only; toolbar and table still unwrapped. Unchanged. |
  | Settings | `SettingsPage.tsx` | Accurate — one `BlurFade` around the form `Card`, no ticker, no beam. Unchanged. |
  | Recap dialog | `recap-dialog.tsx`, `recap-skins/*` | Accurate and still correctly *empty*. The Embla carve-out is real and still in the code (`opts={prefersReducedMotion ? { duration: 0 } : undefined}`). Unchanged. |
  | App shell | `AppLayout.tsx` | Accurate — one `BlurFade` around the whole `<header>`, no beam. Unchanged. |
  | Landing | `LandingPage.tsx` | **Rewritten** from "None — deliberately, for now" to F45's actual shipment: four `BlurFade` groups with their delays, the single `BorderBeam` and why that element carried it, the two rejected alternatives, why there's no `NumberTicker`, that F35's rule still governs the `RecapCard` inside group 2, and the +0.28 kB bundle cost. |

  *One extra staleness fixed while in the file.* F29's live sweep table labels routes as `/`,
  `/analytics`, `/profile` — which FV9 moved (`/` is now the landing page; the app is under
  `/app`). The observed results weren't rewritten (it's a record of what was seen at the time); a
  footnote now maps the old labels onto today's routes.

  *Nothing here was verified in a browser, and nothing needed to be.* Every claim added or kept is
  a read of a real file (`index.css`, `components.json`, the eight component/route files above),
  and the contrast numbers are carried forward from F29's live sweep unchanged rather than
  re-measured — no browser was available this session.

- [x] **F47 — V2.1 close-out verification across the whole matrix** (M)
  PRD_V2_1.md's Success metrics and Non-functional requirements, run once as a single checkable pass after
  everything else lands — the *dark mode doubles the verification surface* and *a UI overhaul silently
  undoes an accessibility audit* risks both come due at exactly this point.
  The matrix: every route (`/`, `/login`, `/signup`, `/app`, `/app/analytics`, `/app/profile`) plus
  `ApplicationFormDialog`, `AutofillDialog`, `ConfirmAppliedDialog` and `RecapDialog` × light and dark ×
  375px and desktop. Per cell: no horizontal scrollbar, no contrast failure, no new axe violation relative
  to the pre-V2.1 baseline.
  Three global checks on top: with the OS reduced-motion setting on, **nothing animates anywhere,
  including the landing page**; the recap still exports to a clean 1080×1920 PNG with the Sankey fully
  rendered (re-run F39's diff at the end); and every V2 audit fix still holds — `aria-sort` on the `<th>`,
  the sortable-header naming pattern, the staleness warning's `role="img"` + visually-hidden duplicate,
  every `ChartDataTable` behind an `aria-hidden` chart, the route-change focus move and announcement, the
  skip link, and `ApplicationsPage`'s two polite live regions.
  Acceptance: a written result for every cell of the matrix, no unresolved failure, and any finding either
  fixed or recorded here as a known limitation with a reason — the same standard as the F21 and F24
  verification notes above.
  Depends on: F33, F39, F45, F46

  **Verification result (run in a real browser, 2026-09-09).** Every cell below was *observed*, not
  reasoned about. Method notes matter for anyone re-running this, because two of them changed the result:

  - **375px is a real 375px layout viewport**, via a same-origin iframe. `resize_window` reports success
    but does not constrain the viewport in this environment, so measuring the top-level window would have
    silently tested desktop twice.
  - **Two harness corrections were needed before the contrast numbers meant anything.** `BlurFade` leaves a
    permanent `filter: blur(0px)` on its wrapper, and `BorderBeam` renders a `pointer-events-none
    absolute inset-0` overlay across its whole card (measured 384x354 on the auth card). axe refuses to
    score text under either (`bgOverlap`), and *reports zero violations while having evaluated zero nodes* --
    which reads exactly like a pass. First run of `/login` scored **0 nodes**; neutralising the no-op blur
    and hiding the decorative beam took it to **10 nodes, 0 incomplete, 0 violations**. Both adjustments
    are visually no-ops. Any future re-run must assert the evaluated-node count, not just the violation
    count.

  **Matrix -- 6 routes x 2 themes x 2 widths (24 cells): all pass.** No horizontal scrollbar in any cell
  (`/` and `/app` report `scrollWidth 360 === clientWidth 360` at 375px, matching F44's figure), 0 axe
  violations (wcag2a/2aa/21a/21aa), 0 contrast violations with 0 incomplete on every authenticated route.

  **Matrix -- 4 dialogs x 2 themes x 2 widths (16 cells): all pass.** Each dialog was confirmed by title
  (`Add application`, `Paste a job link`, `Generate recap`, `Mark as applied?`) rather than assumed --
  an earlier run silently re-measured the first dialog four times because Escape did not close it, and
  the identical titles were the only thing that exposed it. All fit the viewport; no document-level
  horizontal scroll; 0 axe violations; 0 contrast violations.

  **Chart/skin text axe cannot auto-score, measured by hand instead:** the 6 Sankey labels on `/`
  (`bgOverlap` from ribbons passing beneath) measure **19.8:1 light / 17.18:1 dark**; Analytics' 13 SVG
  labels clear AA at their worst (**4.74:1 light / 6.94:1 dark**); RecapDialog's 10-11 incomplete nodes are
  all inside the Strava skin's translucent scrim panels and short numerals -- the same values F48 already
  measured over light and dark backdrops. Nothing here is recorded as a pass on axe's silence alone.

  **Global check 1 -- reduced motion: partially met, and the gap is inherited, not new.** With
  `prefers-reduced-motion` forced true before app boot, **all 28 distinct intermediate transform values
  disappear (28 -> 0)**: `main.tsx`'s `<MotionConfig reducedMotion="user">` is doing its job and no
  movement occurs anywhere. The 0.4s opacity+blur fade still runs (11 mid-animation frames, versus 11 with
  motion on). That is Motion's documented behaviour for `reducedMotion="user"` -- it suppresses transform
  and layout animation, deliberately keeping opacity, which carries no vestibular risk. So the literal
  wording of this task's criterion ("nothing animates anywhere") is not met, while its intent is. This is
  R14.1 behaviour shared by every animated surface in the app since the first motion pass; F45 did not
  introduce it. **Recorded as a known limitation, not fixed** -- changing it means overriding `BlurFade`
  per-call-site against the conventions doc's fixed values, which is a conventions decision, not a
  close-out fix.

  **Global check 2 -- recap export: pass, all three skins.** Each exports a clean **1080x1920** PNG with a
  fully transparent outer canvas (all four corner pixels alpha 0) and the Sankey rendered. F39's diff
  re-run against the stored baselines: **strava 0.016%**, **duolingo 0.015%**, **beli 0.015%** differing
  pixels (~330 px of text antialiasing on 2,073,600). One trap worth recording: the dialog opens on the
  **Week** range, which is empty in the mock dataset ("0 Applications sent"), and diffing that against the
  baseline yields a misleading **5.2%**. The baselines are **All-time** captures; match the range before
  concluding anything from a diff. Exports were captured in-page and the disk write blocked, so no files
  were added to the repo.

  **Global check 3 -- every V2 audit fix still holds (verified live, not grepped):** `aria-sort` present on
  all 5 sortable `<th>`s and cycling correctly (`none` -> `ascending` on click); the sortable-header naming
  pattern intact; the staleness warning keeps `role="img"` + its visually-hidden duplicate; both Analytics
  charts sit in wrappers carrying **`aria-hidden` and `inert`** with `sr-only` `ChartDataTable`s behind
  them; route change moves focus to `main[tabindex="-1"]#main-content` and announces ("Analytics —
  navigated"), with `aria-current="page"` on the active link; the skip link targets `#main-content`; and
  `ApplicationsPage`'s live regions fire for real ("19 of 19 applications shown, sorted by Company
  ascending."). `StatusSelect` also exposes `aria-label="Change status (currently Saved)"`.

  **No unresolved failure.** One known limitation recorded above (reduced-motion opacity), one
  documentation-worthy hazard for future runs (axe scoring silently defeated by `BlurFade`/`BorderBeam`).

## Milestone FV11: Pipeline board view, entry-flow/settings polish, and an analytics stat-tile nudge (R16)

> New scope, added via F34's resolution (see FV8) rather than the original PRD_V2_1.md draft — recorded
> as R16 there. Depends on FV6 (F27 accent hue, F28 status tokens) landing first, same reasoning FV7/FV8
> already use — build against the final palette once, not twice. Independent of FV7 and FV8 otherwise; no
> shared files besides the status color tokens/classes all three read from. Grounded in Mobbin references
> the user reviewed and curated directly, per area (R15.2's "research aid only" allowance — nothing
> installed, nothing shipped).

- [x] **F51 — Optional status-grouped board view for the Pipeline page** (L)
  R16.1. Informed by [Homerun's kanban pipeline](https://mobbin.com/screens/80dfe542-7c1b-4303-a449-b4f465d615fe)
  and [folk's pipeline board](https://mobbin.com/screens/a7d7dd46-1f6d-444b-b1c0-17681af33367). Add a
  board/kanban-style view as an alternate rendering of the same `applications` data
  `ApplicationsPage` already manages — a real user choice, not a replacement: a toggle (matching the
  shadcn segmented-control precedent `dashboard/date-range-control.tsx` already sets) between "Table" and
  "Board," defaulting to Table and **persisted** per user (a `jtracks_view_mode` `localStorage` key, same
  non-auth-material justification F25 already documents for its theme key) so the choice sticks across
  visits instead of resetting every load. Available at every width, including 375px — no breakpoint hides
  it.
  **Mobile/PWA scoping.** Board is exempt from FV7's no-horizontal-scroll guarantee: on narrow screens its
  columns lay out with `overflow-x-auto`, the same mechanism the table currently uses before FV7 removes
  it. This is an accepted, deliberate tradeoff because Board is opt-in — **Table is the only view FV7's
  scroll-free requirement applies to**; picking Board at 375px means picking a horizontally-scrolling
  multi-column layout, and that's fine. Don't try to make Board's columns reflow to avoid horizontal
  scroll at narrow widths — that's Table/card-list's job (F32), not Board's.
  **Bloat scoping.** Each status column gets a fixed `max-height` with its own independent vertical scroll
  (not one page-length scroll per column) and a live count in its header (e.g. "Interviewing (6)"). To
  keep a column with dozens/hundreds of applications from rendering every card into the DOM at once, each
  column initially renders a capped number of cards (a plain client-side slice, not a virtualization
  library — scope doesn't justify one yet) with a "Show N more" control to reveal the rest; no card is
  ever hidden from filtering/search, only from the initial render.
  Board mode groups applications into columns by status (using `ALL_STATUSES`/`STATUS_LABEL` from
  `StatusBadge.tsx`), one card per application showing company/title/location/date, with the existing
  `StatusSelect` as the only way to move an application between statuses — **no drag-and-drop** (the app's
  accessibility posture leans on keyboard/screen-reader support, and a real WAI-ARIA-compliant
  drag-and-drop reorder pattern is a substantial separate undertaking not justified here). Reuses
  `handleStatusChange`/`applyStatusChange` and the same two live regions (`actionStatus`, `tableStatus`)
  `ApplicationsPage` already has — verify both still fire correctly from board mode, don't assume. Column
  header colors come from FV6's `--status-*` tokens (F28), not new hardcoded values.
  Acceptance: toggle is present and keyboard-operable with a real accessible name/state at every width,
  including 375px; the chosen view survives a reload; at 375px, Board renders its columns with a working
  horizontal scroll (keyboard-reachable, not just touch/mouse-drag) while Table/card-list still shows zero
  horizontal scroll (FV7's guarantee is unaffected); board mode shows every application from
  `visibleApplications` in the correct column; status changes from the board use the identical code path
  as the table (verified by one shared handler, not two); a column with 100+ applications stays a fixed
  height with its own vertical scrollbar and a working "Show more," not an ever-growing page; empty
  columns render sanely; `tsc -b`/lint clean; axe reports no new violation.
  Depends on: F28, F30 (per-column status-class discipline).

  **Default view is now width-dependent (2026-09-09, user's call).** This task specified "defaulting to
  Table" above, on the reasoning that Board was an opt-in alternate rather than a replacement. The user
  asked to land on Board where there is room for it and Table where there isn't, so
  `hooks/useViewMode.ts` picks the starting view from `BOARD_DEFAULT_VIEWPORT_QUERY`
  (`(min-width: 1024px)` — about three 288px columns plus page padding). Recorded here rather than
  edited into the requirement above, so the original intent and the decision that overrode it both stay
  visible.
  **The width is read once, at mount, and deliberately never watched.** It is a bare `matchMedia` call
  inside `useState`'s lazy initializer, *not* `useMediaQuery` — that hook subscribes to `change` and
  re-renders, which would swap the view out from under someone who rotated a phone or dragged a window,
  losing their place mid-task. The user asked for width to affect the default only. There is a comment
  in the hook saying so; don't refactor it into `useMediaQuery`.
  Precedence is unchanged: a **stored** choice still beats the width default entirely
  (`readStoredViewMode`), so anyone who has already picked a view keeps it, and the default only ever
  applies to a viewer with no `jtracks_view_mode` value. Choosing a default does not write to storage,
  so it stays width-sensitive until an explicit pick.
  *Verified in a browser (2026-09-09).* Starting view by width, nothing stored: 375px → Table,
  768px → Table, 1023px → Table, **1024px → Board**, 1440px → Board — the threshold lands exactly where
  the query says. Stored choice wins both ways: `stored=table` at 1440px opens Table, `stored=board` at
  375px opens Board. Resize does **not** change the view, tested in both directions: loaded at 1440px on
  Board then resized to 375 → 800 → 1440 stayed Board throughout (with the media query flipping to
  `false` in between), and loaded at 375px on Table then grown to 1440px stayed Table.
  **Independent browser verification (2026-09-09) — one defect found and fixed.**

  **Defect: Board caused a second, page-level horizontal scrollbar.** Opening Board scrolled the *whole
  app* sideways — the header slid off-screen (measured `left: -505px`) leaving blank page beside the
  board, with two horizontal scrollbars stacked: the board's own (correct) and the document's (wrong).
  Reproduced at **both** 375px and 1536px, and in a top-level tab as well as an iframe, so not a harness
  artifact: `documentElement.scrollWidth` 2026 against a 1521px viewport, and `window.scrollTo(3000,0)`
  really moved `scrollX`.
  *Root cause,* isolated by hiding subtrees until the overflow disappeared: each card renders
  visually-hidden `<dt>` labels, and `sr-only` is `position: absolute`. An absolutely-positioned element
  is clipped by an ancestor's `overflow` **only when its containing block is inside that ancestor**. The
  scroller was `position: static`, so those 38 `<dt>`s resolved against a containing block outside it,
  escaped the `overflow-x-auto` clip, and stretched the document to the full 7-column strip. Hiding just
  those `<dt>`s dropped `scrollWidth` 2026 → 1536 (exactly the viewport), confirming them as the sole
  cause.
  *Fix:* one class — `relative` on the scroller in `applications-board.tsx`, making it the containing
  block for its own `sr-only` descendants. Re-measured after the fix: `docScrollWidth === clientWidth` in
  all 8 board cells, `scrollTo(3000,0)` leaves `scrollX` at 0, and the board's own scroll is unaffected
  (`scrollWidth 2088` vs `clientWidth 1105`). The `sr-only` labels are untouched, so nothing changed for
  screen readers. F51 exempts the *board* from FV7's no-scroll rule; it never exempted the page.

  **Everything else passed, observed rather than reasoned:**
  - **Toggle:** two native `<button>`s carrying `aria-pressed`, inside `role="group"` labelled
    "Application view", both `tabIndex 0` and enabled. Defaults to Table; nothing is written to
    `localStorage` until a choice is made.
  - **Persistence:** choosing Board writes `jtracks_view_mode: "board"` and a fresh load restores it
    (`Board: aria-pressed=true`, no `<table>` rendered).
  - **375px scroll contract, both halves:** Board's scroller reports `scrollWidth 2088 / clientWidth 328`,
    is focusable (`tabIndex 0`) and labelled "Application board, scrolls horizontally"; Table at the same
    width stays at `scrollWidth 360 === clientWidth 360` with **0** overflowing elements, so FV7's
    guarantee is intact.
  - **One shared handler, verified two ways:** source shows a single `handleStatusChange`/
    `applyStatusChange` pair passed by reference to all three renderings, and the board never calls
    `updateApplication`. Live: changing a card's status from the board announced
    "Globex moved to Rejected." in the `actionStatus` region while column counts updated in place
    (Applied 4→3, Rejected 3→4) — both live regions fire from board mode.
  - **100+ column, exercised with real data** (API response seeded to 149 applications, 134 in one
    column): renders 12 (`BOARD_INITIAL_CARD_LIMIT`), offers "Show 122 more" with the accessible name
    "Show 122 more Applied applications", and the column holds `max-height: 416px` with its own vertical
    scroll. After expanding, all 134 render and the column is *still* 416px (`scrollHeight` 20367) — the
    page neither grows nor scrolls sideways.
  - **axe:** 0 violations on Board at 375px and 1280px × light and dark; 0 contrast violations. The 6-12
    `incomplete` contrast nodes are the column headers (`elmPartiallyObscured` from the status accent
    bar); measured by hand instead of assumed — labels **19.8:1 light / 18.97:1 dark**, counts
    **4.74:1 / 7.66:1**, all clearing AA.
  - **F52/F53/F54 surfaces:** AutofillDialog, ApplicationFormDialog, Settings and Analytics all report 0
    axe violations and 0 contrast violations in both themes, with no page-level horizontal scroll.

  **Done 2026-09-09.** Three new files — `frontend/src/hooks/useViewMode.ts`,
  `frontend/src/components/board/applications-board.tsx`,
  `frontend/src/components/board/view-mode-toggle.tsx` — plus edits to
  `frontend/src/routes/ApplicationsPage.tsx` and one additive prop on
  `frontend/src/components/table/status-control.tsx`. `applications-table.tsx` and
  `applications-card-list.tsx` were **not** touched, so FV7's guarantees are untouched by
  construction, not by re-testing.

  *Mobbin, first.* Both references named in the task were pulled and actually looked at:
  [Homerun's kanban pipeline](https://mobbin.com/screens/80dfe542-7c1b-4303-a449-b4f465d615fe)
  (plain text column header + muted count, fixed-width columns, cards carrying a name, a muted
  secondary line and a small chip) and a
  [folk pipeline board](https://mobbin.com/screens/1f3db9ff-0daa-4c79-8468-0f29252295b4)
  (colored status chip *as* the column header, count beside it, cards that are a title plus a
  short stack of small icon+value metadata rows). What was extracted: header = label + count in
  one line with the status color carried by a small dedicated element rather than by the text
  itself; card = company/title on top, metadata rows below with leading icons, control at the
  bottom; columns fixed-width and never reflowing. What was not taken: folk's per-card avatars
  (this app has no per-application image), and both apps' drag-and-drop.

  *One shared handler, not two — the acceptance criterion, and how it is actually enforced.*
  `ApplicationsPage` still defines exactly one `handleStatusChange` and one `applyStatusChange`
  (grep confirms a single definition of each), and all three renderings now receive the *same
  function reference*:

  ```
  onStatusChange={handleStatusChange}   x3  (board, card list, table)
  ```

  The board does not call `updateApplication` and does not import
  `useApplicationsContext`'s mutation surface for status at all — its cards render the shared
  `StatusControl`, which is the same component the table cell and the card-list card render, so
  the chain is `StatusSelect` → `StatusControl`'s `onStatusChange` → `handleStatusChange` →
  (`ConfirmAppliedDialog` for `saved → applied`, else) `applyStatusChange`. That means both live
  regions fire from board mode for structural reasons rather than by duplication:
  `actionStatus` is written inside `applyStatusChange` ("Updating Acme…" → "Acme moved to
  Offer."), which the board reaches through the shared handler; `tableStatus` is written by a
  `useEffect` keyed on `visibleApplications.length` / `applications.length` / `sortKey` /
  `sortDirection`, none of which are view-mode-dependent, so a filter or a status change
  re-announces the count identically in either view. **Reasoned from the code path, not observed
  in a screen reader** — see the "not verified" list at the end.

  `ConfirmAppliedDialog`'s focus restore also keeps working for the same reason: `StatusControl`
  renders `StatusSelect` with `id={statusSelectId(application.id)}`, and `finalFocusRef` resolves
  that id lazily from the document. Exactly one of table/card-list/board is ever mounted (the
  view-mode branch sits *outside* the narrow-width `isCardLayout` branch), so the ids stay unique
  — the same duplicate-id trap F32 documents.

  *Persistence.* `jtracks_view_mode`, `"table" | "board"`, defaulting to `"table"`. The read is a
  `useState` initializer so a reload restores the choice on the first paint rather than swapping
  after mount, and both the read and the write are wrapped in `try/catch` exactly the way
  `useRecapSkin.ts` does — `localStorage` throws outright in some privacy modes, and a stored
  value can be junk, so an `isViewMode` type guard is what makes the fallback safe rather than
  rendering an unknown view. A failed write is swallowed: the choice still applies for the
  session, it just doesn't survive a reload.

  *The toggle.* Built as a literal copy of `dashboard/date-range-control.tsx`'s segmented-control
  pattern — `role="group"` + `aria-label="Application view"` wrapping `Button`s with
  `aria-pressed`, selected `variant="default"`, unselected `variant="outline"` — so it announces
  the same way as the range control a user already met on Analytics. It lives in the page header
  row, **outside** the `isLoading` branch and with no breakpoint conditions, so it is present at
  every width; at 375px it wraps under the description instead of disappearing.

  Two shadcn alternatives were fetched through the MCP server and rejected rather than assumed.
  `toggle-group` would have introduced a second, differently-announced segmented-control pattern
  (radio semantics) into an app that already has one, for no accessibility gain.
  `button-group` — actually installed via `npx shadcn@latest add @shadcn/button-group` and read —
  turns out to be only the joined-edges container around this identical markup, and it exports a
  `cva` variants object, which trips this repo's oxlint `only-export-components` rule. A new lint
  warning in vendored code for a border-radius change is a bad trade, so the file was removed
  again and the precedent followed directly.

  *Board is deliberately exempt from FV7.* The columns are `w-72 shrink-0` at every breakpoint and
  never reflow; the row is a single `overflow-x-auto` flex container. R16.1 is explicit that
  picking Board at 375px *is* picking a horizontally-scrolling layout, so no attempt was made to
  collapse it. That scroller is `role="region"` + `aria-label="Application board, scrolls
  horizontally"` + `tabIndex={0}` with an explicit `focus-visible:outline-ring` ring (matching
  `applications-table.tsx`'s bare-`<button>` `SortButton` precedent), which is what makes the
  scroll keyboard-reachable rather than mouse-drag/touch-only, and what satisfies axe's
  "scrollable region must have keyboard access" rule for the *empty* columns, which contain
  nothing focusable of their own.

  *Bloat scoping.* Each column's `<ul>` carries `max-h-[26rem] overflow-y-auto`, so the scroll is
  per-column rather than one page-length scroll, and the header/accent and "Show more" control
  stay pinned outside it. `BOARD_INITIAL_CARD_LIMIT = 12` caps the initial render as a plain
  `Array.prototype.slice` — no virtualization library, per R16.1: seven columns capped at 12 is
  ~84 cards worst case, the same order of magnitude the table already renders, and a windowed
  list would add both a dependency and a real a11y surface. Nothing is ever hidden from
  filtering/search: the slice happens *after* `visibleApplications` has been filtered, so a
  matching application always exists in its column, at worst behind "Show N more".

  The reveal control is a **toggle**, not a one-way "Show more" that unmounts on click. A control
  that disappears on activation drops focus to `<body>` — the same WCAG 2.4.3 failure
  `ConfirmAppliedDialog`'s `finalFocus` exists to avoid — so it flips to "Show fewer" and stays
  put, carrying `aria-expanded`. Its `aria-label` names the column ("Show 8 more Applied
  applications") because "Show 8 more" is ambiguous across seven simultaneous columns, and the
  label still *starts with* the visible text, so WCAG 2.5.3 Label in Name holds.

  *Column colors came from the token layer.* A local `STATUS_ACCENT_CLASSES` map in
  `applications-board.tsx` uses `bg-status-*`, the Tailwind utilities `index.css` already exposes
  from F28's `--status-*` tokens through `@theme inline` — so the dark-mode `interviewing_oa` /
  `offer` swap is picked up for free and no new hex was introduced. Confirmed in the *built* CSS,
  not just in source: all seven `.bg-status-*` rules are emitted into
  `dist/assets/index-*.css`. The map is deliberately **not** added beside `StatusBadge.tsx`'s
  three maps: those are Tailwind *palette* classes predating the token layer (a different kind of
  value), and exporting another object from that `.tsx` would add a sixth
  `only-export-components` warning to a file that already carries five. The bar is `aria-hidden`
  and every column also states its status as text plus a count, so nothing is conveyed by color
  alone (WCAG 1.4.1) — which matters, because the light-mode `interviewing_oa` / `offer` hexes
  sit in the sub-3:1 band this repo's conventions doc already records.

  *The live count is inside the heading.* `<h2>Applied <span>(12)</span></h2>` rather than a
  count floated beside it, so a screen-reader user navigating by heading hears the same count a
  sighted user reads. It derives from `applications.length` on every render, so it cannot
  disagree with the cards beneath it.

  *No drag-and-drop, as specified.* `StatusSelect` is the only way to move a card. Empty columns
  render a dashed "Nothing here yet." placeholder in the same idiom as the table's and card
  list's "No applications match your filters." row.

  *One deliberate shared-component edit.* `StatusControl` gained an optional `showBadge` prop
  (default `true`, so the table and card-list renderings are unchanged). The board passes
  `false`: the column heading already states the status and the select trigger's accessible name
  repeats it ("Change status (currently Applied)"), so the badge would be a third copy of the
  same word in a 288px column. This was chosen over duplicating `StatusControl`'s composition in
  the board, which is exactly the drift F30/F32 introduced it to prevent.

  *Gates.* `npx tsc -b` clean; `npm run lint` 0 errors and 19 `only-export-components` warnings —
  the pre-existing count, unchanged; `npm run build` succeeds.

  **Not verified — no browser was available to this session** (the agent had no
  browser-automation tool, and per the run's constraints no dev server was bound). Every claim
  below is reasoned from source and from the built CSS, and needs a real pass:
  keyboard operation of the toggle and of the board's horizontal scroller (arrow keys / Home /
  End once focused); the actual horizontal-scroll behaviour at 375px and the accompanying
  confirmation that Table/card-list still show *zero* horizontal scroll; that a reload restores
  the persisted view; that both live regions really announce from board mode; the fixed-height
  column with 100+ applications and its "Show more"; both themes; and axe.

- [x] **F52 — Visual polish pass on the add-application entry flow** (S)
  R16.2. Purely visual refinement of `autofill-dialog.tsx`'s paste-URL step (informed by the
  [Programa "Add product from URL" reference](https://mobbin.com/flows/26df0e89-6fe6-4ea2-b379-ff1349953586)
  — e.g. clearer in-progress state, iconography on the URL field) and
  the success/warning notice banner in `application-form-dialog.tsx`. Explicitly **not** adding a new
  intermediate preview screen — the existing two-step flow (paste → prefilled review form) already
  matches the reference pattern structurally, and a third step would duplicate validation/focus-management
  work the form dialog already does correctly. No field changes, no new dialog states.
  Acceptance: no change to `handleSubmit`/validation/focus-management logic in either file (diff should be
  class names and copy only); both dialogs still pass their existing a11y guarantees (notice
  `role="status"`, submitting live region, etc.).
  Depends on: F28 (notice banner's success/warning colors should use the final tokens).

  **Done 2026-09-09.** `frontend/src/components/applications/autofill-dialog.tsx` and
  `frontend/src/components/applications/application-form-dialog.tsx`. One component installed via
  the CLI for this task: `npx shadcn@latest add @shadcn/spinner`
  (`frontend/src/components/ui/spinner.tsx`).

  *Reference.* The
  [Programa "Add product from URL" flow](https://mobbin.com/flows/26df0e89-6fe6-4ea2-b379-ff1349953586)
  was pulled and looked at screen by screen. Its paste step is: a short expectation-setting
  paragraph, a single URL input, and a bordered info note ("Check retrieved information — data
  accuracy depends on the site you linked; review before using it") above the Cancel/Add pair.
  That note is the thing worth stealing, and this dialog already *had* the sentence — it was just
  rendered as a loose caption. It is now the reference's bordered, icon-led note. **The third
  step Programa doesn't have and this task explicitly forbids — an intermediate preview screen —
  was not added.**

  *What actually changed, and what deliberately did not.* `handleSubmit`, `reset`,
  `handleOpenChange`, every branch of the success/unsupported/failed/threw logic, the
  `openCreateForm` payloads, the notice `tone`/`message` strings, the `role="status"` regions,
  the `sr-only` submitting live region, and the input's `id` / `type` / `value` / `onChange` /
  `disabled` / `aria-describedby` / `autoFocus` / `required` are all untouched. The diff is class
  names, two decorative icons and a spinner.

  | Change | Detail |
  |---|---|
  | Iconography on the URL field | A leading `Link2`, `aria-hidden` + `pointer-events-none`, absolutely positioned with `pl-8` on the `Input` — built exactly the way `applications-toolbar.tsx`'s search field already does it. |
  | In-progress state | `<Spinner aria-hidden="true" />` inside the Continue button beside its existing "Fetching job details…" label, and the same treatment on the form dialog's submit button so both halves of the entry flow show progress identically. |
  | The hint | Same text, same `id`, same `aria-describedby` target; promoted to a bordered `bg-muted/40` note with a leading `Info` icon. |
  | Notice banner | `flex items-start gap-2`, slightly taller padding, and a tone icon (`CheckCircle2` / `AlertTriangle`) leading the message, so the outcome is legible before the sentence is read. |

  *Why `InputGroup` was not used, even though it is the "right" registry item.* It was installed
  via the CLI and read: `InputGroupAddon` attaches an `onClick` focus helper to a plain `<div>`,
  which trips this repo's oxlint `jsx-a11y(click-events-have-key-events)` rule as a hard **error**
  in vendored code. Vendoring a ~200-line component to break the lint gate, for one leading icon
  the project already has an established pattern for, is the wrong trade — the file was removed
  and the toolbar's precedent followed instead. That also keeps one adorned-input pattern in the
  codebase rather than two.

  *On "the notice banner's colors should use the final tokens" (the Depends-on line).* Checked
  and deliberately left as-is. The emerald/warning pair is not re-pointed at `--status-*`: those
  tokens carry *pipeline status* meaning, so a successful parse would start reading as "Offer".
  The existing values were already measured against the final F27/F28 palette in F29's live
  both-theme sweep (success 9.14:1 light / 14.88:1 dark; warning 8.73:1 / 15.42:1) and pass
  comfortably in both themes, so "final tokens" is satisfied by having re-checked against the
  landed palette rather than by changing hues. The reasoning is recorded in a source comment so a
  future session doesn't re-litigate it.

  *Spinner a11y.* The installed `Spinner` ships its own `role="status" aria-label="Loading"`. Both
  call sites pass `aria-hidden="true"`, which takes it out of the accessibility tree: the button
  label already changes to "Fetching job details…"/"Saving…" and there is already a polite live
  region announcing the wait, so an un-hidden spinner would be a third simultaneous announcement.
  (`role={undefined}` was tried first and rejected — oxlint's `jsx-a11y(aria-role)` can't
  statically evaluate it and flags it as an error.)

  *Gates.* `tsc -b` clean; lint 0 errors / 19 pre-existing warnings; build succeeds.
  **Not verified:** no browser this session — the dialogs were not opened, so the in-progress
  spinner, the note's appearance in both themes, and axe on either dialog are unobserved.

- [x] **F53 — Settings page layout refinement** (S)
  R16.3. Visual-only refinement of `SettingsPage.tsx`'s single-field card, informed by the
  [Fresha gift-card settings](https://mobbin.com/screens/20a4b62e-609b-40b6-a17a-4b08e38c9fd5) and
  [Optimal Workshop settings form](https://mobbin.com/screens/db6e47ed-6dd4-4211-8be5-4125b44c96b5)
  references' label+helper-text+value rhythm — tighter vertical rhythm, clearer visual grouping
  of the field and its description. Scoped to what the page actually has today (one setting); does not
  invent new settings or sections.
  Acceptance: existing `aria-describedby` wiring, live "Settings saved." region, and validation behavior
  unchanged; visual-only diff.
  Depends on: F28.

  **Done 2026-09-09.** `frontend/src/routes/SettingsPage.tsx` — the only file changed.

  *Reference.* The task's two links were supplemented with a live
  `search_screens` pass for the same pattern; the useful ones actually looked at were
  [Plain's help-center field settings](https://mobbin.com/screens/246327c9-933f-48aa-ab7b-6e06e6e5a958)
  and [Wix's form General settings](https://mobbin.com/screens/8162dbed-183a-432d-b78b-22f4e3674573).
  Both show the same rhythm: a titled card section, a rule between the title and the body, the
  field as a *narrow* control rather than a full-bleed one, its helper text directly beneath it in
  a smaller size, and the save action sitting in its own separated strip at the bottom of the card
  rather than floating under the input.

  *Applied, scoped to the one setting this page actually has.* No new settings, no new sections.

  | Before | After |
  |---|---|
  | `Card className="max-w-md"` → `CardContent` → `form` | `Card className="max-w-xl"` → `form` → `CardHeader className="border-b"` (`CardTitle` "Ghosting") + `CardContent` + `CardFooter` |
  | Full-width number input | `max-w-28 tabular-nums` — it holds a small integer, so a full-bleed field read as an unbounded text box |
  | Helper text at `text-sm`, full width | `text-xs max-w-prose`, so label → control → helper reads as one descending column |
  | Save + status text in an `mt-4` row under the field | `CardFooter` (the shadcn `Card` primitive's own bordered, `bg-muted/50` strip), status left, Save right |

  *What did not change.* `handleSubmit` and its `Number(value)` / `Number.isInteger` /
  `parsed <= 0` validation, the `requestAnimationFrame` focus restore to
  `settings-ghost-days-default`, both `useEffect`s, the exact `aria-describedby` strings
  (`"settings-ghost-days-hint"` / `"settings-ghost-days-hint settings-ghost-days-error"`), the
  hint and error `id`s, `data-invalid`/`aria-invalid`, and the always-mounted
  `role="status" aria-live="polite"` region and its content expression. The one structural move
  is that `<form>` now wraps the card interior instead of sitting inside `CardContent`, purely so
  the submit control can live in `CardFooter` — the submit button is still inside the same form,
  so submission behaviour is identical. The live region moved to the opposite end of the footer
  row; it is the same element with the same role, `aria-live` and content.

  *Gates.* `tsc -b` clean; lint 0 errors / 19 pre-existing warnings; build succeeds.
  **Not verified:** the page was not opened in a browser this session — the new header rule,
  footer strip, both themes, and the visual position of the "Settings saved." text are unobserved,
  as is a real invalid-submit run confirming focus still lands on the input.

- [x] **F54 — Stat-tile visual nudge toward the Monarch reference's card treatment** (S)
  R16.4. Modest visual refinement of `stat-tile.tsx`'s card styling (border weight, padding, typographic
  treatment), informed specifically by the [Monarch stat-card reference](https://mobbin.com/screens/92c2b32c-20a0-4487-9b6c-3f32cb464893) — not its Sankey, which this task
  doesn't touch. Existing `NumberTicker`/`BorderBeam` usage and the "one continuous accent per view" rule
  (`docs/decisions/magicui-conventions.md`) are unchanged; this is a styling pass on the card shell only.
  Acceptance: no change to `numericValue`/`suffix`/`decimalPlaces`/`accent` prop behavior; visual diff
  only; conventions doc's inventory table updated if the accent's visual presentation changes at all.
  Depends on: F28.

  **Done 2026-09-09.** `frontend/src/components/dashboard/stat-tile.tsx`, plus the conventions-doc
  inventory update the acceptance calls for (`docs/decisions/magicui-conventions.md`).
  `AnalyticsPage.tsx` was not touched — no caller changed, because no prop changed.

  *Reference.* The
  [Monarch stat-card row](https://mobbin.com/screens/585aac8c-1cfd-4515-9080-0f036ace3c13) was
  pulled and looked at (its Sankey, which the task excludes, was ignored). The card treatment
  there is: generous padding, a thin quiet border, the figure large and typographically dominant,
  and the caption sitting *beneath* it in small uppercase letter-spaced muted type.

  | Change | Value |
  |---|---|
  | Padding | `[--card-spacing:--spacing(5)]` on the `Card` — 16px → 20px, driving the primitive's own padding/gap variable rather than overriding `px-*`/`py-*` |
  | Caption | `text-xs font-medium tracking-wide uppercase text-muted-foreground` (was `text-sm`) |
  | Figure | `leading-none tracking-tight` added; size left at `text-2xl` |
  | Order | `flex-col-reverse` on the `<dl>` so the figure reads first |

  *Two deliberate restraints.* (1) The figure was **not** enlarged to `text-3xl` despite the
  reference. Analytics' stat row is `lg:grid-cols-5`, so the tiles are at their *narrowest*
  exactly at the breakpoint where five sit side by side (~190px each), and "12.5 days" at 30px
  would have been the first thing to wrap. (2) The `Card`'s `ring-1 ring-foreground/10` was left
  alone rather than swapped for a heavier border — it is the project-wide card treatment, and
  changing it here only would have made these five tiles the odd ones out.

  *`flex-col-reverse` and the `<dl>`.* The DOM keeps the required `<dt>`-then-`<dd>` sequence, so
  a screen reader still hears "Total Applications, 128" rather than a bare number; only the visual
  order flips. Nothing inside the tile is focusable, so no tab order is affected.

  *Nothing about the animation wiring moved.* `numericValue` / `suffix` / `decimalPlaces` /
  `accent` behave identically, `isAnimated` is the same `typeof … === "number" && Number.isFinite`
  test, `NumberTicker` keeps `value` / `decimalPlaces ?? 0` / `className="text-foreground
  dark:text-foreground"`, and the `BorderBeam` line is byte-for-byte unchanged —
  `duration={24}` (today's project-wide value), `colorFrom="var(--foreground)"`,
  `colorTo="var(--muted-foreground)"`, still gated on `accent`, still with `relative` on the
  `Card`. The one thing the acceptance asks to be honest about: the beam traces the card's border,
  and the card is now 4px roomier on each side, so the beam's path is *marginally* longer at the
  same 24s lap. That is a change to the accent's presentation, however small, so the conventions
  doc's Analytics inventory row records it rather than leaving the doc silently stale.

  *Gates.* `tsc -b` clean; lint 0 errors / 19 pre-existing warnings; build succeeds, and the
  `[--card-spacing:--spacing(5)]` and `flex-col-reverse` rules are present in the emitted CSS.
  **Not verified:** `/app/analytics` was not opened this session — the new tile proportions, the
  beam running around the roomier card, the five-across `lg` layout with real values, and both
  themes are all unobserved.

## Milestone FV12: Typeface overhaul (delivery stage 7 — R17)

> New scope, added after R11–R13 shipped and R10/R12 were substantially built — recorded as R17 in
> `PRD_V2_1.md`. **Nothing in this milestone is an open question**: R17.1's Display+Text pairing and role
> table, R17.2's weight set, R17.3's self-hosting/token discipline and R17.5's `font-display: swap`
> default are all confirmed in the PRD, including the verified finding that Hedvig Letters Sans is a
> **single-weight (400)** family. So there is no spike here, only execution and verification.
> Per R17.6 this is a token swap applied retroactively across finished surfaces, **not new layout work** —
> no page gets re-laid-out. It is sequenced last because every surface it touches (FV9's landing page,
> FV8's recap skins, FV7's table/card list, FV11's board and stat tiles) must already exist to be
> verified against.
>
> The hard gate is the recap export (R17.4, extending R12.5): a web font that hasn't finished loading when
> `toBlob` fires bakes the browser's fallback silently into the PNG. **F60 owns that and is this
> milestone's highest-risk task** — treat it the way F35/F39/F48 were treated, with a real export and a
> real diff, not an assumption.

- [x] **F55 — Add the self-hosted font files and their licenses to the repo** (S)
  R17.2 + R17.3. The fonts are **self-hosted and user-supplied** — never a runtime
  `fonts.googleapis.com` `<link>`/`@import`, which would pull a third-party request into the critical path
  and violate R10's landing bundle-cost NFR. Exactly five files, matching R17.2's resolved weight set:
  `HedvigLettersSans-Regular.woff2` (400, its only weight), and Roboto at 400 / 500 / 600 / 700 as four
  discrete static files. **No italics** (R17.2: Hedvig's 400 italic exists but is used nowhere in R17.1's
  mapping), **no 900** (Roboto Black is not sourced — this matters in F59), and no dedicated monospace
  family (the only `font-mono` reference is internal to shadcn's `components/ui/chart.tsx` and stays).
  **Where they live is a call this task makes, because the repo has no convention yet**: `frontend/public/`
  holds only `favicon.svg`, `icons.svg` and `mockServiceWorker.js`, and `frontend/src/assets/` doesn't
  exist. Put them in a new `frontend/src/assets/fonts/`, referenced from `index.css` by a relative `url()`.
  Assets under `src/` are fingerprinted by Vite and a wrong path **fails the build**; a `public/` path is
  copied verbatim, so a typo becomes a silent 404 that falls back to the system stack — the same class of
  invisible failure R17.4 warns about, but on every page instead of just the export.
  Keep the license texts alongside the files (R17.2's "good practice"): SIL OFL 1.1 for Hedvig Letters
  Sans, Apache License 2.0 for Roboto, plus a short `README.md` naming both specimen URLs and exactly
  which variant/subset was downloaded, so a future re-download reproduces the same metrics. Neither
  license requires an in-app attribution string, so none is added.
  Acceptance: exactly those five `.woff2` files exist at `frontend/src/assets/fonts/` and nothing else —
  no italic, no unused weight; both license texts and the README are present;
  `grep -ri "fonts.googleapis\|fonts.gstatic" frontend/` returns **nothing**, including `index.html`;
  each file's byte size is recorded for F62's record (the landing bundle NFR cares about the total).
  Depends on: none — but it needs font files **the user supplies**, so it can block on something no agent
  can resolve. Start it first.
  **Done 2026-09-10.** Fetched all five `.woff2` files directly (Google Fonts, no auth needed) —
  `curl` with a modern-browser `User-Agent` against `fonts.googleapis.com/css2`, per-weight. One
  deviation worth recording: a **combined** Roboto query (`wght@400;500;600;700`) returns a distinct
  `@font-face` block per weight but all four point at the *same* underlying `latin`-subset file URL
  (Regular's metrics) — downloading that once and renaming it four ways would have silently shipped
  four identical files. Caught by diffing the four resulting URLs; fixed by re-fetching each Roboto
  weight with its **own single-weight query**, which does return four genuinely distinct files
  (confirmed by differing byte sizes: 21,884 / 22,200 / 22,240 / 22,240). Hedvig's single-weight
  finding was confirmed exactly as predicted (600 alone -> 400 Bad Request; combined request
  collapses to 400). `OFL.txt` pulled from the Hedvig Letters Sans Google Fonts repo entry (has the
  correct copyright header baked in already) rather than scraped from the redesigned
  openfontlicense.org site, which no longer serves the bare license text at the old URL.
  `LICENSE-Apache-2.0.txt` fetched verbatim from apache.org. `README.md` added recording both
  specimen URLs, exact weights/bytes, and the combined-request gotcha above. Total: 5 files,
  111,032 bytes. Verified: exactly those 5 `.woff2` files exist and nothing else; both licenses +
  README present; `fonts.googleapis`/`fonts.gstatic` grep across `frontend/src/` returns only this
  README's own explanatory prose, no runtime reference.

- [x] **F56 — `@font-face` declarations and the `--font-display` / `--font-sans` tokens in `index.css`** (M)
  R17.3, mirroring the single-source-of-truth mechanism F27/F28 already established for color.
  `frontend/src/index.css` today defines no `font-family` and no font `@theme` entry at all — the whole
  app, landing page included, rides Tailwind's default `font-sans` stack. Two parts:
  - **`@font-face`**, one block per file from F55, placed after the three `@import`s and before `:root`.
    Each carries an explicit `font-family`, `font-style: normal`, its real `font-weight` (400 for Hedvig;
    400/500/600/700 for the four Roboto faces — declaring a range on a static file makes the browser
    synthesize instead of picking the right file), `font-display: swap` (R17.5's deliberate default, not
    an open question), and `src: url("./assets/fonts/<file>.woff2") format("woff2")`.
  - **Tokens.** Add `--font-display` and `--font-sans` to the existing `@theme inline` block (lines
    137–183, beside `--color-*` and `--radius-*`), each with a real fallback stack after the family name
    (`ui-sans-serif, system-ui, sans-serif`) so a blocked or missing file degrades to today's look rather
    than to Times. Defining `--font-sans` re-points both the `font-sans` utility **and** Tailwind's
    preflight body stack, which is precisely what lands R17.1's "body copy" and "UI chrome" rows without
    touching a single component — R17.3's "no component hardcodes a font-family string."
  Unlike color, **fonts are theme-independent: do not duplicate these into `:root` and `.dark`.** Say so
  in a comment, so a future session doesn't "fix" the asymmetry with F27/F28's color tokens.
  Also add `font-synthesis-weight: none` in `@layer base`. Hedvig has one real weight, so a stray
  `font-semibold` on a Display element would otherwise render as browser-smeared fake bold — which looks
  merely "fine" on screen and then serializes into the export. Roboto never needs synthesis (all four
  sourced weights are real files), so this costs nothing and turns F57/F59's stray-weight cleanup from a
  vigilance problem into a mechanical one.
  Acceptance: `npm run build` emits fingerprinted `.woff2` files into `dist/assets/` and the **built** CSS
  references them (check the emitted bytes, per F45/F51's precedent, not just the source);
  `getComputedStyle(document.body).fontFamily` starts with `Roboto`; an element carrying `font-display`
  resolves to `Hedvig Letters Sans`; the Network panel shows the woff2s served **same-origin** and zero
  requests to any Google font host; every `@font-face` carries `font-display: swap`; no `font-family`
  string exists anywhere in `src/` outside `index.css` (grep).
  Depends on: F55 — **blocks F57, F58, F59.**
  **Done 2026-09-10.** Five `@font-face` blocks added after the three `@import`s, before `:root`;
  `--font-display`/`--font-sans` added to `@theme inline` with `ui-sans-serif, system-ui, sans-serif`
  fallback stacks; a comment states fonts are theme-independent and must not be duplicated into
  `:root`/`.dark`; `font-synthesis-weight: none` added in `@layer base`. Verified with a real
  `npm run build`: all five `.woff2` files fingerprinted into `dist/assets/`, built CSS references
  the fingerprinted filenames and carries `font-display:swap` on every face, zero
  `fonts.googleapis`/`fonts.gstatic` references in the built CSS. `tsc -b` clean.

  **Correction, found and fixed 2026-09-10 during F61's real-browser verification — the original
  `.font-display` utility never actually worked.** `npm run build`'s check above confirmed the
  *tokens* compiled and the fonts fingerprinted; it never checked whether `.font-display` actually
  changed a rendered element's font, and it didn't. In a real browser, every Display heading
  (F57) computed to Roboto, not Hedvig, despite the `.font-display` class being present and
  correctly matching (`h1.matches('.font-display')` => `true`).
  Root cause, confirmed by elimination rather than assumed: `@theme inline` (used deliberately here
  so `--font-sans` can drive Tailwind's `--default-font-family` build-time substitution) never emits
  `--font-display` as an actual runtime CSS custom property — Tailwind inlines `@theme inline`
  values directly into *its own* generated utilities at build time instead of keeping them
  queryable. The hand-written `@utility font-display { font-family: var(--font-display); }` compiled
  and matched, but `var(--font-display)` resolved to nothing, making the declaration invalid at
  computed-value time — which still *wins* the cascade (the browser doesn't discover the invalid
  var() until after cascade resolution) and only then falls back to the inherited value (Roboto),
  silently. This is why `!important` and moving the rule outside any `@layer` both failed to fix it
  (red herrings chased first) and why the real fix was unrelated to cascade order at all: reference
  the literal fallback stack directly in the utility —
  `font-family: "Hedvig Letters Sans", ui-sans-serif, system-ui, sans-serif;` — instead of a
  `var()` this theme mode never provides. Verified in a real browser after the fix:
  `getComputedStyle` on the hero `<h1>` and both section `<h2>`s resolves to
  `"Hedvig Letters Sans", ui-sans-serif, system-ui, sans-serif`, `document.fonts` reports the face
  `loaded` (not `unloaded`), and the rendered letterforms visibly differ from Roboto (compared
  zoomed screenshots before/after).
  **Lesson for F58/F59/F61 and any future `@theme inline` custom key:** `npm run build` succeeding
  and a utility class's selector matching are both necessary but *not sufficient* — the only real
  proof is `getComputedStyle` in a live browser. F58 and F59 were also verified only via grep/build
  at the time they were marked done; re-confirm their computed styles too during F61 rather than
  assuming this class of bug was unique to F57's rows.

- [x] **F57 — Apply the Display token to hero H1, section H2s and the logo wordmark** (S)
  R17.1's three Display rows. Hedvig Letters Sans, **weight 400 only**; hierarchy comes from size and
  tracking, never weight. Concrete call sites, all of which carry `font-semibold` today and must come down
  to 400:
  - `frontend/src/routes/LandingPage.tsx:250` — the hero `<h1>`
    (`mt-4 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl
    lg:text-6xl`).
  - `LandingPage.tsx:297` and `:428` — both section `<h2>`s, "One search, two views" and "Three things
    jTracks does for you" (`max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl`).
  - The wordmark, in **four** places: `LandingPage.tsx:74`'s shared `Wordmark`
    (`flex items-center gap-2 font-semibold`, used in both the landing header and the footer),
    `frontend/src/components/layout/AppLayout.tsx:134` (desktop lockup) and `:193` (mobile Sheet lockup),
    and `frontend/src/components/dashboard/recap-skins/shared.tsx:135–140`'s `RecapFooter` mark.
  If the hero reads too light after the swap, adjust size or `tracking-tight` — **do not reach for a
  weight utility**, there is no heavier file and F56's synthesis guard will ignore it anyway.
  The `RecapFooter` wordmark sits **inside the `html-to-image` subtree**, so it is not proven by looking at
  the screen; F60 owns that verification.
  Acceptance: computed `font-family` on the hero `<h1>`, both section `<h2>`s and all four wordmark
  instances resolves to Hedvig Letters Sans; grepping `src/` finds no element combining `font-display` with
  `font-semibold`/`font-bold`/`font-black`; the hero still reads as the page's dominant element at both
  375px and desktop; the landing header still fits (F44 measured it at ~315px of a 375px budget with
  "Log in" already hidden below `sm` — a wider wordmark eats that margin; F61 re-measures formally).
  Depends on: F56
  **Done 2026-09-10.** All four wordmark instances, the hero `<h1>` and both section `<h2>`s moved
  to `font-display font-normal` (from `font-semibold`). Grepped `src/` for any `font-display`
  co-occurring with `font-semibold`/`font-bold`/`font-black`: none found. Not verified this session
  (no browser available): the hero's visual dominance at 375px/desktop, and the landing header's
  ~315px/375px budget with the wider wordmark — both deferred to F61's real sweep.

- [x] **F58 — Apply and audit the Text family and weights across app, landing and chrome surfaces** (M)
  R17.1's Text rows. This is deliberately an **audit, not a rewrite** — several rows already carry the
  right weight and need only the family, which F56's `--font-sans` delivers for free. Verify per surface
  rather than assuming every row changes both:
  - **App page H1s, already 600 — verify, don't churn:** `ApplicationsPage.tsx:247`,
    `AnalyticsPage.tsx:47`, `SettingsPage.tsx:83`, all `text-xl font-semibold text-foreground`.
  - **Login/Signup H1s** are nested inside shadcn's `CardTitle` (`login-form.tsx:97–98`,
    `signup-form.tsx:106–107`) and inherit its weight, not their own. Confirm `components/ui/card.tsx`'s
    `CardTitle` actually resolves to 600 as R17.1's app-H1 row requires; if it doesn't, decide **once** —
    in `CardTitle` or at the two call sites — and record which, since changing the primitive affects every
    card in the app.
  - **Landing 500 roles, expected already correct:** hero eyebrow `LandingPage.tsx:245`
    (`text-sm font-medium tracking-wide uppercase`), the two product-visual `<h3>`s (`:338`, `:365`), the
    feature-trio `<h3>` (`:441`), and the footer nav `<h2>` (`:490`).
  - **Body copy, UI chrome and meta/caption need no per-component work if F56 is right** — that is the
    token's entire job. The work here is *proving* it rather than asserting inheritance reached them:
    spot-check the computed family on a real `Button`, a `TableHead` and `TableCell`, a form `Label`, a
    `StatusBadge`, the table's `TableCaption` count sentence, and a card-list/board timestamp.
    `components/ui/chart.tsx`'s `font-mono` is explicitly out of scope (R17.2) — leave it.
  Flag any chrome component setting a weight outside 400–500 as a finding rather than silently changing it.
  Acceptance: a written per-row result for every Text row of R17.1's table, each reading "already correct"
  or "changed to X" with a `file:line`; the only weight classes touched are ones that were genuinely
  wrong; `chart.tsx`'s `font-mono` untouched; computed family is Roboto on at least one real instance of
  each chrome type listed above.
  Depends on: F56
  **Done 2026-09-10.** Per-row result:
  - App page H1s (Applications/Analytics/Settings) — already correct (`font-semibold`), unchanged.
  - Login/Signup H1s — `CardTitle` default is `font-medium` (500), not the 600 required. Changed at
    the two call sites (`login-form.tsx:97`, `signup-form.tsx:106`, both now
    `<CardTitle className="font-semibold">`) rather than in the shared primitive, since `CardTitle`
    also backs unrelated, lighter sub-section titles elsewhere (`SettingsPage.tsx`'s "Ghosting",
    `AnalyticsPage.tsx`'s "Status breakdown"/"Applications over time"/"Pipeline flow") that were
    never in scope here.
  - Landing 500 roles (hero eyebrow, both product-visual H3s, feature-trio H3, footer nav H2) —
    all already `font-medium`, unchanged.
  - UI chrome spot-check: `Button`/`TableHead`/`Label`/`Badge` all `font-medium` (500);
    `TableCell`/`TableCaption` inherit body 400; card-list/board timestamps 400. No chrome
    component found above 500 — no findings to flag. `chart.tsx`'s `font-mono` untouched.
  Family now resolves to Roboto everywhere audited via `--font-sans` inheritance alone — no
  additional className changes needed beyond the two `CardTitle` overrides above.

- [x] **F59 — Move stat-tile numbers and recap hero stats from Display to Text at 700** (M)
  R17.1's most novel and least obvious change, and the one most likely to be missed or reverted by habit —
  which is why it is its own task. The original role mapping assumed Display carried 700; it can't, so the
  "big number" emphasis roles move to **Roboto 700**, which is a real file and a well-tested choice for
  numeric display anyway.
  - `frontend/src/components/dashboard/stat-tile.tsx:72` — the `<dd>`
    (`m-0 text-2xl leading-none font-semibold tracking-tight text-foreground tabular-nums`) goes to 700.
    It must stay on the **Text** family: do **not** put `font-display` on it. `NumberTicker` writes its
    `textContent` into its own child `<span>` (`className="text-foreground dark:text-foreground"`), so
    confirm that span still inherits family and weight from the `<dd>` after the change.
  - Recap hero stats: `strava-skin.tsx:131` (`text-3xl font-bold`), `duolingo-skin.tsx:79`
    (`text-[80px] leading-none font-black`) and `:107` (`text-xl leading-none font-bold`),
    `beli-skin.tsx:87` (`text-[36px] leading-none font-bold`).
  - **`font-black` is 900 and R17.2 sources no 900 file.** `duolingo-skin.tsx:79` and
    `beli-skin.tsx:70` would render browser-synthesized fake bold — and, worse, serialize it into the PNG.
    Bring both to `font-bold` (700), the heaviest real weight in the project, compensating with size or
    tracking if the Duolingo hero loses dominance (F49's whole design rests on that one figure being the
    point of the card).
  - `beli-skin.tsx:70`'s headline (`text-[26px] leading-[1.05] font-black tracking-tight uppercase`) is a
    *headline*, not a stat, and R17.1's table doesn't name it. Default to treating it as **Display
    (Hedvig 400) at a compensating size**; if 400 genuinely can't hold the card, fall back to Text 700 —
    either way record which and why in F62, don't leave it to the next reader to re-derive.
  - **Tabular figures are a stated R17.2 requirement**: `stat-tile.tsx` and the skins rely on
    `tabular-nums`. Verify Roboto's numerals stay equal-width by *measuring* the rendered width of `111`
    against `000` and `888` at the same size — not by eye. The visible symptom of failure is
    `NumberTicker` jittering horizontally mid-count.
  Acceptance: no element in the export subtree or the analytics stat row requests a weight above 700;
  computed family on `stat-tile.tsx`'s `<dd>` and on each skin's hero stat is Roboto; measured digit
  widths equal within a pixel and `NumberTicker` counts up without horizontal jitter; the Duolingo hero
  still visually dominates its card; the Beli headline call is recorded.
  Depends on: F56 — and land it **before** F60, or the baselines get shot twice.
  **Done 2026-09-10.** `stat-tile.tsx:72`'s `<dd>` moved `font-semibold` -> `font-bold`, stayed on
  Text (no `font-display`); `NumberTicker`'s inner `<span>` has no family/weight of its own, so it
  inherits from the `<dd>` unchanged. `strava-skin.tsx:132`, `duolingo-skin.tsx:108` and
  `beli-skin.tsx:94` were already `font-bold` — unchanged. `duolingo-skin.tsx:80` changed
  `font-black` -> `font-bold` (the only real fix this task required for the "no 900 file" problem).
  `beli-skin.tsx:77`'s headline (not itself a stat) changed from `font-black` to `font-display
  font-normal` per the milestone's stated default (Display 400, compensating with the existing
  size/tracking) — recorded in `docs/decisions/typography.md`; not visually verified this session,
  F61 should confirm 400 actually holds the card at that size or the documented fallback (Text 700)
  should be applied instead. Grepped `src/` for `font-black`: zero remaining class usages (two hits
  are prose in code comments only). Tabular-figure digit-width equality was **not measured** this
  session (no browser/canvas measurement tool available) — Roboto ships genuine tabular figures by
  font design, but this is an assumption, not a verified measurement; flagged for F61.

- [ ] **F60 — `document.fonts.ready` gate in the export path, and re-baseline all three skins** (L)
  R17.4, extending R12.5, and this milestone's hard gate. `RecapCard` and its skins render inside the
  `html-to-image`-captured subtree; a custom font that hasn't finished loading when `toBlob` fires exports
  with the browser's fallback baked into the PNG, silently. Fix it in
  `frontend/src/components/dashboard/recap-dialog.tsx`'s `exportCardToBlob()` (lines 224–241), awaiting
  font readiness **before** the `toBlob(card, { pixelRatio: EXPORT_PIXEL_RATIO })` call.
  **`document.fonts.ready` alone is not enough, and this is the trap worth naming in a comment.** It
  settles *pending* loads only — a face no rendered node has requested yet isn't pending, so `ready` can
  resolve cleanly while a face the card needs was never fetched. Explicitly
  `await Promise.all([...].map((f) => document.fonts.load(f)))` for the exact faces the skins use
  (`400 1rem "Hedvig Letters Sans"`, and Roboto at each weight the skins actually render), **then**
  `await document.fonts.ready`. Guard it so a rejection can't kill Download outright — an export with a
  fallback font still beats no export — but surface the failure through the existing
  `exportError`/`exportStatus` path rather than swallowing it.
  **Verify with F35's recipe verbatim** (recorded in F35 above, re-confirmed by F39 and F48): a local Node
  receiver writing `POST /save?name=<n>` bodies into `frontend/reference/`, `URL.createObjectURL` patched
  to `fetch` the blob to it, `HTMLAnchorElement.prototype.click` no-op'd for `[download]` anchors, the dev
  server on **port 5173** (the backend's `CORS_ORIGINS` allows only that), the Chrome window **visible**
  (hidden, `toBlob` hangs or yields garbage), a `blob.type === "image/png"` guard, and a **real refetch**
  forced by changing the range rather than by restoring a stubbed `fetch` — F48 overwrote a good baseline
  that way.
  **The cold-cache case is the actual regression this task exists to catch.** Hard-reload with cache
  disabled, open the dialog and export *immediately*, then diff that PNG against one taken with fonts
  warm. They must be identical; any difference means the gate isn't working.
  Re-baseline **all five** files in `frontend/reference/` — all three skins exist today
  (`recap-skins/strava-skin.tsx`, `duolingo-skin.tsx`, `beli-skin.tsx`), so none is pending:
  `recap-baseline-strava.png`, `-duolingo.png`, `-beli.png`, plus the two Strava degenerate states
  `recap-baseline-empty-total.png` (`total === 0`) and `recap-baseline-inflight-only.png`
  (`links.length === 0`).
  Acceptance: the cold-cache export is byte-identical to the warm export for all three skins; all five
  baselines regenerated, each 1080×1920 RGBA with all four corner alphas 0, each exported twice and
  SHA-256-compared, with the byte counts recorded in this entry in F48's table format; deliberately
  blocking one font file makes the export visibly fall back rather than hang; `tsc -b` and lint clean.
  Depends on: F57, F58, F59 (everything inside the exported subtree must be final first), and F35's recipe.
  **Still not fully verified — left unchecked — but real progress 2026-09-10 via claude-in-chrome.**
  Code fix confirmed correct by inspection: `recap-dialog.tsx`'s `REQUIRED_RECAP_FONTS` list
  (`'400 1rem "Hedvig Letters Sans"'` plus Roboto at 400/500/600/700) and `ensureRecapFontsLoaded()`
  correctly `document.fonts.load()`s each face before awaiting `document.fonts.ready` —
  load-then-ready, not ready-alone — wired into `exportCardToBlob()` before `toBlob`, with the
  rejection path surfaced via `exportError` rather than thrown.
  **Ran a real export in a live browser this session** (logged in via the mock user, Analytics page,
  All-time range, Duolingo skin, clicked Download): completed with no `exportError`, no console
  errors, and the dialog's own `role="status"` region announced "Recap image downloaded as
  jtracks-recap-all-duolingo.png." This is real signal the gate doesn't break the happy path, but it
  is **not** the task's actual acceptance bar.
  **Still outstanding, and why it stays unchecked:** no cold-cache-vs-warm-cache byte diff was taken,
  no deliberate font-blocking test was run, and the five `frontend/reference/*.png` baselines were
  **not** regenerated (they still reflect the pre-FV12 typeface). A future session needs to run F35's
  recipe verbatim (the local receiver server + patched `URL.createObjectURL`) to actually produce and
  diff those bytes before this box can be checked.

- [ ] **F61 — Both-theme, 375px and legibility/contrast re-verification sweep** (M)
  R17.6 plus the standing Accessibility non-regression NFR. Run it the way F29, F33 and F47 were run: a
  real browser, a genuine narrow layout viewport (a same-origin iframe — `resize_window` is a no-op in
  this environment and would silently test desktop twice), and a **written** checklist. Not an assertion
  that it passes.
  Matrix: `/`, `/login`, `/signup`, `/app` (**both** Table and Board renderings, per F51),
  `/app/analytics`, `/app/profile`, plus `ApplicationFormDialog`, `AutofillDialog`,
  `ConfirmAppliedDialog` and `RecapDialog` (all three skins) × light/dark × 375px/desktop.
  Three things a typeface swap specifically breaks, which is why this isn't a formality:
  - **Metrics.** A Display/Text pairing reflows differently than the system stack every prior measurement
    was taken against. Re-measure `documentElement.scrollWidth === clientWidth` at 375px on `/` and
    `/app` — F44 and F33 both recorded **360 === 360**, i.e. zero margin — and re-measure F44's landing
    header, which fit in ~315px of a 375px budget only after "Log in" was hidden below `sm`.
  - **Small-size legibility**, R17.1's meta/caption row: the table's `TableCaption` count sentence,
    card-list and board timestamps, `stat-tile.tsx`'s `text-xs font-medium tracking-wide uppercase`
    caption, and the recap skins' `text-[9px]`/`text-[10px]` labels — the smallest type in the project,
    read off a 4× PNG. Check the exported PNG at 100%, not only the on-screen dialog.
  - **Perceived contrast.** Token colors don't move, but a lighter stroke at the same color reads weaker.
    Re-measure the borderline values already on record: `--primary` as body text at 3.44:1 light (F29's
    carry-over, still unfixed and still must not gain a new caller), F48's Strava scrim table, and F50's
    `#c2381c` / `#14425a` / `#4a5b66` on `#fdf4e9`.
  Run axe per route in both themes with **F47's caveat**: assert the *evaluated node count*, not just the
  violation count — `BlurFade` leaves a permanent `filter: blur(0px)` and `BorderBeam` renders a
  `pointer-events-none absolute inset-0` overlay, and axe reports zero violations while having scored zero
  nodes, which reads exactly like a pass.
  Acceptance: a written per-cell result table in this entry; no horizontal scroll in any cell; no new axe
  violation **and** a non-zero evaluated-node count in every run; a per-surface legibility verdict for
  every `text-xs`/`text-[9px]`/`text-[10px]` role; any contrast that dropped below AA either fixed or
  recorded with a reason, the same standard as F21/F24/F47.
  Depends on: F57, F58, F59, F60
  **Still not fully verified — left unchecked — but substantial real progress 2026-09-10 via
  claude-in-chrome, including one genuine regression found and fixed.**

  **Regression found and fixed first (see F56's correction note above): `.font-display` never
  actually worked.** Every Display heading computed to Roboto despite the class matching correctly —
  root cause was `@theme inline` never emitting `--font-display` as a real runtime CSS custom
  property, so `var(--font-display)` in the hand-written `@utility` was invalid at computed-value
  time and silently fell back to the inherited value. Fixed by referencing the literal font stack
  directly instead of `var()`. This means F57–F59 were checked off previously on `npm run build` +
  grep evidence alone, which this session's real-browser check proves was **not sufficient** — worth
  keeping in mind for any future `@theme inline` custom key.

  **Re-verified after the fix, in a real logged-in browser session** (mock user
  `demo@jtracks.dev`), via `getComputedStyle`, not assumed:
  - Landing hero `<h1>` and both section `<h2>`s: `"Hedvig Letters Sans", ui-sans-serif, system-ui,
    sans-serif`, confirmed both by computed style and a zoomed screenshot showing genuinely different
    letterforms from Roboto (single-story "a", distinct "g").
  - `/login`'s `CardTitle` ("Login to your account"): weight 600, Roboto — F58's primitive-vs-call-site
    fix confirmed correct.
  - `/app/analytics` stat-tile figure: weight 700, Roboto — F59's fix confirmed.
  - All three recap skins (Strava, Duolingo, Beli), generated against real "All time" data (17
    applications): hero stat figures all Roboto 700; the Beli headline ("All time in applications")
    computed to Hedvig Letters Sans 400 as F59 defaulted it to, and the card holds it fine at that
    size — no fallback to Text 700 needed, this can be recorded as resolved rather than open in
    `docs/decisions/typography.md`; the recap footer's "jTracks" wordmark (inside the exported
    subtree) also correctly resolves to Hedvig 400.
  - Dark mode (via the real theme toggle, not a forced class): checked visually on `/app/analytics`
    including the open `RecapDialog` — legible, no obvious contrast problems, fonts unchanged from
    light mode as expected.
  - 375px: `resize_window` confirmed to genuinely be a no-op in this environment (window stayed at
    1536px), so used the same-origin-iframe technique F33/F44 established instead. `/login` and `/`
    (landing) both measured `scrollWidth === clientWidth` with **zero** overflow margin (357/357 on
    `/`), matching F44's prior "zero margin" finding rather than regressing it. The landing header —
    wordmark + 3 theme-toggle icons + "Get started" — still fits on one line at 375px with the new
    Hedvig wordmark; confirmed visually, not just by absence-of-scrollbar.

  **Still outstanding — not covered this session:** `/app` Table+Board, `/app/profile`, `/signup`,
  `ApplicationFormDialog`, `AutofillDialog`, `ConfirmAppliedDialog` (route/dialog matrix incomplete);
  no dark-mode check at 375px specifically (checked each independently, not combined); no axe run at
  all (F47's evaluated-node-count caveat still applies whenever this runs); no contrast
  re-measurement of the specific borderline values on record (`--primary` body text at 3.44:1, the
  Strava scrim table, the Beli hex trio); no pixel-measured tabular-figure digit-width check (F59's
  flagged gap, still open). A future session should finish this matrix rather than redo what's
  confirmed above.

- [x] **F62 — Typography decision record, and the conventions-doc cross-link** (S)
  R17's Documentation NFR, following F29's precedent of recording a design-token decision where the next
  session will actually look for it. **Create `docs/decisions/typography.md` — a new sibling doc, not a
  section inside `docs/decisions/magicui-conventions.md`.** The reasoning, stated so it isn't
  re-litigated: `docs/decisions/` is one file per decision (`sankey-library.md`,
  `cookie-topology-samesite.md`, `scheduler-mechanism.md`), and the conventions doc's stated scope is
  MagicUI usage. The palette record lives there because MagicUI components take color props *directly*
  (`BorderBeam`'s `colorFrom`/`colorTo`) — a real coupling. **No MagicUI component takes a font**, so
  typography would be an unrelated tenant in a doc future sessions open for motion rules.
  Record: the two families with licenses, where the files live and their byte sizes (F55); the **verified**
  weight-availability finding — Hedvig is 400-only, `wght@600` returns `400 Bad Request`, and a
  `400;500;600;700` request silently collapses to 400 plus a 400 italic — so nobody re-chases it as a
  fetch error; R17.1's role table **as shipped**, including the Display→Text-700 reassignment and F59's
  `font-black`→700 finding and Beli-headline call; the no-runtime-Google-link rule and why (R10's landing
  bundle NFR); `font-display: swap` as a deliberate default per R17.5, not an unresolved question; F56's
  synthesis rule; F60's `fonts.load()` + `document.fonts.ready` gate with a pointer to F35's regeneration
  recipe; and F61's measured results.
  Then add **one cross-reference** in `docs/decisions/magicui-conventions.md`'s "Theming — never ship
  MagicUI's hardcoded defaults" section (line 107) pointing at the new doc, and state there that MagicUI
  call sites inherit `--font-sans`/`--font-display` rather than shipping a family of their own — the same
  rule that section already makes for color. Without that line the conventions doc's "living registry"
  claim, which `.claude/rules/magicui-ui.md` points every session at, quietly goes stale.
  Acceptance: `docs/decisions/typography.md` exists and contains no claim contradicted by the shipped code;
  `magicui-conventions.md` links to it from the theming section and no longer reads as the only
  design-token record; nothing under `.claude/rules/` needs editing, because it points at the conventions
  doc, which now points onward.
  Depends on: F60, F61 (record measured results, not predicted ones)
  **Done 2026-09-10, with a stated deviation from plan.** `docs/decisions/typography.md` created,
  and `magicui-conventions.md`'s Theming section now cross-links to it with the "MagicUI inherits
  --font-sans/--font-display rather than shipping its own family" line, matching the pattern this
  section already uses for color. **Deviation:** F62's own acceptance criteria (and its "Depends
  on") ask for F60/F61's *measured* results, but neither task was completed this session (no
  browser tool available) — so `typography.md` records what F55–F59 actually shipped (byte sizes,
  the verified weight-availability finding, the role table as shipped including the Display->Text-
  700 reassignment and the Beli-headline call, the token/synthesis mechanism) plus an explicit
  "Outstanding verification" section stating F60's export gate and F61's sweep are implemented/
  planned but not empirically verified, rather than fabricating measured numbers. A future session
  should update `typography.md`'s F60/F61 sections with real results once that browser session
  happens, rather than treating this doc as final on those two points.

## Notes for parallel work (V2.1)

- **FV6 (R11) and FV7 (R13) can run concurrently.** They share no files — FV6 owns `index.css`,
  `main.tsx`, the new theme context, `AppLayout.tsx`, `StatusBadge.tsx` and `status-breakdown-chart.tsx`;
  FV7 owns `applications-table.tsx`, `ApplicationsPage.tsx` and a new card-list component. The only
  coupling runs one way: the table and the new card rendering *consume* the status class maps F28
  rewrites, so **F33's both-theme check waits on F28** while F30–F32 do not. The PRD sequences R13 second;
  running it alongside R11 costs nothing and it is the highest day-to-day payoff in this file.
- **F34 is resolved.** Q3/R12.6 are answered and the answer added tasks, exactly as anticipated: F48–F50
  (the recap skin system, this milestone) and Milestone FV11's F51–F54 (board view, entry-flow/settings/
  stat-tile polish, recorded as R16). F48 must land before F49/F50 (skin infrastructure first).
- **F35 is a gate, not a formality.** R12.5 requires verifying the recap export with a *real* export at
  the start of FV8. `html-to-image` at `pixelRatio: 4` is sensitive to how styles are applied, and both
  F28 (CSS-variable status fills inside the exported subtree) and F36–F38 (sizing, annotations,
  interaction) can break it in ways that only show up in the PNG. Discovering that after FV8 is finished
  repeats exactly the late-invalidation risk the V2 section flagged for F14 → F18.
- **F40 is repo-wide and worth doing in one sitting, alone.** It touches `App.tsx`, `ProtectedRoute.tsx`,
  `login-form.tsx`, `signup-form.tsx` and `AppLayout.tsx` at once, and half-applied it produces broken
  navigation everywhere. Don't interleave it with other work, and don't let it sit unmerged while FV6/FV7
  are editing `AppLayout.tsx` too.
- **FV9's double dependency.** R10 needs both the final palette (FV6) *and* the restructured chart (FV8).
  Now that F34 is resolved, FV8's scope is fixed (F35–F39 plus the F48–F50 recap skin system), so this is
  a normal sequencing dependency rather than an open-ended risk.
- **Milestone FV11 (F51–F54) can run alongside FV7/FV8** — it shares no files with either beyond the
  status color tokens/classes all three read from (F28). It only needs FV6's tokens (F27/F28) to be final.
- **F30's option-D bonus (slimming the Status cell) can be done at any time** — an independent, cheap
  change with no dependencies, good filler when blocked, and explicitly not a required deliverable
  (R13.2). Same role F23 played in the V2 section.
- **Nothing in V2.1 is gated on BACKEND or DATABASE.** The V2 data contract is a frozen input. If any task
  above appears to need an endpoint, a field or a migration, the task is wrong — not the contract.
- **Milestone FV12 (F55–F62) comes last, and F60 is its gate.** R17 is a retroactive token swap over
  surfaces FV7–FV11 already shipped, so all of them must exist before it can be verified on them. Inside
  the milestone the order is fixed rather than parallel: F55/F56 land the assets and tokens, F57–F59 apply
  the roles, and **F60 re-baselines the recap export only after all three** — re-shooting the PNGs midway
  just means shooting them twice. F55 depends on font files **the user supplies** (R17.3), so it can block
  on something no agent can resolve; start it first.
