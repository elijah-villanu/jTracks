# MagicUI conventions

Companion to `.claude/rules/magicui-ui.md` (the enforceable, auto-loaded checklist every
session reads). That file says *when* to reach for MagicUI at all; this one is the fuller
rationale plus the concrete values — timing, easing, color tokens, restraint rules — so a
MagicUI accent on page B actually reads as the same design language as one on page A instead of
each agent inventing its own numbers. Written from the real decisions made wiring up the
Analytics page (`frontend/src/routes/AnalyticsPage.tsx`), the first page to use MagicUI in this
project — update both the conventions below **and** the inventory at the bottom whenever a
future page adopts MagicUI, so this stays a living registry instead of going stale like a
one-off design note.

## The one rule that matters most: reduced motion

MagicUI components animate via **Motion** (`motion/react`, formerly Framer Motion) — springs and
WAAPI, not plain CSS `animation`/`transition` properties. `frontend/src/index.css` already has a
global `@media (prefers-reduced-motion: reduce)` block that neutralizes every CSS-driven
animation in the app (dialogs, popovers, Recharts' mount animation), but **that block cannot
reach Motion-driven components** — a `NumberTicker` or `BorderBeam` would keep animating for a
user who has explicitly told their OS to reduce motion, silently regressing WCAG 2.3.3.

The fix is one line, done once, at the app root (`frontend/src/main.tsx`):

```tsx
import { MotionConfig } from "motion/react"

<MotionConfig reducedMotion="user">
  {/* ...the whole app... */}
</MotionConfig>
```

This makes **every** `motion.*` element anywhere under it — current and future, any page —
automatically honor the OS setting: reduced-motion users get the final frame instantly instead
of the animation. **Never re-implement this per-component** (no per-component
`useReducedMotion()` checks, no bespoke media-query branching) — the provider already covers it
for anything installed through the normal MagicUI CLI workflow. If a future MagicUI component
doesn't respect `MotionConfig` (rare — check its source via `getRegistryItem` first), that's a
signal to reconsider using it, not to work around it locally.

## Approved components (so far)

Only what's actually been used and verified in this project. This list grows as real pages adopt
MagicUI — it is not a pre-approval of MagicUI's full catalog. Anything not listed here still
requires the discovery → inspect-real-source → CLI-install workflow in
`.claude/rules/magicui-ui.md` before use, same as these were.

| Component | Use it for | Not for |
|---|---|---|
| `border-beam` | A single slow, looping light traveling a container's border — the **one** continuous accent marking the single most important element in a view. | Multiple simultaneous instances on one screen (reads as noise, not emphasis). Structural/interactive elements — it's a decorative overlay, never a substitute for focus rings or other real state indicators. |
| `number-ticker` | Counting a KPI number up to its real value on mount — dashboards/stat tiles where the number *is* the content. | Text that isn't actually numeric, or numbers a user needs to read immediately/repeatedly (e.g. inside a live-updating table cell) — the count-up delay works against fast scanning there. |
| `blur-fade` | A subtle once-per-mount entrance for a content group (a stat row, a chart, a card) — signals "this just loaded" without being a distraction. | Anything that needs to re-trigger on every state change (it's an entrance, not a state-transition effect) — don't wrap something that re-renders on every keystroke/filter change. |

Other components explicitly discussed but **not yet used anywhere** (fine to introduce later
following the same workflow, but don't assume they're the right call by default): `shimmer-button`,
`animated-shiny-text`, `magic-card`, `shine-border`, `marquee`, `animated-beam`. Save
attention-grabbing effects (`meteors`, `particles`, confetti-style bursts) for something that
actually calls for celebration (e.g. a first-offer milestone) — not general page decoration.

## Timing, easing, and restraint

These are the values actually in use — keep new MagicUI usage consistent with them rather than
picking new numbers per page:

- **Entrance (`BlurFade`).** Component defaults, unchanged: `duration=0.4s`, `ease="easeOut"`,
  `offset=6px`, `direction="down"` (content drops slightly into place while fading in and
  un-blurring), `blur="6px"`. Only `delay` is customized per group.
- **Staggering multiple entrance groups on one page.** A fixed `0.08s` step between sibling
  `BlurFade` groups (group *N* gets `delay = 0.08 * N`), so the page reveals top-to-bottom in a
  quick, barely-perceptible cascade rather than everything popping in at once *or* an
  annoyingly-slow reveal. Don't stagger individual items within a group (e.g. each of five stat
  tiles) — stagger *groups*, or the page takes too long to finish settling.
- **Continuous accent (`BorderBeam`).** `duration=8s` — slow enough to read as ambient, not
  attention-grabbing. **At most one `BorderBeam` (or any other continuous/looping accent) visible
  per view at a time**, reserved for the single most important element (a page's headline KPI,
  not every card). Entrance animations are exempt from this "one at a time" rule since they run
  once and settle — only *continuous/looping* accents are rationed.
- **Counters (`NumberTicker`).** Component's default spring (`damping: 60, stiffness: 100`) —
  don't override unless a specific tile has a concrete reason to feel snappier/slower than the
  rest. Always pass the real number via `numericValue`/`value`, never re-derive or approximate it
  for the animation.

## Theming — never ship MagicUI's hardcoded defaults

`frontend/components.json` still fixes `baseColor: "neutral"`, but as of F27/F28 (FV6) the
palette is **no longer entirely grayscale** — `--primary`/`--ring` (and the `--sidebar-primary`/
`--sidebar-ring` pair) now carry a real accent hue, and the status palette lives in `--status-*`
tokens. See "Palette decision record (F27/F28)" below for the actual values, rationale and
measured contrast. MagicUI's own defaults are still not this project's tokens (`border-beam`'s
default gradient is `#ffaa40` → `#9c40ff`; `number-ticker`'s default text color is literal
`text-black dark:text-white`). Per `.claude/rules/magicui-ui.md`'s theming-discipline rule,
always override these at the call site with the project's CSS variable tokens instead of the
component's raw defaults:

```tsx
<BorderBeam colorFrom="var(--foreground)" colorTo="var(--muted-foreground)" />
<NumberTicker className="text-foreground dark:text-foreground" />
```

Don't edit the installed `frontend/src/components/ui/*.tsx` files themselves to hardcode the
project's colors in — override via props/`className` at each usage instead, so the installed
file stays a clean, up-to-date mirror of upstream MagicUI and can be re-synced later without
losing local edits.

## Palette decision record (F27/F28)

Per the PRD's Documentation NFR, the theming decisions made in FV6 (`frontend/src/index.css`),
recorded here rather than only in commit messages so a future session doesn't have to re-derive
them.

**F25 shipped the mechanism first**: `.dark` on `<html>`, toggled by `frontend/src/lib/theme-context.tsx`
(`ThemeProvider`/`useTheme`), persisted to `localStorage` under `jtracks_theme`, with a
synchronous inline script in `index.html`'s `<head>` applying the class before first paint (no
flash) and `color-scheme` set on both `:root` and `.dark`. `system` subscribes to
`matchMedia("(prefers-color-scheme: dark)")` live, not just at mount. This made every `dark:`
class already in the tree — and the two token decisions below — actually reachable for the first
time.

**F27 — accent hue: teal (`h ≈ 195`).** `--primary`/`--ring` were zero-chroma
(`oklch(... 0 0)`) before this; `--chart-1`..`--chart-5` and the rest of the grayscale base are
*not* part of this change (R11.2 is explicit that only one accent hue gets added, everything else
stays neutral). Teal was picked because it's the one major hue the status palette below doesn't
already occupy — `applied` #3b82f6 (~hue 260), `interviewing_oa` #f59e0b (~70), `offer` #10b981
(~165), `rejected` #ef4444 (~27), `failed` #ec4899 (~0), `ghosted` #8b5cf6 (~293) — so a primary
button or focus ring never reads as a status chip.

Final values:

| Token | `:root` | `.dark` |
|---|---|---|
| `--primary` | `oklch(0.62 0.11 195)` | `oklch(0.75 0.11 195)` |
| `--primary-foreground` | `oklch(0.145 0 0)` | `oklch(0.145 0 0)` |
| `--ring` | `oklch(0.60 0.10 195)` | `oklch(0.66 0.10 195)` |
| `--sidebar-primary` | same as `--primary` | same as `--primary` |
| `--sidebar-primary-foreground` | same as `--primary-foreground` | same as `--primary-foreground` |
| `--sidebar-ring` | same as `--ring` | same as `--ring` |

Two values changed from the starting numbers during measurement, both because the math forced
it, not by eyeballing:

- **`--primary-foreground` is near-black in *both* themes**, not light-on-dark in light mode and
  dark-on-light in dark mode the way the old zero-chroma pair was. At this hue/lightness, a
  white-ish foreground fails badly in both themes (measured 3.29:1 light, 2.04:1 dark — both under
  the 4.5:1 text floor); near-black clears both comfortably (5.75:1 light, 9.31:1 dark).
- **`--ring` in `:root` is `L=0.60`, not the initially proposed `L=0.66`.** At `0.66` it only
  cleared 2.97:1 against this theme's white `--background`/`--card` — just under the 3:1 AA floor
  for non-text (focus rings, borders). Dropping to `L=0.60` clears 3.77:1. `.dark`'s `--ring`
  stayed at the original `0.66` — it clears 6.65:1 (`--background`) / 6.02:1 (`--card`) there, no
  adjustment needed.

Measured contrast (WCAG AA: 4.5:1 text, 3:1 non-text), all against this file's real token values:

| Pair | Light | Dark |
|---|---|---|
| `--primary-foreground` on `--primary` (Button default, skip link) | 5.75:1 | 9.31:1 |
| `--primary-foreground` on `--primary/80` (Button hover) | 7.39:1 | 6.20:1 |
| `--ring` on `--background`/`--card` (focus border/outline — Button's `focus-visible:border-ring`, `applications-table.tsx`'s `SortButton` and staleness warning's `focus-visible:outline-ring`) | 3.77:1 | 6.65:1 / 6.02:1 |
| `text-primary` (Briefcase logo icons, decorative — non-text 3:1 floor applies, not 4.5:1) | 3.44:1 | 9.31:1 |

One thing intentionally *not* fixed: the `Button`/`Badge` `link` variant and `field.tsx`'s
`[&>a:hover]:text-primary` use `--primary` as literal body text, which only clears 3.44:1 in light
mode (under 4.5:1). Grepped for real usages — neither the `link` Button/Badge variant nor that
hover rule is actually invoked anywhere in this app's own components today (checked via `grep
'variant="link"'` and `'text-primary\b'`), so this isn't a live failure, but flag it before either
gets used: `--primary` needs a darker light-mode value, or those call sites need their own
darker-text override, before shipping primary-colored body text.

**F28 — status palette promoted to tokens, dark-mode-aware.** `STATUS_BREAKDOWN_COLORS`
(`status-breakdown-chart.tsx`) moved from hardcoded hex to `var(--status-*)` references, backed by
new tokens in both `:root` and `.dark`, mapped through `@theme inline` as
`--color-status-*`. `sankey-chart.tsx` now takes an optional `colors` prop so it isn't hardwired
to one map. `StatusBadge.tsx`'s `STATUS_COLOR_CLASSES`/`STATUS_FOCUS_CLASSES`/`STATUS_CELL_CLASSES`
already carried `dark:` variants (untested assumptions, written before dark mode was reachable) —
re-measured against the real dark theme, unchanged (all pass, see numbers below).

| Status | `:root` | `.dark` |
|---|---|---|
| `saved` | `#94a3b8` | `#94a3b8` (never rendered in the breakdown/Sankey; present for the `Record` type) |
| `applied` | `#3b82f6` | `#3b82f6` |
| `interviewing_oa` | `#f59e0b` | `#d97706` |
| `offer` | `#10b981` | `#059669` |
| `rejected` | `#ef4444` | `#ef4444` |
| `failed` | `#ec4899` | `#ec4899` |
| `ghosted` | `#8b5cf6` | `#8b5cf6` |

`interviewing_oa`/`offer` swap to a darker pair in dark mode (values this codebase had already
proposed before dark mode existed); the other four are unchanged across themes. Measured against
dark `--background`/`--card`: `applied` 5.38:1/4.87:1, `interviewing_oa` 6.21:1/5.62:1, `offer`
5.25:1/4.75:1, `rejected` 5.26:1/4.76:1, `failed` 5.61:1/5.08:1, `ghosted` 4.67:1/4.23:1 — all
clear AA non-text (3:1) with margin. Worth noting honestly: the *un-swapped* light hexes actually
measure even higher against a dark background (`interviewing_oa` 9.22:1, `offer` 7.80:1) — the
swap isn't required by contrast math, it's kept for the reduced-saturation/glare reasoning the
original "dark-safe" proposal intended, and both are comfortably passing AA either way. Light mode
is unchanged from before: `interviewing_oa` 2.15:1 and `offer` 2.54:1 sit in the same sub-3:1 WARN
band the original doc comment already flagged — still legal only because every bar carries a
permanent visible count/percentage label (WCAG 1.4.1), not new to this change.

`StatusBadge.tsx`'s dark badge text clears 8:1+ against its own tinted `bg-x-900/50` (composited
over dark `--background`/`--card`) for every one of the 7 statuses; `STATUS_FOCUS_CLASSES`'
dropdown-highlight text clears 8:1+ too; `STATUS_CELL_CLASSES`' table-row tint (very subtle,
`bg-x-950/30`) leaves default `--foreground` text at 17:1+. No values changed.

**Export-serialization result (`RecapCard`'s Sankey, R12.5/R11.4):** `RecapCard` does **not** use
the `var(--status-*)`-backed `STATUS_BREAKDOWN_COLORS` for its embedded `SankeyChart` — it passes
a separate, fixed `STATUS_LITERAL_COLORS` map (the original literal hexes) instead, via
`sankey-chart.tsx`'s new `colors` prop. Reasoning, worked through at the code level (no live
browser was available this session to run an actual `toBlob` export, so this is a reasoned
conclusion from `html-to-image`'s own source, not an observed screenshot):
`node_modules/html-to-image/es/clone-node.js`'s `cloneCSSStyle` reads `window.getComputedStyle`
on the *original* node and copies the resolved `cssText` (or, in its Firefox-`cssText`-empty
fallback branch, every enumerated property including `fill`/`stroke`) onto the *cloned* node as an
inline style before serializing to SVG. `getComputedStyle` always returns already-resolved
values — a `fill="var(--status-applied)"` attribute's computed value is a concrete color, not the
literal `var(...)` string — so the clone step likely *does* bake in a real color rather than
producing a blank/unstyled shape. That is exactly the problem: it bakes in whichever theme is
active on `<html>` at the moment of export, coupling the recap PNG's colors to the exporting
user's *current* theme — precisely what the spec forbids (`RecapCard` renders its own fixed dark
gradient regardless of app theme, and the exported PNG has no theme context to be "correct" for
later). `STATUS_LITERAL_COLORS` sidesteps the question entirely by never containing a `var()` in
the first place: same literal hexes this card already rendered against its own dark background
before dark mode existed, so the export is unchanged and permanently theme-independent either way.

**Known permitted hardcoded-color exceptions** (found via `grep` for `#`/`oklch(`/`rgb(` in
`src/` outside `index.css`, per F29's token-discipline audit):

- `recap-card.tsx`'s `from-slate-900 via-slate-800 to-slate-950` gradient — explicitly permitted,
  the card's own self-contained chrome (R11.4).
- `status-breakdown-chart.tsx`'s `STATUS_LITERAL_COLORS` (6 literal hexes) — the export-path
  exception above.
- `border-beam.tsx`'s installed-component default props (`colorFrom = "#ffaa40"`,
  `colorTo = "#9c40ff"`) and its arbitrary-value CSS mask (`linear-gradient(#000,#000)`) — MagicUI
  registry file defaults/plumbing, never hand-edited per this doc's own theming rule; every real
  call site already overrides `colorFrom`/`colorTo` with token `var()`s.
- `chart.tsx`'s `[&_.recharts-*[stroke='#ccc']]:stroke-border` / `[stroke='#fff']:stroke-transparent`
  rules — these are CSS attribute *selectors* matching Recharts' own internally-hardcoded stroke
  attributes, immediately remapped to token classes; installed shadcn chart boilerplate, not a
  color this app chose.

**Findings not fixed in this pass** (outside F27/F28's stated scope; flagged for whoever does
F29's full sweep):

- `applications-over-time-chart.tsx`'s `TREND_COLOR = "#3b82f6"` — its own doc comment says it
  deliberately reuses "the same blue already used for 'applied' everywhere else," which is now
  literally `--status-applied`. Contrast already passes in both themes (5.38:1/4.87:1 dark), so
  this isn't a failure, just a duplicated literal that could read `var(--status-applied)` instead.
- `applications-table.tsx`'s staleness warning (`text-amber-700 ... dark:text-amber-500`) and
  `application-form-dialog.tsx`'s autofill notice banner (`border-emerald-600/40 bg-emerald-50
  text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100` / the amber equivalent) — two
  pre-existing, unrelated ad hoc semantic colors (staleness, autofill-confidence tone), each
  already carrying `dark:` variants. Not part of F27/F28's described scope, so the literals were
  left as-is — but they **have** since been driven and measured in both themes as part of F29's
  sweep (5.03:1/9.27:1 and 8.73:1–15.42:1 respectively; see the sweep table below). They pass
  comfortably, so this is a tidiness note about staying outside the token layer, not a contrast
  risk.

**F29 live both-theme sweep (performed in a real browser).** Run against the dev server with MSW
fixtures (`VITE_ENABLE_MOCKS=true`, shell override — `frontend/.env.local` points at a real backend
and was deliberately left untouched). Every surface below was opened and looked at in *both*
themes; this is an observed checklist, not a code-reasoned one.

| Surface | Light | Dark | Notes |
|---|---|---|---|
| `/login` | ✅ | ✅ | Teal primary + near-black label legible in both; destructive error banner ("Invalid email or password.") checked in dark |
| `/signup` | ✅ | ✅ | No theme control here — expected, the landing/auth control is F43's scope, not F26's |
| `/` tracker table + toolbar | ✅ | ✅ | All 7 statuses distinguishable; `rejected` (red) vs `failed` (pink) unmistakable in both (F10's standing constraint holds) |
| `/analytics` stat tiles | ✅ | ✅ | `NumberTicker` values and `BorderBeam` accent both read correctly on a dark card |
| `/analytics` status-breakdown chart | ✅ | ✅ | `var(--status-*)` fills resolve per theme; `interviewing_oa`/`offer` visibly swap to `#d97706`/`#059669` in dark |
| `/analytics` applications-over-time chart | ✅ | ✅ | |
| `/analytics` Sankey (`Pipeline flow`) | ✅ | ✅ | Node fills, ribbon strokes and white in-flight labels all legible in dark |
| `DateRangeControl` + open `Calendar` popover | ✅ | ✅ | Popover surface, day grid, out-of-month dimming and the teal focus ring all correct in dark |
| `/profile` (Settings) | ✅ | ✅ | |
| `ApplicationFormDialog` | ✅ | ✅ | Native `<input type="date">` controls follow the theme — dark fields/light picker glyph in dark, inverted in light. This is F25's `color-scheme` doing real work; without it they'd be white boxes on a dark dialog. |
| `AutofillDialog` | ✅ | ✅ | |
| `RecapDialog` + card preview | ✅ | ✅ | Card keeps its self-contained gradient (permitted exception); its Sankey renders the *light* literal hexes even while the app is in dark theme — `STATUS_LITERAL_COLORS` behaving exactly as intended |
| `ConfirmAppliedDialog` | ✅ | ✅ | Reached via a real `saved → applied` transition on the Acme Corp row. Teal Confirm with dark label; the native date input follows `color-scheme` and carries a visible teal focus ring in both themes |
| `ApplicationFormDialog` notice banner — success tone | ✅ | ✅ | Reached by pasting a `greenhouse.io` URL. Measured **9.14:1** light / **14.88:1** dark (text on the composited banner fill) |
| `ApplicationFormDialog` notice banner — warning tone | ✅ | ✅ | Reached by pasting an unsupported URL. Measured **8.73:1** light / **15.42:1** dark. Also re-confirms the no-dead-end behaviour: the pasted URL survives into `Job URL` and status falls back to `Saved` |
| `applications-table.tsx` staleness warning | ✅ | ✅ | `text-amber-700 dark:text-amber-500` measured **5.03:1** light / **9.27:1** dark — clears the 4.5:1 text floor in both, and it's a `role="img"` icon so only the 3:1 non-text floor strictly applies |

No contrast failure was observed on any surface above.

*Independent re-measurement.* The F27 contrast numbers in the table further up were re-derived
from the live computed token values in-browser (canvas pixel sampling, sanity-checked at
black/white = 21:1) and matched: `--primary-foreground` on `--primary` 5.75:1 light / 9.27:1 dark;
`--ring` on `--background` 3.78:1 light / 6.65:1 dark; `--ring` on `--card` 6.02:1 dark. The
`text-primary`-as-body-text gap re-measured at 3.45:1 in light, confirming the "not fixed in this
pass" flag above is real and correctly characterized (grep re-confirmed the `link` Button/Badge
variant is defined but never invoked, and the only live `text-primary` uses are the two
`aria-hidden` Briefcase icons, which are decorative and take the 3:1 non-text floor).

*Empirical addendum to the export-serialization reasoning.* The `var()`-resolution half of that
argument was confirmed live: Recharts `<Cell fill="var(--status-applied)">` reports a
`getComputedStyle` fill of a concrete `rgb(...)` matching the active theme, and flipping `.dark`
changes it. So `var()` does resolve to a theme-dependent concrete color before serialization,
which is exactly why `RecapCard` passing `STATUS_LITERAL_COLORS` is the correct call. The `toBlob`
export *itself* remains unverified end-to-end: the app's real Download path was exercised (button
entered its "Exporting..." state and the polite live region announced correctly), but the export
did not finish within ~2 minutes and saturated the renderer's main thread. That slowness is
environmental/pre-existing — nothing in F27/F28 changed the exported subtree's color values (the
recap path used literal hexes before and still does) — but **an actual exported PNG has still not
been eyeballed since FV6**, and F35's per-skin reference baselines (F48) should be the point where
that gets confirmed rather than assumed.

**375px verified (F26's narrow-width acceptance).** The automation's `resize_window` is a no-op in
this environment, so the check was done the way this repo's tooling notes prescribe: a same-origin
`<iframe>` sized to exactly 375px, which gets its own independent layout viewport for `@media`
queries and `window.innerWidth`. Results at `innerWidth === 375`, authenticated, dark theme:

- `document.documentElement.scrollWidth` 360 ≤ 375 — no document-level horizontal overflow. (The
  applications table still scrolls inside its own `overflow-x-auto` container; removing that is
  FV7's job, not FV6's.)
- Exactly one `ThemeToggle` is visible — the mobile `Sheet`'s. The desktop cluster's copy is
  correctly hidden by `sm:flex`, so the two never double up.
- All three options present with correct `aria-pressed`; clicking Light then Dark drove the full
  state change both directions (`.dark` class, `localStorage`, `aria-pressed`).
- Button target size is 28×28 CSS px — clears WCAG 2.5.8 AA (24×24 minimum), though below the
  44×44 AAA comfort target. Worth knowing if the toggle ever moves somewhere more thumb-critical.

*Not verified, for harness reasons rather than product ones:* physical Enter/Space activation of
the theme buttons — synthetic key delivery was non-functional for the entire session (typing a
character into a focused text input also produced nothing, so this is the harness, not the app).
The controls are native `<button type="button">` elements with `tabIndex 0` and no `disabled`, so
they carry native keyboard activation by construction, and a real click was confirmed to drive the
full state change.

## Install workflow (reminder)

Same as `.claude/rules/magicui-ui.md`: discover via `searchRegistryItems`/`listRegistryItems`,
inspect real source via `getRegistryItem(name, { includeSource: true })` before writing anything
(never assume an API from memory or from this doc), then install via the CLI from `frontend/`:

```
npx shadcn@latest add @magicui/<name>
```

This writes through `components.json`'s existing aliases/`cssVariables`/`baseColor` instead of
hand-copying source, and is how `border-beam`, `number-ticker`, and `blur-fade` were added.

## Per-page inventory

Update this table when a page's MagicUI usage changes — it's the source of truth for "what's
already used where," so a future session can check for consistency instead of re-deriving it.

| Page | Components | Notes |
|---|---|---|
| Analytics (`AnalyticsPage.tsx`) | `BorderBeam` (1x, on the "Total Applications" stat tile only), `NumberTicker` (all 5 stat tiles), `BlurFade` (3 groups: stat row, the status-breakdown/applications-over-time chart row, the pipeline-flow card) | First page to adopt MagicUI. `StatTile` (`components/dashboard/stat-tile.tsx`) takes the animation as optional props (`numericValue`/`suffix`/`decimalPlaces`/`accent`) so every existing caller without them is unaffected. |
| Login (`LoginPage.tsx` / `login-form.tsx`) | `BlurFade` (1 group: the whole auth `Card`), `BorderBeam` (1x, on the same `Card`) | Single view, single element (the card), so both an entrance and the one allowed continuous accent live on it together — not a "pick one" conflict, since `BlurFade` is exempt from the one-accent rule (runs once and settles). `Card` gained `className="relative"` so the beam's `absolute inset-0` overlay positions correctly; `<form>`/`Input`/`Label`/submit logic untouched. |
| Signup (`SignupPage.tsx` / `signup-form.tsx`) | `BlurFade` (1 group: the whole auth `Card`), `BorderBeam` (1x, on the same `Card`) | Same treatment as Login for consistency between the two auth routes. `SignupForm` now destructures `className` and merges it via `cn("relative", className)` instead of spreading it straight onto `Card`, so a future caller-supplied `className` still composes correctly. |
| Applications / Tracker (`ApplicationsPage.tsx`) | `BlurFade` (1 group: the page header title+description only) | Highest-risk page (real data table + toolbar wired to filter/search/sort state). Deliberately minimal: only the static header text is wrapped. The toolbar and table are explicitly left unanimated — both live inside the `isLoading` branch and update on every keystroke/filter/sort/status change, which the "don't re-trigger on state changes" rule for `BlurFade` and the "no marquee/no per-row wrapping" guidance both rule out. No `BorderBeam`: there's no single most-important element to crown on a page that's entirely about scanning/editing rows. |
| Settings / Profile (`SettingsPage.tsx`) | `BlurFade` (1 group: the settings form `Card`) | No numeric KPI on this page (the ghost-days value is an editable form input, not a displayed stat), so no `NumberTicker`. No `BorderBeam` either — no headline stat to justify a continuous accent, unlike Analytics' "Total Applications" tile. Page title header left static, matching Analytics' convention of only animating content groups, not the title. |
| App shell (`AppLayout.tsx`) | `BlurFade` (1 group: the whole `<header>` — logo, desktop nav, action buttons, and the mobile Sheet trigger together) | Requested explicitly (user asked to animate the header). Revisits the prior pass's "no `BlurFade`" reasoning: `AppLayout` wraps `<Outlet />` rather than being remounted by it, so the header itself only mounts once per authenticated session (login/refresh) — it does *not* re-enter on every client-side route change the way page content does, so the "don't re-trigger on state changes" concern doesn't actually apply here. Component defaults unchanged (`duration=0.4s`, `ease="easeOut"`, `offset=6px`, `direction="down"`, `blur="6px"`), `delay={0}`, matching every other single-group usage. Wrapped as one group (not staggered per nav link/button) per the "don't stagger individual items within a group" rule. Still no `BorderBeam`: it would be a second simultaneous continuous accent alongside the one already on the current page's own headline element (Analytics' stat tile, Login/Signup's card), and the "one continuous accent per view" rule is scoped to the whole view, not per-component. Structural markup (`Link`/`Button`/`Sheet`/mobile-menu logic) untouched. |
