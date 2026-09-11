# Typography decision record (R17 / Milestone FV12)

Per the PRD's Documentation NFR (following F29's precedent for `docs/decisions/
magicui-conventions.md`'s palette record), recording the typeface decisions made in FV12
(F55–F62) here, in `docs/decisions/`, rather than only in commit messages — one file per
decision, matching `sankey-library.md`/`cookie-topology-samesite.md`/`scheduler-mechanism.md`.
This is a sibling doc, not a section inside `magicui-conventions.md`: that doc's scope is
MagicUI usage specifically (its palette section exists because MagicUI components take color
props *directly*, e.g. `BorderBeam`'s `colorFrom`/`colorTo` — a real coupling). No MagicUI
component takes a font, so typography would be an unrelated tenant there.

## Correction (2026-09-10): `.font-display` never actually worked until this fix

F56–F59 were originally checked off on `npm run build` success plus `grep` evidence alone. A
real-browser verification session (`claude-in-chrome`) found that **every Display heading
computed to Roboto, not Hedvig Letters Sans**, despite `.font-display` being present in the
compiled CSS and correctly matching (`h1.matches('.font-display')` => `true`). `npm run build`
succeeding and a utility's selector matching are both necessary but **not sufficient** proof — the
only real proof is `getComputedStyle` in a live browser, and F58/F59 carry the same caveat even
though their fix turned out to already be correct once F56's bug was fixed (see below).

**Root cause:** `@theme inline` (used here deliberately so `--font-sans` can drive Tailwind's
build-time `--default-font-family` substitution) never emits `--font-display` as an actual runtime
CSS custom property — Tailwind inlines `@theme inline` values directly into *its own* generated
utilities at build time instead of keeping them queryable. The hand-written
`@utility font-display { font-family: var(--font-display); }` compiled and matched, but
`var(--font-display)` resolved to nothing, making the declaration invalid at computed-value time —
which still *wins* the cascade (a browser doesn't discover the invalid `var()` until after cascade
resolution) and only then falls back to the inherited value, silently. `!important` and moving the
rule outside any `@layer` were both tried first and both failed, because the actual defect had
nothing to do with cascade order.

**Fix:** reference the literal fallback stack directly in the utility instead of a `var()` this
theme mode never provides:

```css
@utility font-display {
  font-family: "Hedvig Letters Sans", ui-sans-serif, system-ui, sans-serif;
}
```

**Re-verified correct after the fix**, via `getComputedStyle` in a real logged-in browser session,
not assumed: the landing hero `<h1>`, both section `<h2>`s, all four wordmark instances (including
the recap card's `RecapFooter`, inside the `html-to-image` export subtree), `CardTitle` on
Login/Signup (600, Roboto), the analytics stat-tile figure (700, Roboto), and all three recap
skins' hero stats (700, Roboto) plus the Beli headline (400, Hedvig — see below). See
`FRONTEND_TASKS.md`'s F56 correction note for the full diagnostic trail.

## The two families and their licenses

**Display — [Hedvig Letters Sans](https://fonts.google.com/specimen/Hedvig+Letters+Sans)**
(Kanon Foundry; Google Fonts, SIL Open Font License 1.1).
**Text — [Roboto](https://fonts.google.com/specimen/Roboto)** (Google Fonts, Apache License 2.0).

Both are self-hosted under `frontend/src/assets/fonts/` — never a runtime
`fonts.googleapis.com`/`fonts.gstatic.com` `<link>`/`@import`, which would pull a third-party
request into the landing page's critical path and violate R10's landing bundle-cost NFR.
License texts (`OFL.txt`, `LICENSE-Apache-2.0.txt`) and a `README.md` recording the exact fetch
recipe live alongside the font files. Neither license requires an in-app attribution string.

Files and byte sizes (F55):

| File | Weight | Bytes |
|---|---|---|
| `HedvigLettersSans-Regular.woff2` | 400 | 22,468 |
| `Roboto-Regular.woff2` | 400 | 21,884 |
| `Roboto-Medium.woff2` | 500 | 22,200 |
| `Roboto-SemiBold.woff2` | 600 | 22,240 |
| `Roboto-Bold.woff2` | 700 | 22,240 |

**Total: 5 files, 111,032 bytes (~108.4 KiB).** All `latin`-subset static instances (not variable
fonts), downloaded via `fonts.googleapis.com/css2` with a modern-browser `User-Agent` header
(required — without it Google serves legacy `.ttf`/`.woff` instead of `.woff2`).

## Verified weight-availability finding

Checked directly against the live `fonts.googleapis.com/css2` API, not assumed:

- **Hedvig Letters Sans is a single-weight family.** `wght@600` (or any weight other than 400)
  returns `400 Bad Request`. A combined `family=Hedvig+Letters+Sans:wght@400;500;600;700` request
  is not how this was tested (600 alone already 400s); testing weight 400 alone succeeds and
  returns a normal-style 400 face plus a 400 italic (the italic is not used anywhere in the
  shipped mapping below). Anyone re-deriving this later should not chase a fetch error — it's the
  typeface's own design brief ("drawn in one weight" for the Hedvig insurance brand), confirmed,
  not a bug.
- **Roboto genuinely supports 400/500/600/700 as independent static files** — but a **combined**
  request (`family=Roboto:wght@400;500;600;700`) returns a distinct `@font-face` block per weight
  in its `latin`-subset CSS, with all four blocks pointing at the *same* underlying file URL. That
  file is Roboto Regular's metrics; naively downloading it once and reusing it for all four
  weights would have silently shipped four identical (400-weight) files under four different
  names. Each weight was therefore fetched with its **own single-weight query**
  (`family=Roboto:wght@<weight>`), which does return four genuinely distinct files — confirmed by
  diffing the four resulting URLs (and the four `.woff2` files' byte sizes, all different) before
  treating the download as done. Recorded here so a future re-download doesn't repeat the
  combined-request mistake.
- No italic is used anywhere in the shipped app. No dedicated monospace family was added —
  `components/ui/chart.tsx`'s `font-mono` is the only such reference in the project and stays
  out of scope (R17.2), untouched by this milestone.

## Role mapping, as shipped

R17.1's original table assumed Display could carry 700 for "big number" emphasis roles. Since
Hedvig Letters Sans has no weight beyond 400, that forced a reassignment: **Display stays
identity/headline-only at its one weight, and the "big number" roles move to Text (Roboto) at
700** — a real file, and a well-tested choice for numeric/data display in its own right.

| Role | Surface | Family | Weight | Status |
|---|---|---|---|---|
| Hero H1 | `LandingPage.tsx:255` | Display (Hedvig Letters Sans) | 400 | Changed (was `font-semibold`) |
| Section H2 ×2 | `LandingPage.tsx:303`, `:435` | Display | 400 | Changed (was `font-semibold`) |
| Logo wordmark ("jTracks") ×4 | `LandingPage.tsx`'s `Wordmark` (header+footer), `AppLayout.tsx:135` (desktop), `AppLayout.tsx:193` (mobile Sheet), `recap-skins/shared.tsx:139` (`RecapFooter`) | Display | 400 | Changed (was `font-semibold`/inherited) |
| Stat-tile numbers (`NumberTicker`) | `stat-tile.tsx:73` `<dd>` | **Text** (Roboto) | **700** | Changed (was `font-semibold`, and stays off Display per R17.1's reassignment) |
| Recap hero stats | `strava-skin.tsx:132` | Text | 700 | Already correct |
| | `duolingo-skin.tsx:80` | Text | 700 | **Changed from `font-black` (900, unsourced)** |
| | `duolingo-skin.tsx:108` | Text | 700 | Already correct |
| | `beli-skin.tsx:94` | Text | 700 | Already correct |
| App page H1 (Applications/Analytics/Settings) | `ApplicationsPage.tsx:247`, `AnalyticsPage.tsx:47`, `SettingsPage.tsx:83` | Text | 600 | Already correct (`font-semibold`) — family arrives free via `--font-sans` |
| App page H1 (Login/Signup) | `login-form.tsx:97`, `signup-form.tsx:106` — nested in shadcn's `CardTitle` | Text | 600 | **Changed at the two call sites** (`className="font-semibold"` on `CardTitle`) — see decision below |
| Hero eyebrow, product-visual H3s, feature-trio H3, footer nav H2 | `LandingPage.tsx` (eyebrow, two visual H3s, feature H3, footer H2) | Text | 500 | Already correct (`font-medium`) |
| Body copy | paragraphs, subheads | Text | 400 | Free via `--font-sans`/preflight |
| UI chrome (buttons, table head/cell, form labels, badges) | app-wide shadcn defaults | Text | 400–500 | Audited (F58): `Button`/`TableHead`/`Label`/`Badge` all `font-medium` (500); `TableCell`/`TableCaption` inherit body 400. No chrome component found above 500. |
| Meta/caption | table caption, card-list/board timestamps | Text | 400 | Audited, unchanged |

**`CardTitle` decision (F58):** `components/ui/card.tsx`'s `CardTitle` default is `font-medium`
(500), not the 600 R17.1's app-H1 row requires. `CardTitle` is also used, at its default weight,
for lighter sub-section titles elsewhere (`SettingsPage.tsx`'s "Ghosting", `AnalyticsPage.tsx`'s
"Status breakdown"/"Applications over time"/"Pipeline flow") that are **not** page H1s and were
never in scope for this change. Rather than bump the shared primitive to 600 (which would also
promote those unrelated sub-section titles), the weight was overridden at the two call sites that
actually are page H1s — `login-form.tsx` and `signup-form.tsx` — via `className="font-semibold"`
on `CardTitle`. `CardTitle`'s own default (500) is unchanged for every other caller.

**Beli headline call (F59):** `beli-skin.tsx:77`'s headline ("`in applications`", originally
`text-[26px] leading-[1.05] font-black tracking-tight uppercase`) is a headline, not a stat, and
R17.1's table doesn't name it. Per the milestone's stated default, it was treated as **Display
(Hedvig 400)** rather than Text 700 — `font-display font-normal`, keeping the existing
size/tracking/uppercase treatment as the compensation for losing the weight. **Resolved, 2026-09-10:**
verified in a real browser against real "All time" data (17 applications) — the headline renders
correctly in Hedvig Letters Sans 400 and the card holds it fine at that size. No fallback to Text
700 is needed; this is no longer an open question.

**No component hardcodes a font-family string** (R17.3) — grepped `frontend/src/` for
`font-family`; the only five hits are the `@font-face` blocks in `index.css` itself. Every
component-level typeface choice goes through the `font-display`/`font-sans` Tailwind utilities
(or inherited defaults), never a literal family name.

## Token mechanism (F56)

`frontend/src/index.css`:

- Five `@font-face` blocks (one Hedvig + four Roboto), placed after the three `@import`s and
  before `:root`. Each declares a single real `font-weight` (never a range — a ranged
  `font-weight` on a static file makes the browser synthesize a weight instead of loading the
  correct file), `font-style: normal` (no italic shipped), and `font-display: swap` (R17.5's
  deliberate default — a brief fallback-font flash on first load is standard and acceptable for
  this project, not an open question).
- `--font-display` and `--font-sans` added to the existing `@theme inline` block, each with a
  real fallback stack (`ui-sans-serif, system-ui, sans-serif`) after the family name, so a
  blocked/missing font file degrades to today's system-stack look rather than to Times.
  `--font-sans` re-points both the `font-sans` utility *and* Tailwind preflight's body stack —
  this is what lands the "body copy"/"UI chrome" rows project-wide without touching a single
  component's className.
- **Fonts are theme-independent, unlike the color tokens F27/F28 established this same
  single-source-of-truth pattern for.** `--font-display`/`--font-sans` are declared once, in
  `@theme inline` only — they are deliberately **not** duplicated into `:root`/`.dark`, and
  `index.css` carries a comment saying so, so a future session doesn't "fix" the asymmetry.
- `font-synthesis-weight: none` added in `@layer base`. Hedvig has exactly one real weight, so a
  stray `font-semibold`/`font-bold` on a Display element would otherwise render as a
  browser-synthesized fake bold — which looks merely "fine" on screen and then serializes into
  the recap export (R17.4). Roboto never needs synthesis (all four sourced weights are real
  files), so this costs nothing there.

Verified against a real `npm run build`: all five `.woff2` files are emitted, fingerprinted, into
`dist/assets/`; the built CSS references the fingerprinted filenames and carries `font-display:swap`
on every face; grepping the built CSS and the whole `frontend/src/` tree for
`fonts.googleapis`/`fonts.gstatic` returns nothing except this doc's own prose and
`frontend/src/assets/fonts/README.md`'s explanation of the fetch recipe (neither is a runtime
reference). `tsc -b` and `oxlint` are both clean after every FV12 code change.

## Export-path font gate (F60)

`recap-dialog.tsx`'s `exportCardToBlob()` now awaits font readiness before the `toBlob(card, {
pixelRatio: EXPORT_PIXEL_RATIO })` call, via a new `ensureRecapFontsLoaded()` helper:

```ts
const REQUIRED_RECAP_FONTS = [
  '400 1rem "Hedvig Letters Sans"',
  '400 1rem "Roboto"',
  '500 1rem "Roboto"',
  '600 1rem "Roboto"',
  '700 1rem "Roboto"',
] as const

async function ensureRecapFontsLoaded(): Promise<void> {
  try {
    await Promise.all(REQUIRED_RECAP_FONTS.map((font) => document.fonts.load(font)))
    await document.fonts.ready
  } catch (err) {
    setExportError(/* ... surfaced, not swallowed ... */)
  }
}
```

**Why `document.fonts.ready` alone isn't enough** (the trap this milestone named explicitly):
`ready` only settles *pending* loads. A face no rendered node has requested yet isn't pending, so
`ready` can resolve cleanly while a face the card needs was never fetched at all — e.g. right
after a cold page load, before anything on screen has asked for Roboto 700. The fix is to
explicitly `document.fonts.load()` every face the skins actually render (listed in
`REQUIRED_RECAP_FONTS`, matching the family/weight audit in the role-mapping table above,
including Roboto 400 for unstyled text like `RecapFooter`'s date range) *before* awaiting `ready`
for the whole set to settle. The rejection path is guarded so a font-loading failure can't kill
Download/Share outright — an export with a fallback font still beats no export — but the failure
is surfaced through the existing `exportError` state rather than silently swallowed.

Re-baselining recipe (F35's, reused verbatim per the milestone's instruction): a local Node
receiver writing `POST /save?name=<n>` bodies into `frontend/reference/`, `URL.createObjectURL`
patched to `fetch` the blob to it, `HTMLAnchorElement.prototype.click` no-op'd for `[download]`
anchors, dev server on port 5173, Chrome window visible, a `blob.type === "image/png"` guard, and
a real refetch forced by changing the range rather than restoring a stubbed `fetch`.

**Partial verification, 2026-09-10 via claude-in-chrome:** a real export was run (logged in as the
mock user, Analytics page, All-time range, Duolingo skin, clicked Download) and completed cleanly —
no `exportError`, no console errors, and the dialog's own status region announced the download.
This confirms the gate doesn't break the happy path, but is **not** the task's actual acceptance
bar. **Still outstanding:** no cold-cache-vs-warm-cache byte diff, no deliberate font-blocking test,
and the five `frontend/reference/*.png` baselines are still **not** regenerated (still pre-FV12
typeface). `FRONTEND_TASKS.md`'s F60 entry stays unchecked for exactly this reason — a future
session needs to run F35's recipe end-to-end to actually produce and diff those bytes.

## F61 — re-verification sweep

**Partial, 2026-09-10 via claude-in-chrome** — see `FRONTEND_TASKS.md`'s F61 entry for full detail.
Covered and confirmed: landing page and `/login` at a genuine 375px viewport (same-origin iframe,
since `resize_window` is a no-op in this environment) with zero horizontal-scroll margin, matching
F44's prior finding rather than regressing it; the landing header still fits one line with the new
Hedvig wordmark; dark mode via the real theme toggle on `/app/analytics` including the open
`RecapDialog`, legible with no obvious contrast issues.
**Not covered:** `/app` Table+Board, `/app/profile`, `/signup`, `ApplicationFormDialog`,
`AutofillDialog`, `ConfirmAppliedDialog`; no axe run at all; no contrast re-measurement of the
specific borderline values on record (`--primary` body text at 3.44:1, the Strava scrim table, the
Beli hex trio); no pixel-measured tabular-figure digit-width check. `FRONTEND_TASKS.md`'s F61 entry
stays unchecked; a future session should finish this matrix rather than redo what's confirmed above.

## Landing bundle-cost note (R10)

The font payload FV12 added is 111,032 bytes (~108.4 KiB) across 5 files, all self-hosted and
same-origin (F56's build check confirms zero third-party font-host requests). This is additive to
whatever R10's landing bundle-cost NFR was measured against before FV12; a future accounting of
that NFR should include this figure.
