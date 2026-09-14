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

### Follow-up (2026-09-11): the literal-stack workaround is gone — a plain `@theme` fixes the cause

The fix above was correct about the diagnosis and worked, but it treated the symptom: it left the
Display stack written out **twice** (once in `@theme inline`'s `--font-display`, which the build
proved is never emitted and therefore dead, and once in the hand-written `@utility`), with nothing
keeping the two in sync.

The actual lever is the `inline` keyword, not the utility. `@theme inline` exists so a key whose
value is *itself* a `var()` reference (`--color-primary: var(--primary)`) is substituted rather
than frozen — which is exactly right for the `--color-*` block and exactly wrong for fonts, whose
values are literals that something has to be able to read back. Moving **only** the two font tokens
into their own plain `@theme` block:

- emits `--font-display` and `--font-sans` as real custom properties on `:root,:host`
  (grepped in the built CSS, then confirmed live: `getComputedStyle(document.documentElement)
  .getPropertyValue('--font-display')` returns the stack, where it previously returned `""`);
- makes Tailwind generate `.font-display { font-family: var(--font-display) }` **by itself** from
  the `--font-*` namespace, so the hand-written `@utility` was deleted;
- leaves `--default-font-family: var(--font-sans)` resolving correctly, so preflight's body stack
  is unchanged.

The Display stack is now written exactly once. Re-verified in a real browser at the same bar this
section demands, not by build output alone: landing `<h1>` and both section `<h2>`s compute to
`"Hedvig Letters Sans", ui-sans-serif, system-ui, sans-serif` at weight 400,
`document.fonts.check('400 1rem "Hedvig Letters Sans"')` is `true`, `<body>` computes to Roboto,
and `/` has no horizontal overflow.

**The generalisable rule, worth keeping:** in Tailwind v4, put a theme key in `@theme inline` only
when its value is a reference that must not be frozen. Any key whose value is a literal, and which
anything will read back through `var()` at runtime, belongs in a plain `@theme` — otherwise you get
a declaration that is invalid at computed-value time, wins the cascade anyway, and silently
computes to the inherited value.

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
- `--font-display` and `--font-sans`, each with a real fallback stack (`ui-sans-serif, system-ui,
  sans-serif`) after the family name, so a blocked/missing font file degrades to today's
  system-stack look rather than to Times. **They live in their own plain `@theme` block, not in
  `@theme inline`** — originally added to `@theme inline`, which is what caused the `.font-display`
  bug above; see the 2026-09-11 follow-up for why `inline` is wrong for literal-valued keys.
  `--font-sans` re-points both the `font-sans` utility *and* Tailwind preflight's body stack —
  this is what lands the "body copy"/"UI chrome" rows project-wide without touching a single
  component's className.
- **Fonts are theme-independent, unlike the color tokens F27/F28 established this same
  single-source-of-truth pattern for.** `--font-display`/`--font-sans` are declared once, in the
  font `@theme` block only — they are deliberately **not** duplicated into `:root`/`.dark`, and
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

**Fully verified 2026-09-13.** F35's recipe run end to end; the per-file byte/SHA table lives in
`FRONTEND_TASKS.md`'s F60 entry. Three results worth keeping here:

- **The trap this gate exists for is real and reproducible.** On a fresh page load,
  `document.fonts.status` is already `"loaded"` — a bare `await document.fonts.ready` resolves
  immediately — while `400 "Hedvig Letters Sans"` and `700 "Roboto"` both `check()` **false**. Two of
  the five faces the skins need are unfetched at the exact moment `ready` claims everything is done.
  That is the whole justification for load-then-ready rather than ready-alone, observed rather than
  argued.
- **Blocking a font proves the gate behaves correctly under failure.** With
  `Roboto-Bold.woff2` moved aside, the export **completed in 404 ms rather than hanging**, surfaced
  *"Recap fonts may not have finished loading (A network error occurred.); exporting anyway."* through
  `exportError` rather than swallowing or throwing it, and **visibly fell back**: 14,800 differing
  pixels (0.714% of the canvas) at a max channel delta of 240, spanning the three Roboto-700 hero
  figures. An export with a fallback font still beats no export, and the user is told.
- **Cold and warm exports are byte-identical for all three skins** — but note the honest limit: by the
  time Download is clickable the dialog has already rendered all three cards, which warms every face,
  so the diff proves reproducibility and absence of harm rather than proving the gate does work. The
  blocking test above is what proves that.

**One durable caveat for future diffs.** The **Duolingo skin is not byte-deterministic**: repeated
captures vary by 4 pixels out of 2,073,600 at a max channel delta of 2, in a single column on the
antialiased edge of its white stat tile. This is unrelated to fonts (a warm re-export matched a cold
one byte-for-byte while both differed from an earlier capture). F48's "byte-identical, so future
diffs are signal" therefore holds for Strava, Beli and both degenerate states, but the Duolingo
baseline needs a pixel-difference threshold instead — anything at or under ~10 px with a channel
delta ≤ 2 is noise, and a font regression is four orders of magnitude larger than that.

**Two environment gotchas that cost real time**, both worth checking before blaming the export path:
`.env` carries `VITE_ENABLE_MOCKS=false`, so the dev server must be started as
`VITE_ENABLE_MOCKS=true npx vite --port 5173` or requests reach the real backend (whose seeded account
has `hashed_password=None` and cannot password-login); and a stale `vite` process will silently hold
5173 while `--strictPort` kills the new one.

## F61 — re-verification sweep

**Complete, 2026-09-13.** The full per-cell table lives in `FRONTEND_TASKS.md`'s F61 entry; this
records the decisions and the traps worth carrying forward.

**Result: no regression.** Every cell of the matrix — `/`, `/login`, `/signup`, `/app` (Table, Board
and the 375px card list), `/app/analytics`, `/app/profile`, plus `ApplicationFormDialog`,
`AutofillDialog`, `ConfirmAppliedDialog` and `RecapDialog` across all three skins, in both themes at
both 375px and desktop — reports **zero axe violations with a non-zero evaluated-node count** (F47's
caveat honoured) and **zero horizontal overflow**. Every small-type role clears AA in both themes:
the tightest in-app value is the board's `(N)` column count at **4.62:1** light / 6.94:1 dark, and
the `TableCaption`, card/board `<dt>`s and timestamps, and `stat-tile.tsx`'s uppercase caption all sit
at 4.74:1 light / 6.94–7.66:1 dark.

**The three things a typeface swap was expected to break, and what actually happened:**

1. **Metrics.** `/` and `/app` still measure `scrollWidth === clientWidth` at 375px. The landing
   header changed shape rather than overflowing: it now **wraps to two rows**, wordmark above and
   actions below, with the action row ending at **208px** inside a 355px content box. That is the
   outer `flex-wrap` doing exactly the job its comment claims, engaging after R18 enlarged the logo —
   F44's old "~315px on one line" figure no longer describes the layout, but nothing overflows.
2. **Small-size legibility.** All AA, per above. The recap skins' `text-[9px]`/`text-[10px]` roles
   were read off the real 4× PNGs rather than the on-screen dialog, and range 5.24:1 (Duolingo's
   "Applications sent" at 11/600) to 13.84:1 (Strava's 6px Sankey labels).
3. **Perceived contrast.** `--primary` as body text — F29's 3.44:1 carry-over — **still has no
   caller**: a scan of every leaf text node on four routes for a computed colour matching `--primary`
   returned zero hits. F48's Strava scrim table reproduces exactly (13.84 / 9.76 over white). F50's
   Beli trio: `#c2381c` 4.98:1, `#14425a` 9.86:1, `#4a5b66` 6.48:1 — all AA.

**F59's flagged-open tabular-figures gap is closed, and the answer is mildly surprising.** Digits 0–9
in Roboto share a single advance width at both the stat-tile figure (700/24px → 13.775px) and the
small-meta role (400/12px → 6.75px). The *proportional* control measures identically — **Roboto's
default figures are already tabular**, so the `tabular-nums` declarations in `stat-tile.tsx` and the
recap skins are a harmless safety net rather than load-bearing. That is why the typeface swap never
disturbed digit alignment, and it means a future family swap must re-check this rather than assuming
`tabular-nums` will save it.

**Two measurement traps, both of which silently produce confident wrong answers:**

- **Contrast must be computed by rasterising the colour, not by parsing `getComputedStyle`.** This
  project's tokens are `oklch()`, and both `getComputedStyle().color` and canvas `fillStyle` hand
  `oklch(...)` straight back rather than normalising to `rgb()`. A regex parser returns `null` on
  every single token, and a sweep built on one measures nothing while reporting cleanly. Paint the
  colour into a 1×1 canvas and read the pixel back.
- **A background walker that only reads `background-color` misreads the Duolingo skin by a factor of
  three.** That skin's card is a `linear-gradient` — a background *image* — so the walk falls straight
  through it to the page behind, and the skin's own light-on-dark text gets scored against a white
  page: **1.63:1**, which looks like a catastrophic failure and is pure artifact. Measured against the
  actual painted pixels sampled from `recap-baseline-duolingo.png`, the same text is 5.24–8.45:1.

## Landing bundle-cost note (R10)

The font payload FV12 added is 111,032 bytes (~108.4 KiB) across 5 files, all self-hosted and
same-origin (F56's build check confirms zero third-party font-host requests). This is additive to
whatever R10's landing bundle-cost NFR was measured against before FV12; a future accounting of
that NFR should include this figure.
