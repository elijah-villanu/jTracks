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
reach Motion-driven components** — a `NumberTicker` would keep animating for a
user who has explicitly told their OS to reduce motion, silently regressing WCAG 2.3.3.

The fix is one line, done once, at the app root (`frontend/src/main.tsx`):

```tsx
import { MotionConfig } from "motion/react"

<MotionConfig reducedMotion="user">
  {/* ...the whole app... */}
</MotionConfig>
```

~~This makes **every** `motion.*` element anywhere under it automatically honor the OS
setting.~~ **Correction (a11y pass, 2026-09-15): it doesn't, and two of the three components
approved at the time were still animating for reduced-motion users.** Keep the provider — it is still
required — but know exactly what it does. Under `reducedMotion="user"`, Motion only
short-circuits **positional** values: transforms plus `width`/`height`/`top`/`left`/`right`/
`bottom` (`positionalKeys`, applied in `motion-dom`'s `animation/interfaces/
visual-element-target.mjs`). Every other value animates normally. Measured in Chromium with
reduced motion emulated:

| Component | What it animates | Covered by `MotionConfig`? | Handling |
|---|---|---|---|
| `blur-fade` | `y`/`x` offset, `opacity`, `filter` | Offset yes; opacity/blur fade still runs (0.4s) | None needed — a short fade is the non-vestibular part the setting leaves alone |
| `number-ticker` | a standalone `useSpring` writing `textContent` | **No** — no visual element involved at all | Call site renders the final value as plain text |

(`border-beam` was the third measured case: its `offsetDistance` loop wasn't stopped either,
moving 0.39% → 6.67% in 1.5s. It has since been removed from the project; see below.)

So the rule is now: **check what a MagicUI component actually animates before relying on the
provider.** Anything outside the positional set gets the local check, through the one shared
hook `frontend/src/hooks/usePrefersReducedMotion.ts` (live `matchMedia`, unlike Motion's own
`useReducedMotion`, which reads once) — not an ad hoc media query per file. Render the settled
end state rather than a paused animation: the real number, not a count-up.

**Non-Motion libraries fall through too.** A library that
animates *without* Motion falls through both safety nets at once — `MotionConfig` only governs
`motion.*` elements, and `index.css`'s reduced-motion block only governs CSS
`animation`/`transition`. Anything that moves by writing inline styles from its own
`requestAnimationFrame` loop is reached by neither and **does** need explicit local handling.

The live case is **Embla**, behind shadcn's `carousel` in `recap-dialog.tsx` (F48): it slides by
writing an inline `transform` from its own rAF loop, so it animated regardless of the OS setting
until given `opts={{ duration: 0 }}` under `useMediaQuery("(prefers-reduced-motion: reduce)")`.
That branch is required, not redundant. If you
add another non-Motion animated dependency, it needs the same treatment, and it belongs in the
inventory table with a note saying so. (Recharts 3 is *not* such a case: its
`isAnimationActive` defaults to `"auto"`, which reads `prefers-reduced-motion` itself.)

**WCAG 2.2.2 (Pause, Stop, Hide): no looping animations.** 2.2.2 applies to any auto-starting
movement that lasts more than 5 seconds alongside other content, decorative or not, and requires
a way to pause, stop or hide it. Honoring the OS reduced-motion setting is *not* that mechanism —
it only helps users who have found and turned on an OS setting. `BorderBeam` looped forever with
no pause control, which is why it was removed (below). **Don't add another continuous or looping
animation** — marquee, shimmer, animated-beam, particles and the like — unless it stops on its
own within 5 seconds or ships with a visible pause control.

## Approved components (so far)

Only what's actually been used and verified in this project. This list grows as real pages adopt
MagicUI — it is not a pre-approval of MagicUI's full catalog. Anything not listed here still
requires the discovery → inspect-real-source → CLI-install workflow in
`.claude/rules/magicui-ui.md` before use, same as these were.

| Component | Use it for | Not for |
|---|---|---|
| `number-ticker` | Counting a KPI number up to its real value on mount — dashboards/stat tiles where the number *is* the content. | Text that isn't actually numeric, or numbers a user needs to read immediately/repeatedly (e.g. inside a live-updating table cell) — the count-up delay works against fast scanning there. |
| `blur-fade` | A subtle once-per-mount entrance for a content group (a stat row, a chart, a card) — signals "this just loaded" without being a distraction. | Anything that needs to re-trigger on every state change (it's an entrance, not a state-transition effect) — don't wrap something that re-renders on every keystroke/filter change. |

**Removed — not approved: `border-beam`.** Removed from every call site (Login, Signup, Landing, the
Analytics "Total Applications" stat tile), and its installed file
`frontend/src/components/ui/border-beam.tsx` deleted, on **2026-09-15 by user decision**. Reason:
WCAG 2.2.2 — a light that loops forever with no pause control, on pages people are reading and
typing into. Don't reinstall it. Nothing replaced it: no page has a continuous accent now.

Other components explicitly discussed but **not yet used anywhere** (fine to introduce later
following the same workflow, but don't assume they're the right call by default): `shimmer-button`,
`animated-shiny-text`, `magic-card`, `shine-border`, `marquee`, `animated-beam` (several of these loop — check
the 2.2.2 rule above first). Save
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
- **Continuous/looping accents: none.** This bullet used to set `BorderBeam`'s `duration=24s` and
  an "at most one continuous accent per view" limit. Both are moot: `BorderBeam` was removed on
  2026-09-15 (WCAG 2.2.2, see above) and no looping accent is approved. The 2.2.2 rule in the
  reduced-motion section replaces that limit. Entrance animations (`BlurFade`) run once and
  settle, so they're unaffected.
- **Counters (`NumberTicker`).** Component's default spring (`damping: 60, stiffness: 100`) —
  don't override unless a specific tile has a concrete reason to feel snappier/slower than the
  rest. Always pass the real number via `numericValue`/`value`, never re-derive or approximate it
  for the animation.

## Theming — never ship MagicUI's hardcoded defaults

**Correction (F46): the palette is not grayscale any more, and earlier revisions of this section
said it was.** Until FV6 this file stated that the project was fixed at `baseColor: "neutral"` and
that "every existing color is grayscale (`oklch(... 0 0)`, zero chroma)", which made "override
MagicUI's colors with ours" a purely grayscale instruction. Half of that is still true and half is
not:

- **Still true:** `frontend/components.json` really does still set `baseColor: "neutral"`
  (verified against the file), and the bulk of the palette — `--background`, `--foreground`,
  `--card`, `--muted`, `--border`, `--input`, `--secondary`, `--accent`, the whole `--sidebar-*`
  set apart from its primary/ring pair, and `--chart-1`..`--chart-5` — is still zero-chroma
  `oklch(... 0 0)` in both `:root` and `.dark` (`--border`/`--input` are zero-chroma with an
  alpha in dark). `--chart-1`..`--chart-5` in particular are five greys, and the app's charts do
  not read them — they read `--status-*` (F28) — so don't reach for a chart token expecting a
  color.
- **Never was true, strictly:** `--destructive` has always been red
  (`oklch(0.577 0.245 27.325)` in `:root`) — it ships with shadcn's neutral base and predates
  F27. So the old "every existing color is grayscale" line was already wrong by one token before
  the accent hue landed; it is now wrong by several.
- **No longer true:** F27 (FV6) added one real accent hue on top of that neutral base, and F28
  added the status palette. The accent hue as shipped in `frontend/src/index.css` is
  **teal, `h = 195`**, carried by `--primary`/`--ring` and their `--sidebar-primary`/
  `--sidebar-ring` twins:

  | Token | `:root` | `.dark` |
  |---|---|---|
  | `--primary` | `oklch(0.62 0.11 195)` | `oklch(0.75 0.11 195)` |
  | `--ring` | `oklch(0.60 0.10 195)` | `oklch(0.66 0.10 195)` |
  | `--sidebar-primary` / `--sidebar-ring` | same values as the two above | same values as the two above |

  `--primary-foreground` is near-black in **both** themes (`oklch(0.145 0 0)`) — see the record
  below for the contrast math that forced that. The status colors are separate, live in
  `--status-*`, and are literal hexes rather than `oklch`.

**F29's accent-hue decision record is present in this file**, immediately below: "Palette decision
record (F27/F28)" carries the rationale for picking teal (the one major hue the status palette
doesn't already occupy), the two values that measurement changed, and the contrast table; the
"F29 live both-theme sweep" section under it carries the in-browser verification of those numbers
and the surface-by-surface light/dark pass. F46's check is that they are here, together, and they
are.

**What this means for MagicUI specifically:** the accent hue existing does *not* make it the right
color for an accent component, and no shipped MagicUI usage uses it. `NumberTicker` passes
`className="text-foreground dark:text-foreground"` (the since-removed `BorderBeam` call sites
passed `--foreground`/`--muted-foreground`). An accent-colored decoration would read as a
brand or state signal competing with the `--primary` CTAs and the focus ring. Tokens, yes; the
*accent* token, deliberately not.

MagicUI's own defaults are still not this project's tokens (`number-ticker`'s default text color is literal
`text-black dark:text-white`). Per `.claude/rules/magicui-ui.md`'s theming-discipline rule,
always override these at the call site with the project's CSS variable tokens instead of the
component's raw defaults:

```tsx
<NumberTicker className="text-foreground dark:text-foreground" />
```

Don't edit the installed `frontend/src/components/ui/*.tsx` files themselves to hardcode the
project's colors in — override via props/`className` at each usage instead, so the installed
file stays a clean, up-to-date mirror of upstream MagicUI and can be re-synced later without
losing local edits.

**Typography follows the same rule (FV12/R17), in its own doc.** `docs/decisions/typography.md`
records the Display+Text typeface pairing (Hedvig Letters Sans / Roboto), the self-hosted
`@font-face`/`--font-display`/`--font-sans` tokens in `frontend/src/index.css`, and the recap
export's font-readiness gate. No MagicUI component in use takes a font prop, so every MagicUI call site in this project simply inherits
`--font-sans`/`--font-display` (or, in practice, whatever the surrounding chrome's `font-*`
utility already resolves to) rather than shipping a family of its own — the same "never ship the
library's hardcoded default, always resolve through this project's tokens" principle this section
states for color, applied to type.

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

*FV9 update (2026-09-08).* That flag did its job. The landing page's hero eyebrow was first drafted
as `text-primary` — following the incident.io reference, which colours its equivalent line in the
accent — which would have made it this app's first live instance of primary-coloured body text at
3.44:1. Caught against this record and changed to `text-muted-foreground` before shipping. The
accent still carries `/` through the primary CTAs (`--primary-foreground` on `--primary`, 5.75:1)
and four `aria-hidden` icons (3:1 non-text floor). So the count above — "the only live
`text-primary` uses are the two `aria-hidden` Briefcase icons" — is now six decorative icons and
still zero body-text uses. **The underlying gap is unfixed**: the next page that wants an
accent-coloured line of text has the same problem, and the real fix is still a darker light-mode
`--primary`.

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
- ~~`border-beam.tsx`'s installed-component default props~~ — gone; the file was deleted
  2026-09-15.
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
| `/analytics` stat tiles | ✅ | ✅ | `NumberTicker` values and `BorderBeam` accent both read correctly on a dark card (beam since removed, 2026-09-15) |
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

*Route labels in that table are as-of-F29 and have since moved (noted in F46 rather than
rewritten, since the table is a record of what was observed at the time).* FV9's F41/F44
took `/` for the public landing page and moved the authenticated app under `/app`, so the
row reading "`/` tracker table + toolbar" is today's `/app`, and `/analytics` / `/profile`
are `/app/analytics` / `/app/profile`. The surfaces themselves are the same ones.

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

## Accent recolor (2026-09-10) — teal → blue, supersedes F27's hue choice

User request: replace the F27 teal accent with an exact brand blue, `#0F57FE`. This section
records the new decision on top of the F27/F28 record above rather than rewriting it — same
convention F46 already established for this file ("noted... rather than rewritten, since the
table is a record of what was observed at the time").

**New values** (`frontend/src/index.css`):

| Token | `:root` | `.dark` |
|---|---|---|
| `--primary` / `--sidebar-primary` | `#0F57FE` (exact, as given) | `oklch(0.707 0.165 254.624)` (Tailwind blue-400) |
| `--primary-foreground` / `--sidebar-primary-foreground` | `oklch(0.985 0 0)` (near-white) | `oklch(0.145 0 0)` (near-black, unchanged from F27) |
| `--ring` / `--sidebar-ring` | `#0F57FE` (same as primary) | `oklch(0.623 0.214 259.815)` (Tailwind blue-500) |

`#0F57FE` converts to `oklch(0.537 0.255 263.2)` — close to Tailwind's own blue-600
(`oklch(0.546 0.245 262.881)`), which is why the dark-mode values below reuse Tailwind's
blue-400/blue-500 rather than a freehand lightened guess: same hue family, and Tailwind's own
scale is already gamut-safe and has an established lightness/chroma curve for exactly this
"lighten a saturated blue for dark surfaces" problem.

**Why `--primary-foreground` flipped to near-white, unlike F27's near-black call:** F27's teal
was light enough (`L=0.62`) that near-black text read best. This blue is much darker/more
saturated (`L=0.537`) — near-black text on it only clears **3.60:1**, under the 4.5:1 text floor.
Near-white clears **5.50:1**. Dark mode's lighter blue-400 (`L=0.707`) flips the math back:
near-black text clears **7.79:1**, near-white would only clear **2.44:1** — so dark keeps F27's
near-black choice.

**A regression this flip would have introduced, and the fix.** The `default` Button/Badge
variants and the recap dialog's share-button avatar all lightened `--primary` toward whatever's
behind them on hover (`hover:bg-primary/80`, `/90`) — fine with near-black text (dark text stays
legible as the background lightens), but with white text this *drops* contrast as the background
gets paler. Measured: light-mode hover was **3.75:1** with white text — under 4.5:1, a real
regression, not a hypothetical one. Fixed by changing the hover mechanism itself, in all three
call sites (`button.tsx`, `badge.tsx`, `recap-dialog.tsx`'s share button), from opacity-toward-
backdrop to a fixed darken: `hover:bg-[color-mix(in_oklch,var(--primary),black_15%)]` — mirrors
the `secondary` variant's existing `color-mix` hover pattern, just mixing toward literal `black`
instead of `var(--foreground)` (which would *lighten* in dark mode, since `--foreground` is
near-white there). Re-measured with the fix: **6.74:1** light / **5.73:1** dark. `--ring` needed
no equivalent fix — `:root`'s `--ring` is just `--primary` itself (already 5.50:1 against
white/card, unlike F27's teal which started under the 3:1 floor and needed its own tuned value).

**Known conflicts, flagged but not resolved here** (both are decisions about *other* features'
colors, not the accent token itself, so left for the user to decide rather than changed
unilaterally):

- **`--status-applied` (`#3b82f6`) now nearly matches the new accent hue.** F27's whole
  hue-picking rationale (`h=195` "the one major hue the status palette doesn't already occupy")
  is defeated by this change — blue was `applied`'s hue precisely so it would never collide with
  primary, and now it does. "Applied" chips/chart segments will read close to primary CTAs.
  Not fixed here since it means recoloring a status, not the accent. See the F28 status table
  above for the current `--status-*` values if this gets revisited.
- **The Duolingo recap skin's hardcoded gradient** (`recap-skins/shared.tsx`'s
  `duolingoBackground: "linear-gradient(160deg, #0b4f57 0%, #072f35 100%)"`) was deliberately
  painted in "the app's own teal accent family (F27) instead of Duolingo's blue" (see that file's
  and `duolingo-skin.tsx`'s doc comments) specifically so the skin wouldn't look like a copy of
  Duolingo's actual brand blue. With the app's own accent now blue, that rationale is inverted —
  left untouched (it's a fixed, hand-authored export palette, not a live token reader), but the
  "echoes the app's accent, not Duolingo's" comment is now stale and the visual distinction from
  real Duolingo blue is weaker than intended.

## A11y pass token changes (2026-09-15)

Recorded here because this file is the palette's decision record. All values are in
`frontend/src/index.css`, measured with a WCAG contrast calculator against real surfaces and
confirmed with axe-core in both themes:

| Change | `:root` | `.dark` | Why |
|---|---|---|---|
| New `--input-border` (→ `border-input-border` on `Input`/`Textarea`/`SelectTrigger`) | `oklch(0.62 0 0)` | `oklch(1 0 0 / 40%)` | Field outlines were 1.26:1 / 1.48:1, effectively invisible to low-vision users (1.4.11). Now 3.64:1 / 3.77:1. Kept separate from `--input` because `.dark` also uses `--input` as the control *fill*. |
| `--destructive` | `oklch(0.49 0.2 27.4)` (was `oklch(0.577 0.245 27.325)`) | unchanged | Every error banner is `text-destructive` on `bg-destructive/10`: 4.09:1 → 5.75:1. Also clears the destructive Button's hover over the dialog footer (4.55:1). |
| Base `outline-ring/50` → `outline-ring` | — | — | The browser's focus ring on links and nav items was 2.26:1 / 2.12:1. Now 5.50:1 / 5.33:1. |
| `Button` `default` variant focus | `ring-2 ring-ring ring-offset-2` | same | Its `border-ring` cue matched its own fill, leaving only the `/50` halo (2.26:1). |
| `Button` `destructive` variant focus | `border-destructive` (was `/40`) | same | 2.26:1 / 1.98:1 → 4.91:1+. |

None of these touch a MagicUI call site's colors.

## Install workflow (reminder)

Same as `.claude/rules/magicui-ui.md`: discover via `searchRegistryItems`/`listRegistryItems`,
inspect real source via `getRegistryItem(name, { includeSource: true })` before writing anything
(never assume an API from memory or from this doc), then install via the CLI from `frontend/`:

```
npx shadcn@latest add @magicui/<name>
```

This writes through `components.json`'s existing aliases/`cssVariables`/`baseColor` instead of
hand-copying source, and is how `number-ticker` and `blur-fade` (and the since-removed `border-beam`) were added.

## Per-page inventory

Update this table when a page's MagicUI usage changes — it's the source of truth for "what's
already used where," so a future session can check for consistency instead of re-deriving it.

| Page | Components | Notes |
|---|---|---|
| Analytics (`AnalyticsPage.tsx`) | `NumberTicker` (all 5 stat tiles), `BlurFade` (3 groups at `ENTRANCE_STAGGER_SECONDS * N`: stat row, the status-breakdown/applications-over-time chart row, the pipeline-flow card) | First page to adopt MagicUI, and the source of the `ENTRANCE_STAGGER_SECONDS = 0.08` constant every other multi-group page copies. `StatTile` (`components/dashboard/stat-tile.tsx`) takes the animation as optional props (`numericValue`/`suffix`/`decimalPlaces`) so every existing caller without them is unaffected. **FV11 revision (F54, 2026-09-09):** `StatTile`'s *shell* was restyled toward the Monarch stat-card reference — `[--card-spacing:--spacing(5)]` (16px → 20px padding), an uppercase/letter-spaced `text-xs` caption, and `flex-col-reverse` on the `<dl>` so the figure reads above the label (DOM order stays `<dt>`-then-`<dd>`, so the announcement is unchanged). `NumberTicker` keeps its default spring and its `text-foreground dark:text-foreground` override. **FV8 revision:** the third `BlurFade` wraps the "Pipeline flow" `Card`, whose `SankeyChart` measures its own container via `ResizeObserver` (F36) and is `interactive` (F38). Both are fine under an entrance wrapper: `BlurFade` only translates and blurs, never scales, so the observer measures the same content width during the entrance as after it. **A11y pass (2026-09-15):** under `prefers-reduced-motion`, `StatTile` renders `value` as static text instead of `NumberTicker`, which `MotionConfig` doesn't stop. The `BorderBeam` on the "Total Applications" tile, and `StatTile`'s `accent` prop that enabled it, were removed (WCAG 2.2.2). |
| Login (`LoginPage.tsx` / `login-form.tsx`) | `BlurFade` (1 group: the whole auth `Card`) | Single view, single element (the card). `<form>`/`Input`/`Label`/submit logic untouched. **2026-09-15:** the card's `BorderBeam` (and the `relative` class it needed) removed — WCAG 2.2.2. |
| Signup (`SignupPage.tsx` / `signup-form.tsx`) | `BlurFade` (1 group: the whole auth `Card`) | Same treatment as Login for consistency between the two auth routes. `SignupForm` destructures `className` and merges it via `cn(className)`, so a caller-supplied `className` composes correctly. **2026-09-15:** the card's `BorderBeam` removed, same as Login. |
| Applications / Tracker (`ApplicationsPage.tsx`) | `BlurFade` (1 group: the page header — title, description and the F51 Table/Board toggle) | Highest-risk page (real data table + toolbar wired to filter/search/sort state). Deliberately minimal: only the header row is wrapped. **FV11 revision (F51, 2026-09-09):** that header row now also contains the `ViewModeToggle`, so the group is no longer purely static text. Still one group and still the correct scope: `BlurFade` is an entrance, and the header mounts once with the route, so the toggle animates in with the title and then never re-animates — it is not re-keyed or re-mounted when the view mode changes (that switch only swaps the sibling table/board subtree, which is outside every `BlurFade` on this page). The toolbar and table are explicitly left unanimated — both live inside the `isLoading` branch and update on every keystroke/filter/sort/status change, which the "don't re-trigger on state changes" rule for `BlurFade` and the "no marquee/no per-row wrapping" guidance both rule out. |
| Settings / Profile (`SettingsPage.tsx`) | `BlurFade` (1 group: the settings form `Card`) | No numeric KPI on this page (the ghost-days value is an editable form input, not a displayed stat), so no `NumberTicker`. Page title header left static, matching Analytics' convention of only animating content groups, not the title. |
| Recap dialog (`dashboard/recap-dialog.tsx` + `dashboard/recap-skins/*`) | **None** — and none may be added to the card itself | Listed precisely because it must stay empty. F35's standing rule: the skin components sit inside the subtree handed to `toBlob`, so no MagicUI/Motion component may appear anywhere in them — an in-flight animation serializes at whatever frame it happens to be on, and Motion's inline transforms aren't guaranteed to survive serialization, so the PNG would silently differ from what the user saw. Motion *around* the card, elsewhere in the dialog, would be outside the export refs and is permitted, but nothing has needed it. The one animated thing here is the skin carousel, which is **Embla, not MagicUI** — see the reduced-motion carve-out above for why it carries its own `duration: 0` branch. |
| Landing (`routes/LandingPage.tsx`) | `BlurFade` (4 groups: hero, product visual, feature trio, footer) | **F45 (FV10).** Four groups at `delay = ENTRANCE_STAGGER_SECONDS * N` → 0 / 0.08 / 0.16 / 0.24s, using a local copy of Analytics' constant with the same name and value rather than a new number; every other `BlurFade` prop is left at the documented default (`0.4s`, `easeOut`, `offset 6px`, `blur 6px`, `direction down`), so only `delay` varies. `inView` is left at its default `false`, so the two below-the-fold groups animate on mount and have settled long before they're scrolled to. The `<header>` is deliberately **not** a fifth group: the page frame stays put while the content cascades. **No `NumberTicker`:** the page has no KPI tile — its only figures are caption text ("128 applications") and the numbers inside `RecapCard`, and the latter is off-limits regardless. **F35 still applies here:** group 2's `BlurFade` wraps `RecapCard` from the *outside*, which is permitted; nothing may go inside the card or its skins, even though this instance is never exported (the a11y pass's `role="img"` wrapper sits outside the card too). Everything runs under the app-root `<MotionConfig reducedMotion="user">` — the route is lazy-loaded (F44) inside `BrowserRouter`, which is inside that provider. **2026-09-15:** the pipeline-flow card's `BorderBeam`, previously the page's one continuous accent, removed (WCAG 2.2.2). |
| App shell (`AppLayout.tsx`) | `BlurFade` (1 group: the whole `<header>` — logo, desktop nav, action buttons, and the mobile Sheet trigger together) | Requested explicitly (user asked to animate the header). Revisits the prior pass's "no `BlurFade`" reasoning: `AppLayout` wraps `<Outlet />` rather than being remounted by it, so the header itself only mounts once per authenticated session (login/refresh) — it does *not* re-enter on every client-side route change the way page content does, so the "don't re-trigger on state changes" concern doesn't actually apply here. Component defaults unchanged (`duration=0.4s`, `ease="easeOut"`, `offset=6px`, `direction="down"`, `blur="6px"`), `delay={0}`, matching every other single-group usage. Wrapped as one group (not staggered per nav link/button) per the "don't stagger individual items within a group" rule. Structural markup (`Link`/`Button`/`Sheet`/mobile-menu logic) untouched. |
