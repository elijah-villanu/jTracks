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

- **R15 (Mobbin MCP).** Confirmed *skipped* for V2.1, not deferred-with-a-task. `.mcp.json` stays at
  `shadcn` + `magicuidesign-mcp`. Reference material comes from the user directly into
  `frontend/reference/` the way `strava_reference.PNG` grounded R9, and never ships in the bundle.
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
  reference baselines.
  Depends on: F27, F28

## Milestone FV7: Applications table without horizontal scroll (delivery stage 2 — R13)

> **Sequencing choice: run this concurrently with FV6, not strictly after it.** The PRD proposes R13
> second, but the two milestones share no files — FV6 owns `index.css`, `main.tsx`, the new theme context,
> `AppLayout.tsx`, `StatusBadge.tsx` and `status-breakdown-chart.tsx`; FV7 owns `applications-table.tsx`,
> `ApplicationsPage.tsx` and a new card-list component. The single coupling runs one way: the table (and
> the new card rendering) *consume* the status class maps F28 rewrites, so **F33's both-theme check waits
> on F28** while F30–F32 do not. R13 is also the highest day-to-day UX payoff in this file, and Q4 is
> fully resolved (A + B combined), so nothing blocks starting it now.

- [ ] **F30 — Kill the blanket `whitespace-nowrap` at the call site, set per-column wrap rules** (S)
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

- [ ] **F31 — Column-priority hiding at intermediate widths** (M)
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

- [ ] **F32 — Card-list rendering below the narrow breakpoint** (L)
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

- [ ] **F33 — 375px and accessibility non-regression verification for the board** (M)
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

- [ ] **F35 — Export-compatibility baseline, before touching anything** (S)
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
  Depends on: F28 (take the baseline against the final palette, or the diff is meaningless)

- [ ] **F36 — Container-measured responsive sizing instead of a scaled fixed viewBox** (M)
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
  Depends on: F35

> **Visual guidance for F37/F38 (not a separate task):** [Churnkey's flow/stat chart](https://mobbin.com/screens/3ba4f8e2-b296-454f-b5a8-c89c6f3c0ccf) — inline
> percentage labels per branch, its stat-card-adjacent framing — is the user-curated reference for
> this Sankey's visual treatment. Folded in here rather than a new task since this surface is
> already F37/F38's.

- [ ] **F37 — Make in-flight applications legible instead of silent blank space** (M)
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

- [ ] **F38 — Label collision fixes plus keyboard-reachable hover/focus detail** (L)
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

- [ ] **F39 — Tune node/ribbon geometry and re-verify the export against F35's baseline** (M)
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
  Depends on: F35, F36, F37, F38

- [ ] **F48 — Recap skin-selector infrastructure, plus the "Strava" skin (transparent background)** (L)
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

- [ ] **F49 — "Duolingo" skin: single dominant hero stat + secondary grid** (M)
  R12.7. Second recap skin, informed by the [Duolingo Year-in-Review reference](https://mobbin.com/screens/81b67776-4a5d-40d9-860e-9b3b4122357a): one clearly dominant stat
  (Applications sent) rendered oversized at the top, the remaining stats (rejection rate, interviews)
  arranged in a compact grid below it, opaque colored card background (unlike the Strava skin —
  transparency is Strava-only), same logo/date-range footer treatment reused from the existing shell so
  the three skins don't each reinvent that piece.
  Acceptance: renders correctly inside the F48 selector and exports cleanly at 1080×1920 with its own
  reference PNG; shares the same underlying recap data as the other two skins (no skin-specific data
  fetching).
  Depends on: F48.

- [ ] **F50 — "Beli" skin: ranked-stat layout, and Download/Share button styling** (M)
  R12.7. Third recap skin, informed by the [Beli monthly-recap reference](https://mobbin.com/screens/7fe2981e-cefd-4a7a-8e57-61ab97fb8e7f): a ranked-list-style presentation
  of the stats, opaque card background. Also gives the dialog's existing Download/Share buttons a visual
  treatment nodding to Beli's bottom share-icon row — styling only; **no custom per-app share buttons** are
  added, since `navigator.share()` already hands the OS's own app-icon sheet on mobile, and a hand-rolled
  row can't reliably deep-link into specific apps from a plain web share call the way a native sheet does.
  Acceptance: renders correctly inside the F48 selector and exports cleanly at 1080×1920 with its own
  reference PNG; Download/Share styling changes don't alter `handleDownload`/`handleShare` logic, only
  their presentation.
  Depends on: F48.

## Milestone FV9: Public landing page (delivery stage 4 — R10)

> Largest new surface in V2.1, and the PRD sequences it fourth for two concrete reasons: it must be built
> in the final palette (R11), and its product visual reuses the restructured Sankey/recap (R10.4 + R12).
> Building it earlier means building it twice. Q1 is resolved — a genuine public marketing page, routing
> option B. **F40 is a repo-wide change, not a new-file change**: R10.1 calls it "a repo-wide find, not a
> single file," and it is.

- [ ] **F40 — Move the authenticated app under `/app`** (M)
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

- [ ] **F41 — Public landing route that does no authenticated work** (M)
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

- [ ] **F42 — Hard-coded demo data and the product visual** (M)
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
  Acceptance: the product visual is a live render of the real component; changing a demo link value
  visibly changes the rendered chart; nothing in the landing module imports from `src/mocks/`; the visual
  is legible at 375px and in both themes.
  Depends on: F41, F39 (the restructured chart is what gets shown)

- [ ] **F43 — Landing sections: hero, feature trio, footer, and the landing theme control** (M)
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
  Acceptance: a visitor can state what jTracks does from the hero alone and reach `/signup` in one click
  (a stated success metric); every feature claim maps to a shipped behavior; no shortened status label
  anywhere on the page; the theme control works on `/` and its choice carries into `/app`.
  Depends on: F41, F42, F26

- [ ] **F44 — Landing accessibility, 375px responsiveness, metadata, and bundle isolation** (M)
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

## Milestone FV10: Motion on the new surfaces & conventions upkeep (delivery stage 5 — R14.2, R14.3, R14.5)

> Last stage by design, per the PRD's delivery sequence — motion gets applied to finished layouts rather
> than reworked as they change. R14.1's motion pass is **already shipped and is not scope-to-build here**;
> it is the set of conventions the tasks below inherit. R14.6's candidates (offer celebration,
> status-change transitions, chart draw-on) are **not approved** and are not scheduled — see the
> out-of-scope list at the top of this section.

- [ ] **F45 — Apply the existing motion conventions to the landing page** (M)
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

- [ ] **F46 — Update the conventions doc and its per-page inventory** (S)
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

- [ ] **F47 — V2.1 close-out verification across the whole matrix** (M)
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

## Milestone FV11: Pipeline board view, entry-flow/settings polish, and an analytics stat-tile nudge (R16)

> New scope, added via F34's resolution (see FV8) rather than the original PRD_V2_1.md draft — recorded
> as R16 there. Depends on FV6 (F27 accent hue, F28 status tokens) landing first, same reasoning FV7/FV8
> already use — build against the final palette once, not twice. Independent of FV7 and FV8 otherwise; no
> shared files besides the status color tokens/classes all three read from. Grounded in Mobbin references
> the user reviewed and curated directly, per area (R15.2's "research aid only" allowance — nothing
> installed, nothing shipped).

- [ ] **F51 — Optional status-grouped board view for the Pipeline page** (L)
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

- [ ] **F52 — Visual polish pass on the add-application entry flow** (S)
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

- [ ] **F53 — Settings page layout refinement** (S)
  R16.3. Visual-only refinement of `SettingsPage.tsx`'s single-field card, informed by the
  [Fresha gift-card settings](https://mobbin.com/screens/20a4b62e-609b-40b6-a17a-4b08e38c9fd5) and
  [Optimal Workshop settings form](https://mobbin.com/screens/db6e47ed-6dd4-4211-8be5-4125b44c96b5)
  references' label+helper-text+value rhythm — tighter vertical rhythm, clearer visual grouping
  of the field and its description. Scoped to what the page actually has today (one setting); does not
  invent new settings or sections.
  Acceptance: existing `aria-describedby` wiring, live "Settings saved." region, and validation behavior
  unchanged; visual-only diff.
  Depends on: F28.

- [ ] **F54 — Stat-tile visual nudge toward the Monarch reference's card treatment** (S)
  R16.4. Modest visual refinement of `stat-tile.tsx`'s card styling (border weight, padding, typographic
  treatment), informed specifically by the [Monarch stat-card reference](https://mobbin.com/screens/92c2b32c-20a0-4487-9b6c-3f32cb464893) — not its Sankey, which this task
  doesn't touch. Existing `NumberTicker`/`BorderBeam` usage and the "one continuous accent per view" rule
  (`docs/decisions/magicui-conventions.md`) are unchanged; this is a styling pass on the card shell only.
  Acceptance: no change to `numericValue`/`suffix`/`decimalPlaces`/`accent` prop behavior; visual diff
  only; conventions doc's inventory table updated if the accent's visual presentation changes at all.
  Depends on: F28.

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
