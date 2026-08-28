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

`frontend/components.json` fixes this project's palette at `baseColor: "neutral"` — every
existing color is grayscale (`oklch(... 0 0)`, zero chroma). MagicUI's own defaults are not
neutral (`border-beam`'s default gradient is `#ffaa40` → `#9c40ff`; `number-ticker`'s default
text color is literal `text-black dark:text-white`). Per `.claude/rules/magicui-ui.md`'s
theming-discipline rule, always override these at the call site with the project's CSS variable
tokens instead of the component's raw defaults:

```tsx
<BorderBeam colorFrom="var(--foreground)" colorTo="var(--muted-foreground)" />
<NumberTicker className="text-foreground dark:text-foreground" />
```

Don't edit the installed `frontend/src/components/ui/*.tsx` files themselves to hardcode the
project's colors in — override via props/`className` at each usage instead, so the installed
file stays a clean, up-to-date mirror of upstream MagicUI and can be re-synced later without
losing local edits.

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
