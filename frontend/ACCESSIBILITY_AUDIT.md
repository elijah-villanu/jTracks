# jTracks Frontend — Accessibility Audit

*Two passes, appended in order: **2026-08-21** (WCAG 2.1 AA) below, then **2026-09-15** (WCAG 2.2 AA) from "Second pass" onward. The 2026-08-21 follow-up list carries per-item status updates from the second pass. The manual screen reader checklist is the last section.*

**Date:** 2026-08-21
**Scope:** `frontend/src` — all routes, dialogs, the applications table, the dashboard charts, and this app's usage of the shadcn/ui (Base UI) primitives in `src/components/ui/`.
**Standard:** WCAG 2.1 Level AA.

## How this was tested

1. **Static scan** — `oxlint` with the `jsx-a11y` plugin across `src/`.
2. **Runtime scan** — `axe-core` (via `@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`) driven through a headless Chromium session that logs in against the MSW mocks and visits every screen and dialog state: login, signup, the pipeline table, the add/edit dialog (clean and with validation errors), the autofill dialog, the autofill *review* form after an unsupported-URL result, the analytics dashboard, the custom-date-range state, the recap dialog, and settings.
3. **Manual keyboard/screen-reader simulation** — scripted tab traversal recording the computed role and accessible name of every focus stop; focus-trap probes inside each dialog and the mobile sheet; focus-restoration checks on dialog close; Chrome DevTools Protocol `Accessibility.getPartialAXTree` queries for the computed name/value of every combobox; canvas pixel sampling to measure real contrast ratios of the status palette (Tailwind v4 emits `oklch()`, which naive contrast math gets wrong).

Automated tooling only catches roughly a third of real problems, and that held here: **axe reported zero violations on the pipeline table both before and after** the fixes below, yet manual traversal found a keyboard focus loss on every status change, a focus drop to `<body>` after the confirm dialog, and two comboboxes announcing raw database enum values.

**Final state:** 0 axe violations on every screen and dialog state listed above; 0 `jsx-a11y` findings; `tsc -b` and `vite build` clean.

---

## Blocking issues (these stopped or seriously derailed a task)

### 1. Keyboard focus was destroyed on every status change
**File:** `src/components/table/status-select.tsx`, `src/components/table/applications-table.tsx`
**WCAG:** 2.4.3 Focus Order (A)

The row status control was disabled via the native `disabled` attribute while the `PATCH` was in flight. The request starts in the same tick the user picks an item, so by the time Base UI closed the popup and tried to restore focus to the trigger, that trigger was already `disabled` — and a disabled button cannot take focus. Focus fell back to `<body>`, so a keyboard or screen reader user was thrown to the top of the document and lost their place in the table **on every single status change**. axe cannot see this; it only appears when you actually operate the control.

**Fixed:** the control now stays focusable and communicates the in-flight state with `aria-disabled` / `aria-busy` plus reduced opacity, and `onValueChange` ignores changes while busy. Verified: focus after a status change now stays on the same trigger, whose label updates to `"Change status (currently Interviewing / OA)"`.

### 2. Focus dropped to `<body>` when the Saved → Applied confirmation closed
**Files:** `src/routes/ApplicationsPage.tsx`, `src/components/applications/confirm-applied-dialog.tsx`, `src/components/table/status-select.tsx`
**WCAG:** 2.4.3 Focus Order (A)

Unlike every other dialog in the app, `ConfirmAppliedDialog` is opened from React state, not from a `DialogTrigger`. Base UI therefore had no trigger element to return focus to and dropped focus to `<body>` on both the confirm and cancel paths.

**Fixed:** exported a `statusSelectId(applicationId)` helper, gave each row's status trigger that stable id, and passed Base UI's `finalFocus` prop through `ConfirmAppliedDialog` to a ref resolved from that id. The target is re-resolved after a successful save, because the row re-renders with its new status while the dialog is open. Verified: focus after confirming now lands on `BUTTON "Change status (currently Applied)"`.

### 3. Two comboboxes announced raw database enum values
**Files:** `src/components/table/applications-toolbar.tsx`, `src/components/applications/application-form-dialog.tsx`
**WCAG:** 4.1.2 Name, Role, Value (A)

A bare `<SelectValue />` renders Base UI's raw *value*, not the selected item's label. The CDP accessibility tree confirmed the status filter computed as `role=combobox name="Filter by status" value="interviewing_oa"`, and the add/edit form's status trigger read `"saved"`. This was wrong visually too, but the screen reader impact is worse — a machine token is announced where a human label belongs.

**Fixed:** both now pass a formatter to `SelectValue` that maps through the existing `STATUS_LABEL` map, so the option list and the trigger agree. Verified: `value="Interviewing / OA"`.

### 4. Autofill failure and unsupported-URL results were completely silent
**Files:** `src/components/applications/autofill-dialog.tsx`, `src/lib/applications-context.tsx`, `src/components/applications/application-form-dialog.tsx`
**WCAG:** 3.3.1 Error Identification (A), 4.1.3 Status Messages (AA)

All four autofill outcomes — parsed, unsupported domain, failed parse, network error — closed the dialog and opened the same review form with *no explanation whatsoever*. The only difference between success and failure was which inputs happened to be pre-filled, which is invisible to a screen reader user and easy to miss for a sighted one. There was also no in-flight feedback: the only signal was the submit button's own label changing to "Fetching job details...", and since focus stays on that button, a screen reader never re-reads it.

**Fixed:**
- Added an `ApplicationFormNotice` (`{ tone, message }`) to the context's create form state and to `openCreateForm(initialValues, notice)`.
- Each outcome now carries specific copy: the parsed case names the source ("Filled in from this Greenhouse posting. Check the details below before saving."); unsupported, failed and network errors each get their own message, all of which state that the link was saved and the rest needs filling in manually.
- The review form renders the notice as a visible, colour-coded banner with `role="status"` — polite, not `alert`, because even the failure cases are a recoverable "fill this in yourself" and the dialog is opening at the same moment, so an assertive interruption would talk over the dialog title.
- Added a `role="status"` region in the autofill dialog announcing "Fetching job details, please wait."
- Added a `FieldDescription` (properly associated via `aria-describedby`) explaining which sites support autofill, and trimmed the now-duplicated `DialogDescription`.

Verified end to end: submitting an unsupported URL lands focus on the review form's Company input with the notice present in the accessibility tree.

### 5. Validation errors were never announced or associated with their fields
**Files:** `src/components/applications/application-form-dialog.tsx`, `src/routes/SettingsPage.tsx`, `src/components/signup-form.tsx`
**WCAG:** 1.3.1 Info and Relationships (A), 3.3.1 Error Identification (A)

Inputs carried `aria-invalid` but were never pointed at their own message, so a screen reader announced a bare "invalid entry" with no reason — and nothing at all if the user tabbed back to the field later. `FieldDescription` hints were equally orphaned: the signup form's "Must be at least 8 characters long" was invisible to assistive tech until the browser rejected the submit.

**Fixed:** every `FieldError` and `FieldDescription` in these forms now has a stable id referenced by its control's `aria-describedby`. On the ghost-override field the `aria-describedby` switches between hint and error; on the settings field both are referenced together.

Additionally, focus is now moved to the **first invalid control** on a failed submit:
- `ApplicationFormDialog` — this dialog scrolls (`max-h-[85vh] overflow-y-auto`), so a failed submit could leave the offending field entirely off-screen with only the submit button focused. Added an `INVALID_FIELD_ORDER` / `FIELD_CONTROL_ID` map and a `requestAnimationFrame` focus call (deferred a frame so the error nodes and their ids exist before focus moves, otherwise `aria-describedby` resolves to nothing). Verified: `document.activeElement` is `application-company` after an empty submit.
- `SettingsPage` — same treatment for the ghost-days field.
- `signup-form.tsx` — the password mismatch previously only rendered a generic banner at the top of the form while focus stayed on the submit button, giving no indication *which* field was wrong. Now the confirm field is marked `aria-invalid`, gets its own associated `FieldError`, and receives focus.

---

## Serious issues

### 6. `aria-sort` was on the wrong element, so no column ever reported as sorted
**File:** `src/components/table/applications-table.tsx`
**WCAG:** 4.1.2 Name, Role, Value (A)

`aria-sort` was set on the `<button>` inside each header cell. `role="button"` does not support that property, so browsers dropped it entirely — the table's sort state was invisible to assistive tech. (This one *was* caught by `jsx-a11y/role-supports-aria-props`.)

**Fixed:** `aria-sort` moved to the `<th>` (the `columnheader`), following the ARIA APG sortable-table pattern.

Worth recording: my first attempt also added visually-hidden state text ("sorted ascending, activate to sort descending") inside the button. Manual traversal showed why that's wrong — a screen reader reads the column header's text on *every data cell* in that column, so each cell would have announced "Company sorted ascending activate to sort descending, Acme Corp". Reverted to the APG pattern: the button's name is just the column name, and `aria-sort` on the `<th>` carries the state. Verified header cell text is now exactly `["Company", "Job Title", "Status", "Location", "Date Applied"]` with `aria-sort` flipping to `"ascending"` on the active column.

### 7. Charts had no non-visual alternative at all
**Files:** `src/components/dashboard/chart-data-table.tsx` (new), `applications-over-time-chart.tsx`, `status-breakdown-chart.tsx`, `sankey-chart.tsx`
**WCAG:** 1.1.1 Non-text Content (A), 1.4.1 Use of Color (A)

All three dashboard charts were inaccessible. Recharts emits a mass of unlabelled `<path>`/`<text>` nodes with no accessible name, and the tooltips carrying the actual numbers are pointer-only. The Sankey had `role="img"` with the label "Sankey diagram of application pipeline flow" — which tells a user a diagram exists and nothing about what it says. The status breakdown additionally relies on colour alone to distinguish `rejected` (red) from `failed` (pink).

**Fixed:** added a shared `ChartDataTable` component rendering a visually-hidden (`sr-only`, so it stays in the accessibility tree) real `<table>` with `<caption>`, `scope="col"`/`scope="row"` headers, and a one-line prose summary so a user gets the gist without walking every row. Each chart wraps its visual layer in `<figure>` + `<figcaption>` and hides it from assistive tech.

Verified output:
- *Applications by status* — "Bar chart: 6 submitted applications, most common status Applied with 1." + Status/Applications/Share rows.
- *Applications over time, by day* — "Line chart: 6 applications across 6 days, peaking at 1 on Jul 23." + Date/Applications rows.
- *Application pipeline flow* — "Stage totals: Applied 6, Interviewing / OA 1, Rejected 1..." + From/To/Applications rows.

### 8. Hiding the charts exposed a pre-existing unlabelled tab stop (regression caught by re-scanning)
**Files:** `applications-over-time-chart.tsx`, `status-breakdown-chart.tsx`
**WCAG:** 4.1.2 (A)

Re-running axe after fix #7 surfaced a *serious* `aria-hidden-focus` violation I had just introduced. Recharts puts `tabindex="0"` on its own `<svg class="recharts-surface">` — an unlabelled tab stop that announced nothing even before my change. Adding `aria-hidden` alone left that tab stop in place while hiding it from the screen reader, which is strictly worse.

**Fixed:** the wrapper is now `aria-hidden="true"` **and** `inert`, which removes the subtree from the tab order as well. Verified: `tabindex=0 inertAncestor=true` on both surfaces, violation gone. This is a good illustration of why the re-scan step matters.

### 9. No way to bypass the header; route changes moved neither focus nor announcement
**File:** `src/components/layout/AppLayout.tsx`
**WCAG:** 2.4.1 Bypass Blocks (A), 2.4.3 Focus Order (A), 4.1.3 Status Messages (AA)

The header repeats three nav links plus three action buttons on every page, with no skip link. Separately, a client-side route change replaced the entire page body without moving focus or firing anything a screen reader notices — focus stayed on the nav link just activated, and nothing was announced.

**Fixed:**
- Added a skip link as the first focusable element, `sr-only` until focused (`focus:not-sr-only`). Verified: it is the first tab stop, renders at 132×20px when focused, and activating it moves focus into `<main>` with the next tab landing on the search input.
- `<main id="main-content" tabIndex={-1}>` as a programmatic focus target (not in the tab order).
- A `useEffect` on `location.pathname` moves focus to `<main>` and writes the new page title into a polite live region, deliberately skipping the first render so landing directly on a URL doesn't yank focus out of the document start.
- Labelled both landmarks: `<nav aria-label="Main">` and `<nav aria-label="Mobile">`.

### 10. The auth routes had no `main` landmark
**Files:** `src/routes/LoginPage.tsx`, `src/routes/SignupPage.tsx`
**WCAG:** 1.3.1 (A) / `landmark-one-main`, `region`

Caught by axe. These routes render standalone rather than through `AppLayout`, so their entire content sat outside any landmark. Changed the outer `<div>` to `<main>`.

---

## Moderate issues

### 11. No status messages anywhere in the applications table
**File:** `src/routes/ApplicationsPage.tsx` — **WCAG 4.1.3 (AA)**

Every interaction on the page — picking a status, typing in search, choosing a filter, clicking a column header — silently rewrote the table body. Added two separate polite live regions (so an action result and a filter/sort result can't clobber each other mid-announcement):
- **Action results**: "Updating Globex…" → "Globex moved to Interviewing / OA." The Saved → Applied path bypasses `applyStatusChange`, so it got its own announcement ("Acme Corp moved to Applied, dated 2026-08-22.") — otherwise the one transition requiring an extra confirmation step was also the only one completing silently.
- **Filter/sort results**: "19 of 19 applications shown, sorted by Company ascending." Skipped on first render, since the table caption already states the count.

Loading text is now `role="status"`.

### 12. Date range pickers had no distinguishable accessible name
**File:** `src/components/dashboard/date-range-control.tsx` — **WCAG 4.1.2 (A)**

`<FieldLabel htmlFor={startId}>` pointed at a `<button>`. Per the accname spec a button is named by its own contents, *not* by an associated `<label>` — so both triggers announced identically as "Pick a date, button" with no way to tell Start from End.

**Fixed:** gave each label an id and set `aria-labelledby={"<labelId> <buttonId>"}` on the trigger, chaining the visible label in front of the button's own text ("Start Pick a date" / "Start Aug 1, 2026"). `htmlFor` is kept so clicking the visible label still opens the picker. Also wired `aria-describedby`/`aria-invalid` to the range validation error.

### 13. Calendar popovers stayed open after picking a date
**File:** `src/components/dashboard/date-range-control.tsx` — **WCAG 2.4.3 (A)**

Not a trap (Escape worked), but a keyboard user had to know to press Escape, and the trigger's newly-updated value was never announced. Made the popovers controlled so selecting a day closes them, which returns focus to the trigger and re-announces it with the date now in its label.

### 14. Chart card titles were not headings
**Files:** `src/routes/AnalyticsPage.tsx`, `src/components/login-form.tsx`, `src/components/signup-form.tsx` — **WCAG 1.3.1 (A), 2.4.6 (AA)**

`CardTitle` renders a plain `<div>`. On the analytics page that meant "Status breakdown", "Applications over time" and "Pipeline flow" were not headings, leaving no way to navigate between sections; the login and signup routes had **no heading element at all**.

**Fixed by nesting a real `<h2>`/`<h1>` inside `CardTitle`** rather than modifying the shared primitive. Tailwind's preflight resets heading typography, so this is visually identical — verified computed `font-size=16px weight=500 margin=0px` on both the nested `<h1>` and its `CardTitle` parent. Heading outline is now `H1:Analytics → H2:Status breakdown / H2:Applications over time / H2:Pipeline flow`.

### 15. Animations ignored `prefers-reduced-motion`
**File:** `src/index.css` — **WCAG 2.3.3 (AAA, but cheap and widely expected)**

`tw-animate-css` drives enter/exit animations on every dialog, sheet, popover, select popup and tooltip, and recharts animates series on mount. None of it is opt-out-able per component, so it's neutralised globally. Durations collapse to `0.01ms` rather than `none` deliberately — animation `end` events must still fire, because Base UI's popup unmount logic waits on them and `none` would leave closed dialogs mounted forever. Verified under Chromium's `reducedMotion: "reduce"`: dialog `animation-duration: 1e-05s`.

### 16. Save confirmation and dashboard/recap state changes were unannounced
**Files:** `src/routes/SettingsPage.tsx`, `src/routes/AnalyticsPage.tsx`, `src/components/dashboard/recap-dialog.tsx` — **WCAG 4.1.3 (AA)**

- **Settings**: "Saved." appeared and auto-cleared after 2 s with nothing announced; focus stays on the submit button whose label just flickers back to "Save". Replaced with an always-present `role="status"` region covering both "Saving..." and "Settings saved." (A region only inserted into the DOM at the moment it gains content is unreliably announced.)
- **Analytics**: changing the range refetches and swaps out every tile and chart. Added a `role="status"` region announcing the wait and then "Dashboard updated: N submitted applications in the selected range."
- **Recap dialog**: the preview swapped in silently and Download/Share only changed a button label. Added one polite region covering the fetch, the export, and completion — including an explicit "Recap image downloaded as jtracks-recap-week.png", since a programmatic `<a download>` click produces no perceivable feedback outside browser chrome that many screen readers don't surface.

### 17. Stale-interview warning was a bare focusable `<span>`
**File:** `src/components/table/applications-table.tsx` — **WCAG 4.1.2 (A)**

The tooltip trigger was `<span tabIndex={0} aria-label="...">` with no role — a tab stop that screen readers announce as an unlabelled group or nothing at all. Added `role="img"` so it has a real name *and* role, plus a visible `focus-visible` outline. Verified it announces its full message: "No activity for over 28 days — consider updating this application's status."

### 18. Redundant `role="img"` on the Sankey empty state
**File:** `src/components/dashboard/sankey-chart.tsx` — **WCAG 1.1.1 (A)**

The empty placeholder was `role="img" aria-label={message}` wrapping *the very same message as visible text*. `role="img"` makes a container's contents opaque to assistive tech, so the visible sentence was being replaced by an identical `aria-label`, and the text was no longer reachable with a normal read-next command. It's plain prose — it's now a plain `<p>`.

---

## Minor issues

### 19. Sort buttons had no visible focus indicator
`src/components/table/applications-table.tsx` — **WCAG 2.4.7 (AA)**. These are bare `<button>`s, not the themed `Button` primitive, so they fell back to the UA default outline, which the global `outline-ring/50` base rule washes out against the header background. Added an explicit `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`.

### 20. Stat tile label/value pairs were unrelated siblings
`src/components/dashboard/stat-tile.tsx` — **WCAG 1.3.1 (A)**. Two plain `<span>`s with no programmatic relationship. Now a self-contained `<dl>`/`<dt>`/`<dd>` *inside* each tile — deliberately not a page-level `<dl>` wrapping the grid, since a `<dl>` may not have arbitrary nested wrappers (`Card` → `CardContent`) between it and its `<dt>`/`<dd>` children.

### 21. Warning icon contrast headroom
`src/components/table/applications-table.tsx` — **WCAG 1.4.11 (AA)**. Measured `amber-600` on the amber cell tint at **3.07:1** — technically passing the 3:1 non-text threshold, but with essentially no margin. Bumped to `amber-700`: **4.85:1**.

### 22. Linting for a11y was not enabled
`.oxlintrc.json` only loaded the `react`, `typescript` and `oxc` plugins, so the `jsx-a11y` rules that would have caught issue #6 never ran in `npm run lint`. Enabled the plugin and set the meaningful rules to `error`. Three rules are explicitly disabled with reasons:
- `no-autofocus` — `autoFocus` inside a modal dialog / calendar popover is correct behaviour, not a defect.
- `no-noninteractive-tabindex` — a tooltip trigger must be focusable to be keyboard-reachable at all (#17).
- `prefer-tag-over-role` — it suggests replacing `role="status"` with `<output>`, which is a form-associated element with different semantics; `role="status"` on a `<p>`/`<span>` is the correct pattern here.

`src/components/ui/**` has `label-has-associated-control` disabled, since `Label` is a generic primitive and every call site passes `htmlFor`.

---

## Verified as already correct (no change needed)

These were checked by hand and are working — worth recording so nobody "fixes" them later:

- **Dialog focus trapping.** Tabbing 30 times inside the add/edit dialog never leaves it; focus wraps back to the first field at tab 23. A transient focus stop on a Base UI focus-guard `<span>` at the boundary is the guard doing its job, not a leak — confirmed by inspecting where focus lands next.
- **Focus restoration on dialog close** for every dialog opened from a real `DialogTrigger` — Escape from the add/edit dialog returns focus to "Add Job"; Escape from the mobile sheet returns focus to "Open menu".
- **Mobile sheet trapping** — focus stays inside across 20 tabs.
- **Status colour palette contrast.** All seven `StatusBadge` variants measured against their actual composited backgrounds: Saved 9.45:1, Interviewing/OA 6.36:1, Ghosted 6.15:1, Applied 5.60:1, Rejected 5.27:1, Failed Interview/OA 5.02:1, Offer 4.72:1 — all pass the 4.5:1 minimum. `--muted-foreground` measures 4.74:1 on white.
- **Status is never conveyed by colour alone** — `StatusBadge` always renders the text label alongside the colour.
- **The `<table>` is real semantic markup** with `<caption>`, `<thead>`/`<tbody>` and a proper header row.
- **Per-row edit buttons** already had good accessible names (`"Edit Acme Corp — Frontend Engineer"`).
- **Header tab order** is logical: skip link → Tracker → Analytics → Profile → Paste a Link → Add Job → Log out → search → filter → table.

---

## Follow-ups (found but not fixed)

*Statuses updated by the 2026-09-15 pass; see that section below.*

1. **Dark mode is unreachable and unverified.** The `.dark` class is never applied — no toggle exists. Every `dark:` variant in `StatusBadge.tsx`, `STATUS_FOCUS_CLASSES` and the new autofill notice is therefore unexercised, and `status-breakdown-chart.tsx` hardcodes light-mode-only chart colours (its own comment lists dark-safe substitutes: `interviewing_oa #d97706`, `offer #059669`). **If a theme toggle ever ships, the entire status palette needs re-measuring in dark mode before release.** Needs a product decision on whether dark mode is in scope. **[OUTDATED — 2026-09-15]** Dark mode shipped (F25/F26 `ThemeToggle`, `.dark` on `<html>`), and the status palette was re-measured in both themes during F28/F29. The 2026-09-15 pass re-ran axe in **both** themes across every screen and dialog state: 0 violations. Nothing here is outstanding.

2. **The exported recap PNG has no text alternative.** `recap-dialog.tsx` downloads/shares a rendered image with no alt text and no accompanying text version. The on-screen card is fully accessible (real text plus the new Sankey data table), but the artifact the user shares is an opaque image. Fixing properly means deciding what accompanies a shared image — share text, a caption, an alt-text field — which is a product/design call. Flagging to **shadcn-ui-builder / product** rather than inventing copy here. **[RESOLVED — 2026-09-15]** See issue 41: `recapTextSummary()` now backs both a `role="img"` alt on the on-screen preview and the `text` field sent with the shared file.

3. **Recharts tooltips remain pointer-only.** The visual charts are now hidden from assistive tech with equivalent data tables, which resolves the screen-reader gap. But a **sighted keyboard-only** user still cannot reach the per-point tooltip values — they can only read the axis labels and the permanent bar labels. Recharts ships an `accessibilityLayer` prop that adds keyboard navigation of data points; adopting it would conflict with the current `inert` approach and needs a deliberate decision about which model to use. Not a WCAG AA failure as it stands (the data is available in the tables), but a real usability gap. **[ACCEPTED / WON'T FIX — 2026-09-15]** Reviewed with the user, who accepts the current behaviour. The `inert` + `ChartDataTable` model stays; `accessibilityLayer` is not being adopted.

4. **`role="group"` on every `Field` wrapper** (`src/components/ui/field.tsx`) produces unnamed groups throughout every form. Harmless but noisy in verbose screen reader modes. It's stock shadcn primitive code and changing it would diverge from upstream, so it's left alone deliberately.

5. **The custom date range reveal is not announced.** Selecting "Custom" in `DateRangeControl` reveals two new date pickers with no announcement. The pickers are adjacent in DOM and tab order so they are discoverable, and the toggle correctly reports `aria-pressed`. Adding `aria-expanded` to a toggle button would be off-pattern; a live region here felt like noise for marginal benefit. Low priority, noted for completeness.

6. **`ProtectedRoute` / `GuestRoute` loading states** render a bare "Loading..." `<div>` outside any landmark during auth hydration. It is transient and immediately replaced, so it was left alone; worth a `role="status"` if hydration ever becomes slow enough to notice. **[RESOLVED — 2026-09-15]** See issue 40: both guards now render `role="status"`.

---

# Second pass — 2026-09-15

**Date:** 2026-09-15
**Scope:** `frontend/src` — everything in the Aug 21 scope plus what shipped after it: the Kanban **board** (F51), the narrow-width **card list** (F32), the public **landing page** (F41–F45), **dark mode** (F25–F29), the three **recap skins** (F48–F50), the typeface work (F55–F61) and the blue accent recolor (2026-09-10).
**Standard:** WCAG 2.2 Level AA (the Aug 21 pass was 2.1 AA; 2.2's new criteria — 2.4.11 Focus Not Obscured, 2.5.7 Dragging Movements, 2.5.8 Target Size, 3.3.7 Redundant Entry, 3.3.8 Accessible Authentication — were checked explicitly).

## How this was tested

1. **Static scan** — `oxlint` with the `jsx-a11y` plugin (0 errors before and after; the 17 remaining warnings are all `only-export-components`, unrelated).
2. **Runtime scan** — `axe-core` via `@axe-core/playwright` (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice`) across 26 states — landing, signup, login + login error, the board, the table, the add dialog with validation errors, the autofill dialog, the autofill review form after an unsupported URL, analytics, the custom-range state, the recap dialog and settings — **in both light and dark themes**, plus a 375px pass over the card list and the mobile sheet.
3. **Scripted keyboard/focus probes** — the part that found most of this. Each user flow is driven with real keys and `document.activeElement` is recorded after it settles: activating a status control and moving a card between board columns, the Saved → Applied confirm, delete, save, the autofill hand-off chain, mobile menu navigation, and submitting the login form from the keyboard with a wrong password.
4. **Measured contrast** — computed from the real token values with `culori` (Tailwind v4 emits `oklch()`), including the composited result of every `/NN` alpha tint, and cross-checked against axe's own findings and against focus-ring screenshots taken at `deviceScaleFactor: 2`.
5. **Motion** — Chromium with `reducedMotion: "reduce"`, sampling `getComputedStyle().offsetDistance` over time and reading the stat tiles at +120ms vs +3s.

**What the automation missed, again.** axe reported **0 violations on every screen in both themes before any of the fixes below** — including the board, where a keyboard user lost focus to `<body>` on every single card move. Of the 19 issues below, axe found **two** (both contrast), and one of those only surfaced *after* the `BorderBeam` overlay was removed, because the overlay had been making axe report that node as "needs review" rather than "fail".

**Final state:** 0 axe violations across all 26 states in both themes; `tsc -b`, `oxlint` and `vite build` all clean.

---

## Blocking issues (these stopped or seriously derailed a task)

### 23. Moving a card on the board destroyed keyboard focus
**Files:** `src/routes/ApplicationsPage.tsx`, `src/components/table/applications-toolbar.tsx`
**WCAG:** 2.4.3 Focus Order (A)

The board (F51) renders each status as its own column, so changing a card's status **remounts** it under a different parent. The status trigger the user had just operated was destroyed, and focus fell to `<body>` — on every move, which is the board's primary interaction. The table and card list had the same failure whenever a status filter was active and the row stopped matching.

**Fixed:** `restoreStatusFocus(id)` re-resolves the trigger *by id* after the list re-renders (two `requestAnimationFrame`s: one for React's commit, one for Base UI's own focus return from the closed popup) and focuses it only if focus was actually lost — never stealing it back if the user has moved on. When the row isn't rendered at all (filtered out, or past a collapsed column's "Show N more" cut-off) focus goes to the status filter instead, and the announcement gains "It no longer matches the status filter, so it's hidden from the list." Verified: focus after a move is `BUTTON#status-select-… "Change status (currently Offer)"` in the *new* column; after a filtered-out change it is `BUTTON#applications-status-filter`.

### 24. The Saved → Applied confirm dropped focus from the board
**Files:** `src/routes/ApplicationsPage.tsx`, `src/components/applications/confirm-applied-dialog.tsx`
**WCAG:** 2.4.3 (A)

Issue 2 of the Aug 21 pass fixed this for the table by handing Base UI a `finalFocus` **ref** resolved right after the save. On the board that ref is stale by the time the dialog closes — the confirmed move has already remounted the card in the Applied column, so the captured node is detached and focus fell to `<body>` again.

**Fixed:** `ConfirmAppliedDialog` now takes Base UI's `finalFocus` prop through unchanged (`() => HTMLElement | boolean`) instead of a ref, and ApplicationsPage passes a function that looks the trigger up by id *at close time*. Verified from the board: focus lands on `BUTTON#status-select-… "Change status (currently Applied)"`.

### 25. Buttons that disable themselves mid-request threw focus to `<body>`
**Files:** `login-form.tsx`, `signup-form.tsx`, `SettingsPage.tsx`, `application-form-dialog.tsx`, `confirm-applied-dialog.tsx`, `recap-dialog.tsx`, `src/components/ui/button.tsx`
**WCAG:** 2.4.3 (A)

A natively `disabled` button cannot hold focus. Every submit here disables itself for the length of its request, so activating one from the keyboard dropped focus immediately. Worst case is the one users hit most: **a failed login** left focus on `<body>`, so correcting the password meant tabbing back through the whole page.

**Fixed:** those buttons pass Base UI's `focusableWhenDisabled`, which swaps the native attribute for `aria-disabled` (still unclickable, still announced as dimmed) and keeps focus. `button.tsx` gained `data-disabled:opacity-50` so the dimming still applies, with a comment explaining why. Verified: after a failed login the focus is still `BUTTON "Login"`.

### 26. Deleting an application dropped focus and said nothing
**File:** `src/components/applications/application-form-dialog.tsx`
**WCAG:** 2.4.3 (A), 4.1.3 Status Messages (AA)

The edit dialog is opened from state, so Base UI returns focus to whatever was focused when it opened — the row's Edit button, which the delete just removed. Focus went to `<body>`, and nothing announced that the application was gone. Adding and saving were silent too.

**Fixed:** a `resolveFinalFocus()` that falls back when the opener can't take focus (deleted row, or an opener inside a dialog that has since closed), plus a polite live region outside the dialog that survives the close: "Deleted Acme Corp — Frontend Engineer.", "Added …", "Saved changes to …". After a delete, focus aims at `#main-content`; Base UI hands a non-tabbable target's focus to its first tabbable descendant, so it lands on the first control of the page content. Verified in both flows.

### 27. The autofill hand-off lost focus when the review form closed
**Files:** `autofill-dialog.tsx`, `application-form-dialog.tsx`, `AppLayout.tsx`, `src/lib/utils.ts`
**WCAG:** 2.4.3 (A)

Paste a Link → review form → Escape left focus on `<body>`: the element focused when the review form opened was inside the *autofill* dialog, which closes as the form opens. (From the mobile menu it was worse — a Sheet item that unmounts with the Sheet.)

**Fixed:** `AppLayout` records which header control started the flow (the Sheet's own trigger when it came from the menu, since the item itself unmounts) and passes it to both dialogs as a `returnFocusRef` fallback; a shared `canReceiveFocus()` guard rejects targets that are detached or `display: none`. Two things this pass got wrong first and then fixed, worth recording:
- A `finalFocus` on the autofill dialog fired **after** the review form had opened and yanked focus out of the open modal, back to "Paste a Link". The dialog now returns `false` (do nothing) when it is closing because it handed off.
- `document.activeElement` is `<body>` at hand-off time (the URL input disables itself during the request), and `<body>` passed the "connected and visible" check, so it became the return target and focus went to the skip link. `<body>` is now explicitly not an opener.

Verified: review form opens with focus on `INPUT#application-company`; closing it returns focus to `BUTTON "Paste a Link"`, and from the mobile menu to `BUTTON "Open menu"`.

---

## Serious issues

### 28. `BorderBeam` looped forever with no way to pause it
**Files:** removed from `login-form.tsx`, `signup-form.tsx`, `LandingPage.tsx`, `stat-tile.tsx`; `src/components/ui/border-beam.tsx` deleted
**WCAG:** 2.2.2 Pause, Stop, Hide (A)

A light travelling the border of the login card, the signup card, the landing page's pipeline-flow card and the "Total Applications" stat tile, one lap every 24s, forever. 2.2.2 requires a pause/stop/hide mechanism for auto-starting movement that runs past 5 seconds next to other content — decorative or not — and there wasn't one. It sat on an auth card people are trying to type into.

**Fixed:** removed app-wide **by user decision**, along with `StatTile`'s `accent` prop that enabled it, the `relative` classes the overlay needed, and the installed component file. Nothing replaced it. `motion` is still a dependency (`BlurFade`, `NumberTicker`); no CSS or keyframes were left behind — the built CSS dropped 93.61 kB → 91.96 kB. Recorded in `docs/decisions/magicui-conventions.md` as removed/not approved, with a standing rule against adding another looping accent. Verified: 0 elements matching the beam's `offset-path`/`--border-beam-width` signature on every page, in both themes.

### 29. `MotionConfig reducedMotion="user"` was not honouring reduced motion
**Files:** `src/hooks/usePrefersReducedMotion.ts` (new), `stat-tile.tsx`, `main.tsx`, `docs/decisions/magicui-conventions.md`
**WCAG:** 2.3.3 Animation from Interactions (AAA, but the project makes it a hard rule)

`main.tsx` and the conventions doc both stated that the app-root provider makes *every* Motion component honour the OS setting automatically, and told future sessions never to re-check it per component. That is not what the provider does: Motion only short-circuits **positional** values (transforms, `width`/`height`/`top`/`left`/`right`/`bottom` — `positionalKeys` in `motion-dom`'s `visual-element-target`). Measured with reduced motion on: the `BorderBeam` kept looping (`offsetDistance` 0.39% → 6.67% in 1.5s) and `NumberTicker` still counted up (it drives a standalone `useSpring` writing `textContent`, so no visual element is involved at all).

**Fixed:** one shared `usePrefersReducedMotion()` hook (live `matchMedia`, unlike Motion's own `useReducedMotion`, which reads once); `StatTile` renders the final `value` as plain text instead of the ticker. The beam is gone entirely (issue 28). `BlurFade` needs nothing — its offset is skipped and only a 0.4s opacity/blur fade remains. Both the source comment and the conventions doc's "one rule that matters most" section were corrected, since the wrong version explicitly told the next session not to look. Verified on the Analytics "All" range: first tile reads `17` at +120ms under reduced motion, versus `0` → `17` over ~3s without it.

### 30. Every route shared the landing page's title
**Files:** `src/hooks/useDocumentMetadata.ts`, `LoginPage.tsx`, `SignupPage.tsx`, `ApplicationsPage.tsx`, `AnalyticsPage.tsx`, `SettingsPage.tsx`
**WCAG:** 2.4.2 Page Titled (A)

`/login`, `/signup`, `/app`, `/app/analytics` and `/app/profile` all inherited `index.html`'s "JourneyJob — see where your job search stalls". Tab lists, history entries and the first thing a screen reader announces on load were identical for every page.

**Fixed:** a title-only `useDocumentTitle()` beside the existing `useDocumentMetadata`, with the same write-on-mount / restore-on-unmount contract so it composes with the landing route's hook in either direction. Verified: "Log in — JourneyJob", "Create an account — JourneyJob", "Applications — JourneyJob", "Analytics — JourneyJob", "Settings — JourneyJob".

### 31. Focus indicators were under the non-text contrast minimum
**Files:** `src/index.css`, `src/components/ui/button.tsx`, `LandingPage.tsx`
**WCAG:** 1.4.11 Non-text Contrast (AA), 2.4.7 Focus Visible (AA)

Three separate cases, measured from the real tokens and confirmed against focus screenshots:
- The base `* { outline-ring/50 }` rule is what every focusable element **without** its own focus styling falls back to — nav links, footer links, the inline "Sign up"/"Sign in" links, the skip link. At 50% alpha it measured **2.26:1** light / **2.12:1** dark. Now `outline-ring`: **5.50:1 / 5.33:1**.
- The `default` Button variant's `focus-visible:border-ring` is the same blue as its own fill, so the only indicator was the `/50` halo (2.26:1). Now a solid `ring-2 ring-ring` with `ring-offset-2` so a background-coloured gap separates it from the fill.
- The `destructive` variant's `focus-visible:border-destructive/40` measured **2.26:1 / 1.98:1**. Now the solid colour (4.91:1+).

The landing footer's logo link had its own `focus-visible:ring-ring/50`; also made solid.

### 32. Text fields had effectively invisible outlines
**Files:** `src/index.css`, `src/components/ui/input.tsx`, `textarea.tsx`, `select.tsx`
**WCAG:** 1.4.11 (AA)

The boundary of an input or select trigger is the only thing showing a sighted user where to type, and `--input` drew it at **1.26:1** on white / **1.48:1** in dark — for practical purposes not there at all for a low-vision user.

**Fixed:** a new `--input-border` token (`oklch(0.62 0 0)` / `oklch(1 0 0 / 40%)`), **3.64:1 / 3.77:1**, and 3.35:1 on the lightest status-cell tint the table's status trigger sits on. Deliberately a new token rather than darkening `--input`, because dark mode also uses `--input` as the control *fill* (`dark:bg-input/30`), which should not change.

### 33. Error banner text failed AA in light mode
**File:** `src/index.css`
**WCAG:** 1.4.3 Contrast (Minimum) (AA)

Every error banner in the app is `text-destructive` on `bg-destructive/10` — login, signup, the add/edit dialog, the confirm dialog, settings, analytics, the recap dialog, and both alerts on the tracker. At the stock `oklch(0.577 0.245 27.325)` that composites to **4.09:1**. The destructive Button's hover state (`/20` over the dialog footer's `bg-muted/50`) was worse at ~3.3:1.

**Fixed:** `--destructive` darkened to `oklch(0.49 0.2 27.4)` — same hue, the lightest value that clears 4.5:1 in *every* state it's used: **5.75:1** on the banner tint, **4.55:1** on that hover. Dark mode already passed (6.23:1) and is unchanged. This is the one axe caught, and only after the `BorderBeam` overlay stopped masking it.

---

## Moderate issues

### 34. The recap preview's empty state used a theme token inside a fixed-palette card
**File:** `src/components/dashboard/sankey-chart.tsx`
**WCAG:** 1.4.3 (AA)

`SankeyEmptyPlaceholder` is `text-muted-foreground`, which is correct in-app but wrong inside `RecapCard`: on the Strava skin's dark scrim, light mode's grey measured **3.02:1** (axe flagged it), and the colour changed with the app theme — breaking the recap's theme-independence contract (F28), which exists because the exported PNG has no theme context.

**Fixed:** a `themed` prop, `false` on the explicit-width/non-interactive path `RecapCard` uses, so the text inherits the skin's own ink. **The per-skin reference PNG in `frontend/reference/` should be re-checked with a real export** if this empty state is ever exercised there.

### 35. The recap image had no text alternative
**Files:** `src/components/dashboard/chart-summaries.ts` (new), `recap-dialog.tsx`, `LandingPage.tsx`, `sankey-chart.tsx`
**WCAG:** 1.1.1 Non-text Content (A) — resolves Aug 21 follow-up #2

The whole point of the recap is to become an image, and the image carried nothing readable: the shared file went out with only `recap.headline` as its text, and the on-screen preview was a stack of visually-styled fragments rather than something presented as the picture it is about to become.

**Fixed:** `recapTextSummary(recap)` builds one sentence set from the data already on the payload — period label and dates, the headline, the three featured stats every skin draws (via the existing `featuredStats`), and the pipeline stage totals through a `sankeyStageTotals()` helper **extracted from `SankeyChart`'s own `ChartDataTable` summary**, so the chart's text alternative and the recap's use the same wording rather than two formats. It backs two things:
- `role="img"` + `aria-label` on the preview wrapper in the recap dialog and on the landing page. The wrapper sits *outside* the card's export ref, so F35's "nothing new inside the exported subtree" still holds.
- the `text` field of `navigator.share()`, so a recipient gets the numbers alongside the file.

Verified: `"Strava recap image. JourneyJob recap for this week (2026-09-09 to 2026-09-15). … Stage totals: Applied 0, Interviewing / OA 0, …"`, and the same string captured from a stubbed `navigator.share` call. A **downloaded** PNG still can't carry alt text — that's a file-format limit, not a fixable gap.

### 36. Auth fields had no `autocomplete`
**Files:** `login-form.tsx`, `signup-form.tsx`
**WCAG:** 1.3.5 Identify Input Purpose (AA), 3.3.8 Accessible Authentication (AA, new in 2.2)

Neither form declared `autocomplete`, so browsers and password managers had to guess. 3.3.8 requires that authentication not depend on recalling or retyping a password.

**Fixed:** `email` / `current-password` on login, `email` / `new-password` (both fields) on signup. Verified from the DOM.

### 37. Required fields weren't marked as required
**File:** `src/components/applications/application-form-dialog.tsx`
**WCAG:** 3.3.2 Labels or Instructions (A)

Company and Job Title are rejected when empty, but nothing said so until the submit failed, visually or programmatically.

**Fixed:** `aria-required` on the controls plus a visible `*` (`aria-hidden`, since the control already announces "required") and one line in the dialog description explaining the marker. Date Applied gets both conditionally — it's required only once status is past Saved, the same rule `handleSubmit` validates. Deliberately **not** the native `required` attribute, which would let the browser's validation bubble pre-empt this form's own associated, focus-managed error messages. Verified in the accessibility tree: `textbox "Company" required=true`.

### 38. Pipeline-chart node targets were too small
**File:** `src/components/dashboard/sankey-chart.tsx`
**WCAG:** 2.5.8 Target Size (Minimum) (AA, new in 2.2)

The F38 per-node hover/focus triggers were exactly the node rect — always 10px wide, and as little as 11px tall for a small stage (measured 10×11 for "Offer" on the landing page).

**Fixed:** the hit box now grows to 24px around the rect's centre — freely horizontally, since columns are far apart, and vertically only as far as the midpoint of the gap to its column neighbours, so two triggers can never overlap and the one under the pointer is always the node it looks like. Verified: the smallest is now 24×23 (height capped by a neighbour, which the spacing exception covers).

### 39. The mobile menu's accessible name didn't say it was a menu
**File:** `src/components/layout/AppLayout.tsx`
**WCAG:** 2.4.6 Headings and Labels (AA)

`SheetTitle` contains only the logo, so the dialog announced as "JourneyJob, dialog" — the product name, not what just opened.

**Fixed:** a visually-hidden " menu" completes it to "JourneyJob menu" without touching the visual lockup. Verified in the accessibility tree.

---

## Minor issues

### 40. Recap design dots: low contrast, and selection by colour alone
**File:** `src/components/dashboard/recap-dialog.tsx` — **WCAG 1.4.11 (AA), 1.4.1 Use of Color (A)**

The dot is the only visual part of the control, and `bg-muted-foreground/40` measured **1.69:1** light / **2.15:1** dark. The selected dot differed from the rest only by colour. Now solid (**4.73:1 / 6.91:1**), and the selected one is a wider pill, so selection isn't carried by hue alone. (`aria-current` was already correct.)

### 41. Auth-hydration loading states were silent
**File:** `src/components/ProtectedRoute.tsx` — **WCAG 4.1.3 (AA)** — resolves Aug 21 follow-up #6

Both guards render a bare "Loading..." during hydration. Now `role="status"`.

### 42. The Settings card title wasn't a heading
**File:** `src/routes/SettingsPage.tsx` — **WCAG 1.3.1 (A)**

"Ghosting" was a `CardTitle` `<div>`. Nested a real `<h2>` under the page `<h1>`, the same pattern AnalyticsPage already uses. Visually identical (Tailwind preflight resets heading typography).

---

## Verified as already correct (2.2-specific checks)

- **2.5.7 Dragging Movements** — the board has **no** drag-and-drop by design; every card's status is changed through a `StatusSelect` that is fully keyboard-operable, which is exactly the "single-pointer alternative" the criterion asks for. The recap carousel's Embla drag is a bonus on top of real Previous/Next buttons and dot controls.
- **2.4.11 Focus Not Obscured (Minimum)** — no sticky/fixed headers or footers overlay the scrolling content; the board's column scrollers and the dialogs scroll their own focused content into view.
- **3.3.7 Redundant Entry** — no flow asks for the same information twice (signup's password confirmation is an explicit exception the criterion allows).
- **1.4.10 Reflow** — `document.documentElement.scrollWidth === clientWidth` at **320px** on the landing page, login, the tracker (board and card list), analytics and the open recap dialog. The board's own horizontal scroller is an intentional, documented exemption and does not scroll the page.
- **Target size, everything else** — the only sub-24px targets remaining are the table's sort buttons (20px tall, nothing adjacent within 24px), the staleness warning icon (14px, 8px clear of its neighbour) and the landing footer's text links (17px tall, 25px apart) — all of which pass 2.5.8's spacing exception. The skip link measures 24×16 only while visually hidden.
- **Charts under reduced motion** — Recharts 3's `isAnimationActive` defaults to `"auto"`, which reads `prefers-reduced-motion` itself; no change needed.

---

## Follow-ups after this pass

1. **Accepted, not fixed: keyboard-only users can't reach chart tooltips.** Carried over from Aug 21 follow-up #3 and **accepted by the user on 2026-09-15**. The data is fully available to screen readers in the `ChartDataTable`s; a sighted keyboard-only user still can't get per-point values.
2. **Screen reader verification is outstanding.** Everything above was verified through the accessibility tree and `document.activeElement` in headless Chromium, which confirms names, roles, states and focus, but **not** what NVDA or VoiceOver actually say or when. The checklist below exists for that.
3. **The recap reference PNGs.** Issue 34 changes one pixel-level thing in the Strava skin's empty state. Re-baseline if that state is ever exercised in an export.
4. **`role="group"` on every `Field` wrapper** and **the un-announced custom-date-range reveal** (Aug 21 follow-ups #4 and #5) are unchanged and still deliberate.
5. **No automated a11y regression test exists.** Everything here was checked with throwaway scripts. The project has no test runner at all (`frontend/package.json` has no `test` script), so an axe-in-CI job would mean introducing one — a real decision, not a drive-by addition.

---

# Manual screen reader test checklist

For the user's own NVDA/VoiceOver pass. Everything here was verified programmatically (accessibility tree, `document.activeElement`); what is **not** verified is the actual spoken output and its timing. Expected text is written as a screen reader would say it — exact wording varies by SR and verbosity, so match the *substance*, not the punctuation.

## Setup

**NVDA (Windows, Chrome and Firefox)**
- Install NVDA, start it (`Ctrl+Alt+N`). `Insert` is the NVDA modifier key (or `CapsLock` in laptop layout).
- **Turn on the Speech Viewer** — NVDA menu → Tools → Speech Viewer. It logs every utterance, which is the only practical way to record what was said and compare it against this table.
- Know the two modes: **browse mode** (default, arrow keys read the document) and **focus mode** (typing goes to the control). NVDA switches automatically when focus enters a text field; `Insert+Space` toggles manually. **Live region announcements only interrupt reliably in browse mode** — test the announcements below in browse mode.
- Useful keys: `Insert+Down` read all · `H` next heading · `D` next landmark · `F` next form field · `T` next table · `B` next button · `Insert+T` read title · `Insert+Tab` re-read the focused item.
- Test both Chrome and Firefox: they compute a few names differently (notably `<label for>` on a `combobox`).

**VoiceOver (macOS Safari, iOS Safari)**
- macOS: `Cmd+F5`. `VO` = `Ctrl+Option`. Turn on the **caption panel** (VoiceOver Utility → Visuals → Caption Panel) to record utterances.
- `VO+A` read all · `VO+U` rotor (headings/landmarks/form controls/tables) · `VO+Right/Left` next/previous item · `VO+Space` activate · `VO+Shift+Down` interact with a group.
- Safari needs "Press Tab to highlight each item on a webpage" enabled (Settings → Advanced) for full tab traversal.
- iOS: Settings → Accessibility → VoiceOver. Swipe right/left to move, double-tap to activate, two-finger swipe up to read all. Use it for the mobile menu and the recap Share row.

**App setup:** run with the MSW mocks (`VITE_ENABLE_MOCKS=true npm run dev`), sign in as `demo@jtracks.dev` / `password123`. Run the whole list once in light and once in dark (announcements are theme-independent, but focus visibility isn't). Run items marked **[RM]** a second time with the OS "reduce motion" setting on.

## A. Page titles and route changes

| # | Where / steps | Expect |
|---|---|---|
| A1 | Load `/login` | Title read on load: "Log in — JourneyJob". `Insert+T` / `VO+F2` repeats it. |
| A2 | Load `/`, `/signup`, `/app`, `/app/analytics`, `/app/profile` in turn | "JourneyJob — see where your job search stalls", "Create an account — JourneyJob", "Applications — JourneyJob", "Analytics — JourneyJob", "Settings — JourneyJob". No two pages share a title. |
| A3 | From `/app`, click "Analytics" in the header nav | Focus moves into the main region and the polite region announces **"Analytics — navigated"**. The heading "Analytics" is then the first thing read. Nothing is announced on the very first page load. |
| A4 | On `/app`, press `Tab` once from the top of the page | First stop is **"Skip to main content, link"**, visible on screen. Activating it moves focus into `<main>`; the next `Tab` reaches the view-mode toggle. |
| A5 | Navigate by landmark (`D` / rotor) on `/app` | banner → navigation "Main" → main → (on `/` also: navigation "Footer", contentinfo). |
| A6 | Navigate by heading (`H` / rotor) on `/app/analytics` | h1 "Analytics" → h2 "Status breakdown" → h2 "Applications over time" → h2 "Pipeline flow". No level is skipped. |

## B. Forms and errors

| # | Where / steps | Expect |
|---|---|---|
| B1 | `/login`, focus Email | "Email, edit, blank" — and the password manager offers to fill (the `autocomplete` fix). |
| B2 | `/login`, enter a wrong password, activate **Login** from the keyboard | The alert is announced: **"Invalid email or password."** Focus **stays on the Login button** (not `<body>`, not the top of the page) — confirm with `Insert+Tab` / `VO+F4`. |
| B3 | `/signup`, submit with two different passwords | "Passwords do not match." is announced, focus lands on **Confirm Password**, and the field reads as **invalid** with that message as its description. |
| B4 | `/signup`, focus Password | The hint "Must be at least 8 characters long." is read as the field's description. |
| B5 | `/app` → "Add Job", tab through the form | Company and Job Title announce **"required"**. The dialog description includes "Fields marked * are required." The `*` itself is never spoken as "star". |
| B6 | In that dialog, submit empty | Focus jumps to **Company**, announced with its error "Company is required." Repeat after fixing Company: focus moves to Job Title. |
| B7 | In that dialog, set Status to anything past "Saved" | Date Applied becomes **required**; submitting without it moves focus there with "Date applied is required once status is past Saved." |
| B8 | `/app/profile`, enter `0`, Save | "Enter a whole number of days greater than 0." is announced and focus returns to the **Default ghost days** field, which reads as invalid with that message. |
| B9 | `/app/profile`, save a valid value | The status region announces **"Saving..."** then **"Settings saved."** Focus stays on the Save button throughout. |
| B10 | Any combobox: `/app` status filter, the form's Status, the card list's "Sort applications by" | Names are "Filter by status", "Status", "Sort applications by"; the **value is a human label** ("Interviewing / OA", "Company, ascending") — never a raw `interviewing_oa`. Check in both Chrome and Firefox. |

## C. The tracker: status changes, delete, live regions

| # | Where / steps | Expect |
|---|---|---|
| C1 | `/app` (Board), focus a card's status control | "Change status (currently Applied), combo box". |
| C2 | Change that card's status to Offer | Announced: **"Updating Globex…"** then **"Globex moved to Offer."** Focus lands back on **the same card's status control in the Offer column**, announcing "Change status (currently Offer)". This is the single most important item in this list — it used to throw focus to the top of the page. |
| C3 | Switch to Table view, set the status filter to "Applied", then change a visible row to Rejected | Announced: "… moved to Rejected. **It no longer matches the status filter, so it's hidden from the list.**" Focus lands on the **"Filter by status"** combobox. |
| C4 | Move a card from **Saved → Applied** (board or table) | The confirm dialog opens and is announced ("Mark as applied?" + description). Confirm → **"Acme Corp moved to Applied, dated 2026-09-15."** and focus returns to that row/card's status control, now "currently Applied". |
| C5 | Type in the search box | After the results settle: **"N of M applications shown"** (plus ", sorted by …" when a sort is active). It should not interrupt every keystroke's echo. |
| C6 | Table view, activate a column header | Header announces as a button named just the column ("Company"); the column then reports **"sorted ascending"**, and activating again "sorted descending". Cells must **not** repeat the sort state. |
| C7 | Edit a row, change Notes, Save changes | **"Saved changes to Acme Corp — Frontend Engineer."** Focus returns to that row's **"Edit Acme Corp — Frontend Engineer"** button. |
| C8 | Edit a row, Delete, confirm | **"Deleted Acme Corp — Frontend Engineer."** Focus lands at the start of the page content (the Table/Board toggle), **not** on `<body>`. |
| C9 | Board: navigate by heading | Each column is "Applied (12)" etc. — the count is inside the heading and matches the cards under it. |
| C10 | Board: a column with more than 12 cards | "Show 8 more Applied applications, button", `aria-expanded` state announced; after activating, it stays focused and becomes "Show fewer Applied applications". |
| C11 | A row with the staleness warning | Reads as an image named "No activity for over 28 days — consider updating this application's status." while reading the row linearly — not an unlabelled group. |
| C12 | Table view | The table is announced as a real table with a caption ("19 tracked applications."), and column headers are read when moving between cells (`Ctrl+Alt+arrows` in NVDA). |

## D. Autofill flow

| # | Where / steps | Expect |
|---|---|---|
| D1 | `/app` → "Paste a Link" | Dialog announced "Paste a job link" + description; focus in the **Job URL** field, whose description mentions Greenhouse/Workday. |
| D2 | Submit a Greenhouse URL (`https://boards.greenhouse.io/acme/jobs/12345`) | While waiting: **"Fetching job details, please wait."** Then the review form opens with focus on **Company**, and the notice is announced: **"Filled in from this Greenhouse posting. Check the details below before saving."** |
| D3 | Submit an unsupported URL (`https://example.com/job/1`) | Same flow, with: **"We don't support autofill for this site yet… Your link is saved below — please add the rest yourself."** Confirm the pasted URL is in the Job URL field. |
| D4 | Close the review form with `Escape` | Focus returns to the **"Paste a Link"** button. |
| D5 | Repeat D1–D4 from the **mobile menu** at phone width | Same announcements; on close, focus returns to **"Open menu"**. |

## E. Analytics and recap

| # | Where / steps | Expect |
|---|---|---|
| E1 | `/app/analytics` on load | **"Loading dashboard..."** then **"Dashboard updated: N submitted applications in the selected range."** |
| E2 | Read a stat tile | "Total Applications, 17" as a term/definition pair — not a bare number. |
| E3 | **[RM]** Reload with reduce-motion on | The tile reads its **final value immediately**; no counting up. |
| E4 | Read the charts | Each chart's visual layer is skipped entirely; you get a summary then a real table — e.g. "Bar chart: 6 submitted applications, most common status Applied with 1. Full data follows." then Status/Applications/Share rows. Tabbing must **never** land inside a chart's SVG. |
| E5 | Pipeline flow chart: tab into it | Each node is a button named e.g. "Applied: 128 applications, 42 still in flight". |
| E6 | Change the range to "Custom" | Two date pickers appear; their triggers announce as **"Start, Pick a date"** and **"End, Pick a date"** — distinguishable. Picking a day closes the popover, returns focus to the trigger, and re-announces it with the date. |
| E7 | Set an invalid custom range | The error is announced and is read as the pickers' description. |
| E8 | "Generate recap" → the preview | Each slide announces as an **image** with the full alternative: "Strava recap image. JourneyJob recap for this week (2026-09-09 to 2026-09-15). … Stage totals: Applied 0, …". |
| E9 | Page the carousel (Previous/Next or the dots) | **"Recap design 2 of 3: Duolingo. One oversized headline stat over a two-tile grid."** Dots announce "Recap design 2 of 3, Duolingo" with the selected one current. |
| E10 | Download | **"Preparing your recap image..."** then **"Recap image downloaded as journeyjob-recap-week-strava.png."** Focus stays on the Download button. |
| E11 | Share (iOS VoiceOver, or any browser with Web Share) | The share sheet's text is the full summary, not just the headline. |

## F. Dialogs, menus, motion

| # | Where / steps | Expect |
|---|---|---|
| F1 | Open any dialog | The dialog's name and description are announced on open; focus is inside; `Tab` cycles **within** it and never escapes; `Escape` closes it and returns focus to whatever opened it. |
| F2 | Mobile width, open the menu | Announced as **"JourneyJob menu, dialog"**. Focus is trapped inside. |
| F3 | Mobile menu → "Analytics" | The sheet closes, the route announcement fires, and focus is in the main region — not left on the closed sheet. |
| F4 | Nav links | The current page's link reports as **current**. |
| F5 | **[RM]** Any page, reduce-motion on | Nothing moves continuously anywhere. Dialogs/popovers appear without animation. (The looping border light was removed outright, so it should be absent with or without the setting.) |
| F6 | Tab around with the screen reader off, in both themes | Every focused control has a clearly visible indicator, including nav links, footer links, inline text links, text fields and the primary/destructive buttons. |
