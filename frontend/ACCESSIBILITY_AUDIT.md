# jTracks Frontend — Accessibility Audit

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

1. **Dark mode is unreachable and unverified.** The `.dark` class is never applied — no toggle exists. Every `dark:` variant in `StatusBadge.tsx`, `STATUS_FOCUS_CLASSES` and the new autofill notice is therefore unexercised, and `status-breakdown-chart.tsx` hardcodes light-mode-only chart colours (its own comment lists dark-safe substitutes: `interviewing_oa #d97706`, `offer #059669`). **If a theme toggle ever ships, the entire status palette needs re-measuring in dark mode before release.** Needs a product decision on whether dark mode is in scope.

2. **The exported recap PNG has no text alternative.** `recap-dialog.tsx` downloads/shares a rendered image with no alt text and no accompanying text version. The on-screen card is fully accessible (real text plus the new Sankey data table), but the artifact the user shares is an opaque image. Fixing properly means deciding what accompanies a shared image — share text, a caption, an alt-text field — which is a product/design call. Flagging to **shadcn-ui-builder / product** rather than inventing copy here.

3. **Recharts tooltips remain pointer-only.** The visual charts are now hidden from assistive tech with equivalent data tables, which resolves the screen-reader gap. But a **sighted keyboard-only** user still cannot reach the per-point tooltip values — they can only read the axis labels and the permanent bar labels. Recharts ships an `accessibilityLayer` prop that adds keyboard navigation of data points; adopting it would conflict with the current `inert` approach and needs a deliberate decision about which model to use. Not a WCAG AA failure as it stands (the data is available in the tables), but a real usability gap.

4. **`role="group"` on every `Field` wrapper** (`src/components/ui/field.tsx`) produces unnamed groups throughout every form. Harmless but noisy in verbose screen reader modes. It's stock shadcn primitive code and changing it would diverge from upstream, so it's left alone deliberately.

5. **The custom date range reveal is not announced.** Selecting "Custom" in `DateRangeControl` reveals two new date pickers with no announcement. The pickers are adjacent in DOM and tab order so they are discoverable, and the toggle correctly reports `aria-pressed`. Adding `aria-expanded` to a toggle button would be off-pattern; a live region here felt like noise for marginal benefit. Low priority, noted for completeness.

6. **`ProtectedRoute` / `GuestRoute` loading states** render a bare "Loading..." `<div>` outside any landmark during auth hydration. It is transient and immediately replaced, so it was left alone; worth a `role="status"` if hydration ever becomes slow enough to notice.
