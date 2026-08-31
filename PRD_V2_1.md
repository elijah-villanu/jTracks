# jTracks V2.1 — UI overhaul: theming, landing page, chart & table UX

> **Scope note.** This document specifies **V2.1** of jTracks, an interface-and-UX iteration on
> top of the already-shipped V2. The baseline of record is [`PRD_V2.md`](./PRD_V2.md) (status
> model, Sankey data contract, expanded ranges, session security); V1/MVP is
> [`PRD.md`](./PRD.md). Where V2.1 changes V2 behavior, this document wins. Where V2.1 is
> silent, V2 still applies.
>
> **Why a separate file rather than an `R10` addendum inside `PRD_V2.md`.** R9 was a two-bullet
> post-launch refinement and belonged in the parent doc. V2.1 is a planned iteration with its own
> goals, non-goals, success metrics and delivery sequence, and it introduces a **new product
> surface** (a public landing page) that `PRD_V2.md`'s summary and non-goals do not describe. Its
> tradeoff — two docs to keep in sync — is mitigated by **continuing V2's requirement numbering
> from R10 rather than restarting at R1**, so a bare "R5" or "R13" is unambiguous across both
> files.
>
> **Contract note.** V2.1 is planned as **frontend-only**. No change to
> [`backend/API_SPEC_V1.md`](./backend/API_SPEC_V1.md), no new endpoint, no new field, no
> migration. See [Constraints & assumptions](#constraints--assumptions).
>
> **Status: DRAFT.** Items marked **[unconfirmed]** are proposals awaiting the user's decision and
> must not be implemented as written until confirmed. See
> [Open questions / risks](#open-questions--risks).

## Summary

V2 made jTracks say *where the job search is dying*. V2.1 makes it look and behave like a product
someone would choose to open. It is a UI overhaul across three axes: **theming** (the app is
currently a fully-grayscale `neutral` palette with a dark-mode token set that no code can ever
activate), **a public landing page** (there is currently no unauthenticated surface at all — a
logged-out visitor to `/` is bounced straight to a login form), and **two concrete UX defects on
the app's two most important screens** (the applications table scrolls horizontally at narrow
viewports, and the Sankey/recap still reads as a data dump rather than a designed chart even after
R9). Motion is the connective tissue: a restrained MagicUI accent layer, already partly landed,
extended to the new surfaces under the same conventions.

This is explicitly **not a reskin**. Each requirement below names a behavior that is wrong today
and the observable condition under which it is fixed.

---

## Problem statement

Five problems with the shipped V2, in rough order of user-visible severity:

1. **The applications table scrolls horizontally on any narrow viewport.** `Table`'s container is
   `overflow-x-auto` and every `TableHead`/`TableCell` is `whitespace-nowrap`, across six columns
   (Company, Job Title, Status, Location, Date Applied, Edit) — and the Status column alone packs
   a `StatusBadge`, a `StatusSelect` and a conditional staleness warning side by side. The board is
   the primary screen of the product and it cannot be read on a phone without dragging sideways.

2. **There is no front door.** `/` is a protected route. An unauthenticated visitor is redirected
   to `/login` and sees a login form with no explanation of what jTracks is. There is nothing to
   link to, nothing to show, and no path from "saw this" to "signed up." For a portfolio piece
   whose stated success metric in V2 was "demoable end-to-end," the demo currently starts at a
   password field.

3. **The theme is a placeholder, and half of it is unreachable.** `frontend/src/index.css` defines
   a complete `.dark` token set, and shadcn components throughout carry `dark:` variants — but
   nothing in the app ever adds the `.dark` class to the document. That work is written and dead.
   Meanwhile `:root` is entirely zero-chroma (`oklch(... 0 0)`) with `chart-1`..`chart-5` as a
   grayscale ramp, which is also what the status palette and therefore the Sankey are built from.
   The product has no visual identity, and its most distinctive chart is rendered in five shades
   of gray.

4. **The Sankey and recap are correct but not designed.** R5 fixed the data and topology and
   explicitly deferred visual design (R5.7); R9 then fixed the recap's information hierarchy and
   the dashboard's aspect ratio. What remains is genuinely visual and interactive: the dashboard
   chart is a fixed 343×170 viewBox stretched to full card width, so its 9px labels render at
   whatever size the container happens to imply rather than at the page's real type scale; R5.4's
   in-flight shortfall renders as unexplained empty space with nothing telling the user those
   applications are still open; and the chart has no hover, no legend, and no affordance beyond
   the value in parentheses after each label.

5. **The motion pass is half-done and undocumented in the PRD.** `BlurFade`, `BorderBeam` and
   `NumberTicker` have landed on five surfaces under a real conventions doc, but that work was
   done ahead of planning and is recorded only in
   [`docs/decisions/magicui-conventions.md`](./docs/decisions/magicui-conventions.md) and commit
   messages. Per this project's convention of logging implementation-driven changes back into the
   PRD (see `PRD_V2.md`'s R9 preamble), it is recorded here — in [R14](#r14--motion-layer-implemented--extension-must-have) —
   so the doc doesn't imply the work is still ahead.

## Goals

- Give jTracks a deliberate visual identity — a palette, a working light/dark mode, and a
  consistent motion language — instead of shadcn defaults with the color knob at zero.
- Give the product a public first impression that explains what it does before asking for a
  password.
- Make the applications table fully readable at 375px with no horizontal scrolling and no data
  hidden from assistive tech.
- Take the Sankey and recap from "correct" to "designed," including making R5.4's in-flight
  applications legible rather than an unexplained gap.
- Keep every accessibility guarantee won in the V2 audit, and honor `prefers-reduced-motion`
  everywhere, including on new surfaces.

## Non-goals (V2.1)

- **No backend, API, schema or migration changes.** If any requirement below turns out to need
  one, it is descoped rather than expanded — see [Constraints](#constraints--assumptions).
- **No new metrics, no new analytics, no status-event log.** `PRD_V2.md`'s
  *Known limitation: status-only analytics* stands unchanged. V2.1 changes how existing numbers
  are *drawn*, never what they mean.
- **No marketing-site infrastructure.** No CMS, no blog, no pricing page, no email capture or
  waitlist, no third-party analytics/tracking script, no cookie banner. **[unconfirmed]**
- **No SEO program.** A page `<title>` and description meta tag are in scope; sitemaps, structured
  data, OG image generation, prerendering/SSR are not. **[unconfirmed]**
- **No replacement of shadcn/ui.** Per `.claude/rules/shadcn-ui.md`, shadcn (Radix/Base UI) remains
  mandatory for anything structural, interactive or data-bearing. MagicUI stays a decorative
  accent layer and never reimplements a shadcn primitive.
- **No rewrite of forms, dialogs, or the add/edit flow.** They inherit the new tokens and nothing
  else.
- **No new authenticated pages or features**, no i18n, no user-configurable theming beyond a
  light/dark/system control.
- Everything out of scope in V1 and V2 remains out of scope.

## Target users

Unchanged from V2 for the authenticated app: an individual job seeker managing a private board.

V2.1 adds one **new audience for one surface only** — the landing page's visitor, who is
unauthenticated, arriving cold, and deciding within seconds whether to sign up. This is not a new
persona to design the app around; it is a reader of a single page. **Confirmed: a genuine public
marketing page** (portfolio visitors, recruiters, prospective users) — not merely a nicer demo
front door — consistent with choosing routing option B below, whose entire rationale is a stable
marketing URL reachable while signed in.

---

## Requirements

Numbering continues from `PRD_V2.md` (R1–R9). Prioritized as **must-have** unless marked
otherwise. Sequencing is in [Delivery sequence](#delivery-sequence).

### R10 — Public landing page (must-have)

**R10.1 — Routing. Confirmed: approach B.** `/` becomes unconditionally public and always renders
`LandingPage`, regardless of auth state. The authenticated app moves under `/app`
(`/app/analytics`, `/app/profile`; the board itself is `/app`). This gives a stable marketing URL
that stays reachable while signed in — the whole point of choosing B over the guard-swap
alternative. Concretely: every existing route in `frontend/src/App.tsx` (or wherever routes are
declared) gains an `/app` prefix; `ProtectedRoute`'s redirect target for an unauthenticated deep
link becomes `/login` unchanged, but the **post-login redirect destination** becomes `/app` instead
of `/`; every internal `<Link>`/`navigate()` call to the old bare paths (nav links in `AppLayout`,
the logo lockup, any hardcoded `"/"` used as "go to the board") must be updated to the `/app`
equivalent — this is a repo-wide find, not a single file. `/login` and `/signup` stay top-level
(not under `/app`), since a visitor reaches them from the public landing page before authenticating.

**R10.2 — No authenticated work on the landing page.** The landing route must not call any
authenticated endpoint, must not mount `ApplicationsProvider`, and must not block render on the
boot-time `POST /auth/refresh` (R7.6). Any product data shown is **hard-coded demo data defined in
the landing page's own module** — never a fetch, never the mock handlers, never another user's
shape of data.

**R10.3 — Sections. [unconfirmed]** Proposed, top to bottom:

| Section | Contents |
|---|---|
| Hero | Product name/lockup, one-line value proposition, one-sentence subhead, primary CTA → `/signup`, secondary CTA → `/login` |
| Product visual | A static, demo-data render of the thing that makes jTracks distinctive — the pipeline Sankey and/or the recap sticker |
| Feature trio | The three differentiators: auto-ghosting after a configurable threshold, funnel analytics that separate pre- from post-interview failure, the shareable Stories-format recap |
| Footer | Logo lockup, link back to the app, minimal legal/attribution |

No section may make a claim the product does not do. The feature copy must match the shipped V2
behavior (e.g. "Failed Interview/OA" is the real label per R1.2 and must not be softened to
"Failed" in marketing copy either).

**R10.4 — Reusing real components.** The product visual should render the **actual**
`SankeyChart` / `RecapCard` components against demo data, not a screenshot, so the landing page
cannot drift from the product. If a component cannot be rendered outside the authenticated tree
without contortion, a static asset is the acceptable fallback — but it must then be regenerated
whenever the corresponding surface changes, and that obligation noted in the component's file.

**R10.5 — Accessibility and responsiveness.** Correct landmark structure (`header`/`main`/`footer`),
a single `<h1>`, no skipped heading levels, all CTAs reachable and labeled, legible and unclipped
at 375px, and the same reduced-motion guarantee as everywhere else (R14.4). The landing page is
the first page a screen-reader user or a search engine will ever see; it does not get a lower bar
than the app.

**R10.6 — Document metadata.** The landing route sets a real `<title>` and description meta tag.
Nothing further (see Non-goals).

### R11 — Theming overhaul (must-have)

**R11.1 — Working light/dark mode. Confirmed: in scope for V2.1.** The `.dark` token block in
`frontend/src/index.css` and every `dark:` variant in the component tree are currently dead code
because nothing sets the `.dark` class. V2.1 makes dark mode reachable:

- A theme provider that applies `.dark` to the document element.
- Three states: **light**, **dark**, **system** (following `prefers-color-scheme`), with system as
  the default for a first-time visitor.
- The choice persists across reloads.
- A visible control in the app shell (`AppLayout`) and on the landing page.
- No flash of the wrong theme on load.
- Every page — app, auth, and landing — must be legible and contrast-compliant in **both** themes.
  Dark mode is not "shipped" until every route has been checked in it.

**R11.2 — Palette direction. Confirmed: neutral + one accent hue.** `--primary`/`--ring`/CTA
surfaces gain a real hue in both the light and dark token blocks; `--chart-1`..`--chart-5` and the
rest of the grayscale base are **not** rethought — the status/Sankey palette stays as it is today
except for whatever R11.3's distinguishability check requires. This is the contained option: small
surface area, but every button/focus-ring/link that currently relies on zero-chroma `--primary`
must be re-verified for contrast once it carries a hue, in both themes (R11.1). Exact hue value is
not specified here — pick one consistent with any reference material from Q7, or a reasonable
default if none arrives before this stage starts.

**R11.3 — Status colors are a single shared concern.** `STATUS_BREAKDOWN_COLORS` (exported from
`frontend/src/components/dashboard/status-breakdown-chart.tsx`) drives the status breakdown chart
**and** the Sankey's node and ribbon fills, and `StatusBadge`/`STATUS_CELL_CLASSES` drive the
table. Any palette change must be made once, in the token layer, and flow to all of them. Two hard
constraints:

- The seven statuses must remain **distinguishable from one another** in both themes — this is the
  Sankey's entire legibility.
- Status color must never be the *only* carrier of meaning (WCAG 1.4.1). Labels stay.

**R11.4 — Token discipline.** All theming changes go in `frontend/src/index.css`'s CSS variables
and `@theme inline` mapping. No hardcoded hex/oklch in components. This already applies to MagicUI
per `docs/decisions/magicui-conventions.md`; R11 extends it to everything. The one existing
deliberate exception is `RecapCard`'s self-contained gradient (it renders its own background
because the export canvas is transparent) — if it is re-themed it must stay self-contained and must
not start depending on `.dark` state, since the exported PNG has no theme context. **[see R12.5]**

**R11.5 — Typography, radius, density. [unconfirmed]** Whether V2.1 also changes the type scale,
`--radius` (currently `0.625rem`), or table/card density is open. Not assumed in scope.

### R12 — Sankey & recap visual restructure (must-have)

Builds on R5 (data/topology, frozen) and R9 (recap hierarchy, dashboard aspect ratio, shipped).
**R5.5's rule that the frontend must never re-derive the topology remains absolute — every item
below is rendering only.**

**R12.1 — Responsive sizing instead of a scaled fixed viewBox.** `AnalyticsPage` renders
`SankeyChart` at `width={343} height={170} fontSize={9}` with `className="h-auto w-full"`. Because
the SVG scales through its `viewBox`, the labels do not render at 9px — they render at whatever
9px scales to once the card stretches to the container's width, so the chart's typography is
divorced from the page's type scale and changes with viewport width. The chart must instead
measure its container and lay out at real pixel dimensions, so label size is constant and
intentional at every width. **Confirmed: in scope.**

**R12.2 — In-flight applications must be legible, not silent.** R5.4 deliberately gives in-flight
rows no outgoing edge, so a node's unfilled remainder is currently unexplained blank space — the
user cannot tell whether it means "still open" or "chart bug." V2.1 must make the shortfall
readable: an explicit annotation, a distinct visual treatment for the unfilled remainder, or an
inline caption. Whatever is chosen must not invent a phantom node or link (which R5.4 forbids) and
must be reflected in the `ChartDataTable` text alternative too, not just the SVG.

**R12.3 — Label placement and interaction. Confirmed: in scope, including hover/focus.** Terminal-
column labels currently place themselves by `x0 < width / 2`, which can put text over ribbons on a
three-column layout. Labels must not overlap ribbons or each other at any supported width. Unlike
the original draft, hover/focus affordances (per-node or per-link detail) are **confirmed in scope
here, not nice-to-have** — they must be keyboard reachable and must not regress the existing
`aria-hidden` SVG + `ChartDataTable` accessibility model. Visual reference for this chart's
flow/stat treatment: [Churnkey's flow chart + stat cards](https://mobbin.com/screens/3ba4f8e2-b296-454f-b5a8-c89c6f3c0ccf)
(inline percentage labels per branch) — user-curated, folded in here rather than a separate
requirement since this is already this chart's surface.

**R12.4 — Node/ribbon geometry is already partly revised (see
[Implemented](#already-implemented-in-this-iteration)).** The current values —
`nodeWidth(10)`, `nodePadding(12)`, and `UNWEIGHTED_STROKE_WIDTH = 5` for the recap's schematic
mode — landed ahead of this PRD. V2.1 may tune them further, but any change must keep the weighted
dashboard chart's proportions truthful (thickness ∝ value) and keep the recap's unweighted mode
uniform.

**R12.5 — Export compatibility is a hard gate.** The recap card is serialized by `html-to-image` at
`pixelRatio: 4` to a 1080×1920 PNG. Any visual change to `RecapCard` or to `SankeyChart` in its
`weighted={false}` mode must be verified in an actual export, not just on screen. **No
Motion/MagicUI animation may be placed inside the exported node** — an in-flight animation
serializes at whatever frame it happens to be on, and Motion's inline transforms are not
guaranteed to survive serialization. Decorative motion around the card in the dialog is fine; inside
the exported subtree it is prohibited.

**R12.6 — Recap card scope. Resolved: yes — a three-skin selectable recap.** R9 already replaced
the recap's headline + tile grid with three hero stats and a schematic Sankey; that design becomes
one of three selectable "skins" a viewer can page through inside `RecapDialog`. See R12.7 and
[Q3](#open-questions--risks).

**R12.7 — Recap skin selector: Strava, Duolingo, Beli (new, confirmed in scope).** Three
interchangeable recap designs, chosen via a keyboard-operable paged control (a carousel) — the
*interaction* Spotify Wrapped uses to page through multiple stat cards, not its visual style,
which is explicitly not used here. All three render the same underlying recap data; the choice is
remembered per user across visits (`localStorage`, non-auth material, same class as F25's theme
key).
- **Strava** — the existing R9 design (three hero stats + schematic Sankey), migrated to a
  **transparent card background** (grounded in `frontend/reference/strava_reference.PNG`, a rough
  layout sketch, not a polished screenshot) instead of the current opaque dark gradient. This
  narrows R11.4's prior "recap card gradient is a permanent exception" note to the other two skins
  only. With no guaranteed dark backdrop behind it anymore, this skin needs its own text/Sankey
  legibility treatment, verified against both a light and a dark test background — not assumed.
- **[Duolingo Year in Review](https://mobbin.com/screens/81b67776-4a5d-40d9-860e-9b3b4122357a)** —
  one dominant hero stat plus a secondary stat grid, opaque background.
- **[Beli monthly recap](https://mobbin.com/screens/7fe2981e-cefd-4a7a-8e57-61ab97fb8e7f)** — a
  ranked-stat layout, opaque background; also restyles (does not rebuild) the existing
  Download/Share buttons — `navigator.share()` already surfaces the OS's own app-icon sheet on
  mobile, so no custom per-app share buttons are added.
R12.5's export gate applies **per skin**: each needs its own reference export at 1080×1920, and no
skin may place Motion/MagicUI animation inside the exported subtree.

### R13 — Applications table without horizontal scroll (must-have)

**R13.1 — The condition.** At 375px width, the applications table must display with **no
horizontal scrollbar and no clipped or truncated-beyond-recognition content**. This replaces
`PRD_V2.md` R8.2's "confirm or fix responsiveness" with a specific, testable requirement.

**R13.2 — Approach. Confirmed: A + B, combined.** Not mutually exclusive, and both are in scope:

| Option | Mechanism | Status |
|---|---|---|
| A — Column priority | Progressively hide Location, then Date Applied, below breakpoints | **Confirmed — in scope.** Applies at intermediate widths, above the breakpoint where B takes over. |
| B — Card list at narrow widths | `<table>` above `sm`, stacked cards below | **Confirmed — in scope.** Best small-screen reading; two renderings of the same data to keep in sync, and sorting/`aria-sort` semantics need a non-table equivalent (R13.5). |
| C — Expandable rows | Two or three columns plus a disclosure row for the rest | Not selected — out of scope for V2.1. |
| D — Slim the Status cell | Drop the `StatusBadge` where the `StatusSelect` already shows the same status; keep the staleness warning | Not explicitly selected. Cheap and orthogonal to A/B — worth doing as a bonus if convenient, but not a required deliverable. |

Combined shape: at desktop/tablet widths the table renders normally; below an intermediate
breakpoint it drops Location then Date Applied (A) per R13.4's "value must still be reachable"
rule; below a narrower breakpoint it switches to the card list (B) instead of continuing to shrink
columns. Exact breakpoints are an implementation decision, not fixed here.

**R13.3 — Cell wrapping.** Whichever approach is taken, the blanket `whitespace-nowrap` on
`TableCell`/`TableHead` in `frontend/src/components/ui/table.tsx` is a primary cause and must be
addressed at the call site (per-column classes), **not** by editing the shadcn primitive in a way
that changes behavior for every future table.

**R13.4 — No data may become unreachable.** If a column is hidden at narrow widths, its value must
still be available — in an expanded row, in the card rendering, in the edit dialog, or as
visually-hidden text. Hiding a column with `display:none` removes it from assistive tech too; that
is only acceptable if the value is genuinely presented elsewhere on the same screen.

**R13.5 — Preserve what the V2 audit fixed.** `aria-sort` on the `<th>`, the sort button's
name-is-just-the-column-name pattern, the staleness warning's `role="img"` + visually-hidden
duplicate, the two polite live regions on `ApplicationsPage`, and the caption's count sentence all
survive. If a card rendering is introduced (option B), it needs its own equivalents — a sort
control that announces state and a count summary — not a silent drop.

**R13.6 — Sorting, filtering and search behavior are unchanged.** This is a layout requirement, not
a data one.

### R14 — Motion layer (implemented + extension) (must-have)

**R14.1 — Already shipped, recorded here.** See
[Already implemented](#already-implemented-in-this-iteration) for the full inventory. In short: the
MagicUI MCP server, the `.claude/rules/magicui-ui.md` rule, the
`docs/decisions/magicui-conventions.md` living conventions doc, the app-root
`<MotionConfig reducedMotion="user">`, and `BlurFade`/`BorderBeam`/`NumberTicker` across Analytics,
Login, Signup, Applications (header only) and Settings. **This work is done. It is not V2.1
scope-to-build.**

**R14.2 — New surfaces inherit the existing conventions, not new ones.** Any motion added to the
landing page or to re-themed surfaces uses the values already fixed in the conventions doc —
`BlurFade` at `duration 0.4s / easeOut / offset 6px / blur 6px`, a `0.08s` stagger step between
sibling groups, `BorderBeam` at `duration 8s`, `NumberTicker`'s default spring — rather than new
per-page numbers.

**R14.3 — The restraint rule holds on the landing page too.** At most **one** continuous/looping
accent visible per view. A marketing page is exactly where this rule is most likely to be broken
and most damaging; entrance animations are exempt (they run once and settle), continuous ones are
not.

**R14.4 — Reduced motion is non-negotiable.** Every animated component must sit under the app-root
`MotionConfig` in `frontend/src/main.tsx`. Nothing may bypass it via a portal outside the tree or a
library that ignores `MotionConfig` without shipping its own equivalent handling. The global CSS
reduced-motion block in `index.css` cannot reach Motion-driven animation on its own.

**R14.5 — The conventions doc and its per-page inventory table must be updated in the same change
as any new MagicUI usage.** Already a project rule; restated because V2.1 will add more MagicUI
than any prior iteration and a stale inventory forces the next session to re-derive everything.

**R14.6 — Additional motion. [unconfirmed]** Candidates discussed but not approved: a celebration
effect on a first `offer` (the conventions doc explicitly reserves `meteors`/`particles`/confetti
for exactly this and nothing else), status-change transitions in the table, chart draw-on animation.
None are in scope until confirmed. Note that chart draw-on animation collides with R12.5's export
prohibition.

### R15 — Design-reference tooling: Mobbin MCP (deferred — skipped for V2.1)

**Confirmed: skip.** Mobbin MCP is **not** being installed or used for V2.1. `.mcp.json` stays at
`shadcn` and `magicuidesign-mcp` only. The fallback that already worked for R9 is used instead: the
user supplies reference material directly (as `frontend/reference/strava_reference.PNG` did),
committed to `frontend/reference/` so the intent is recoverable later (see
[Q7](#open-questions--risks) for what's pending). R15.1–R15.3 as originally scoped (install
before design work begins; research aid only, never a blocker; reference material never ships) are
recorded here as a **future option**, not a V2.1 deliverable, in case a later iteration revisits it.

### R16 — Design-overhaul additions (addendum, new scope, frontend-only)

Recorded per this project's convention of logging newly-scoped work into the PRD as it's decided,
rather than letting `FRONTEND_TASKS.md` carry scope the PRD doesn't reflect (the same precedent
`PRD_V2.md`'s R9 addendum set). Grounded in Mobbin references the user reviewed directly and
curated per area (a research aid only, per R15.2 — nothing installed, nothing shipped). Full detail
and acceptance criteria live in `FRONTEND_TASKS.md`'s Milestone FV11 (F51–F54).

**R16.1 — Optional pipeline board view.** Informed by
[Homerun's kanban pipeline](https://mobbin.com/screens/80dfe542-7c1b-4303-a449-b4f465d615fe) and
[folk's pipeline board](https://mobbin.com/screens/a7d7dd46-1f6d-444b-b1c0-17681af33367). A
status-grouped, kanban-style alternate rendering of the Pipeline page, toggled against the
existing table (default: table), remembered per user. No
drag-and-drop — status changes stay on the existing `StatusSelect` dropdown. Unlike R13's table,
Board is explicitly **exempt** from the no-horizontal-scroll requirement: it may scroll
horizontally on narrow screens, since it's an opt-in alternate view, not the default. Each status
column caps its rendered height and initial card count (with a "show more" reveal) so the view
doesn't degrade at the hundreds-of-applications scale this app expects.

**R16.2 — Add-application entry-flow visual polish.** Informed by
[Programa's "Add product from URL" flow](https://mobbin.com/flows/26df0e89-6fe6-4ea2-b379-ff1349953586).
Styling-only refinement of the existing paste-a-link → autofill → review-form flow (already
structurally close to the reference examined). No new steps, no validation/focus-management
changes.

**R16.3 — Settings page visual polish.** Informed by
[Fresha's gift-card settings](https://mobbin.com/screens/20a4b62e-609b-40b6-a17a-4b08e38c9fd5) and
[Optimal Workshop's settings form](https://mobbin.com/screens/db6e47ed-6dd4-4211-8be5-4125b44c96b5).
Styling-only refinement of the existing single-field settings card. No new settings introduced.

**R16.4 — Analytics stat-tile visual nudge.** Informed by
[Monarch's stat-card treatment](https://mobbin.com/screens/92c2b32c-20a0-4487-9b6c-3f32cb464893)
(not its Sankey — see R12.3 for the Sankey's own reference). Styling-only refinement of the
stat-tile card shell. No change to `NumberTicker`/`BorderBeam` behavior or the
one-continuous-accent rule.

All four depend on R11's final tokens (F27/F28) landing first, and carry no new NFR beyond what's
already stated below (accessibility non-regression, reduced motion, contrast, responsiveness,
documentation).

---

## Already implemented in this iteration

Recorded per this project's convention of logging implementation-driven work back into the PRD
rather than letting the doc go stale (`PRD_V2.md` R9's preamble). **Everything in this section is
done and merged** — it is here so the requirements above are not misread as still-pending, and so
the next session doesn't re-plan it. Descriptions are taken from the current working tree and from
`docs/decisions/magicui-conventions.md`.

| Item | Where | State |
|---|---|---|
| MagicUI MCP server | `.mcp.json` (`magicuidesign-mcp`) | Installed |
| MagicUI usage rule | `.claude/rules/magicui-ui.md` | Written — discovery/install/theming/restraint rules, auto-loaded |
| MagicUI conventions + per-page inventory | `docs/decisions/magicui-conventions.md` | Written — the living registry; timing/easing values, approved-component table, inventory |
| Global reduced-motion provider | `frontend/src/main.tsx` — `<MotionConfig reducedMotion="user">` | Shipped |
| `blur-fade`, `border-beam`, `number-ticker` | `frontend/src/components/ui/` | Installed via `npx shadcn@latest add @magicui/<name>` |
| Analytics animation | `AnalyticsPage.tsx`, `stat-tile.tsx` | `BlurFade` ×3 groups at a `0.08s` stagger; `NumberTicker` on all 5 tiles; one `BorderBeam` on the Total Applications tile |
| Auth animation | `login-form.tsx`, `signup-form.tsx` | `BlurFade` + one `BorderBeam` on the auth card, both routes |
| Applications animation | `ApplicationsPage.tsx` | `BlurFade` on the page header only — toolbar/table deliberately unanimated |
| Settings animation | `SettingsPage.tsx` | `BlurFade` on the settings card |
| App shell | `AppLayout.tsx` | Deliberately unanimated |
| Recap redesign | `recap-card.tsx` | `PRD_V2.md` **R9.2** — three hero stats + schematic Sankey + logo/date footer |
| Dashboard Sankey sizing | `AnalyticsPage.tsx` | `PRD_V2.md` **R9.1** — 343×260 → 343×170 |
| Sankey geometry revision | `sankey-chart.tsx` | `nodeWidth(10)`, `nodePadding(12)`, and `UNWEIGHTED_STROKE_WIDTH = 5` for the recap's `weighted={false}` mode — landed after R9, not previously documented in any PRD |

**Not yet done, despite adjacent work existing:** everything in R10–R13, R11's theme provider,
R14.2/R14.6's new-surface motion, R15, and R16.

---

## Non-functional requirements

- **Accessibility non-regression.** V2 shipped a dedicated accessibility audit. Every fix it made
  — `aria-sort` on `<th>`, the sortable-header naming pattern, the staleness warning's role and
  visually-hidden duplicate, the `ChartDataTable` text alternatives behind every `aria-hidden`
  chart, the route-change focus move and announcement, the skip link, the polite live regions —
  must still hold after V2.1. A UI overhaul is the single most likely way to silently undo them.
- **Reduced motion.** R14.4. Verified by setting the OS preference and confirming no animation
  plays on any route, landing page included.
- **Contrast.** Any new palette must meet WCAG AA for text and UI components **in both light and
  dark themes**. Verified, not assumed — the current palette passes largely because it is grayscale.
- **Responsiveness.** 375px remains the floor for every surface, now including the landing page,
  and now with the stronger no-horizontal-scroll condition of R13.1.
- **Export fidelity.** The recap PNG must still export at 1080×1920 with no blank, missing or
  mid-animation regions (R12.5).
- **Bundle cost.** The landing page must not pull decorative dependencies into the authenticated
  app's critical path, and vice versa. Route-level code splitting if the landing page's motion
  dependencies are non-trivial.
- **Documentation.** `docs/decisions/magicui-conventions.md`'s conventions **and** its per-page
  inventory table are updated in the same change as the code (R14.5). If R11 changes the palette,
  the token decision and its rationale are recorded — the conventions doc's theming section is the
  natural home.

## Success metrics

Each is a check someone can actually perform:

- At a 375px viewport, the applications page has **no horizontal scrollbar**, and every value from
  all five data columns is reachable on that screen (visually or via an expand/card affordance).
- A logged-out visit to the site root renders the landing page, and the network panel shows **no
  authenticated API request** during that render.
- A visitor can state what jTracks does after reading the hero alone, and reach signup in one click.
- The theme control switches light/dark, the choice survives a reload, and there is no flash of the
  wrong theme on load.
- Every route — landing, login, signup, tracker, analytics, settings, and both dialogs — has been
  opened in **both** themes and is legible in both, with no contrast failures.
- With the OS reduced-motion setting enabled, no animation plays anywhere, including the landing
  page.
- The recap still exports to a clean 1080×1920 PNG after the R12 restructure, with the Sankey fully
  rendered.
- A user looking at the dashboard Sankey can tell which applications are **still in flight** without
  being told (R12.2).
- No new axe/Lighthouse accessibility violations on any route relative to the pre-V2.1 baseline.

## Constraints & assumptions

- **Frontend-only. Confirmed.** No `backend/` change, no schema change, no `API_SPEC_V1.md` change.
  The landing page uses hard-coded demo data (R10.2).
- **Stack unchanged.** React 19 + TS + Vite + Tailwind v4 + shadcn (Base UI) + react-router v7 +
  Recharts + d3-sankey + Motion.
- **shadcn is mandatory for structure; MagicUI is decorative only.** `.claude/rules/shadcn-ui.md`
  and `.claude/rules/magicui-ui.md` govern. MagicUI components are installed via
  `npx shadcn@latest add @magicui/<name>`, never hand-copied, and are never used to reimplement a
  shadcn primitive.
- **Every MagicUI component's real source is inspected via `getRegistryItem` before use**, and its
  hardcoded default colors are overridden at the call site with this project's CSS variable tokens
  — never by editing the installed `components/ui/*.tsx` file.
- **No live users, no live data.** No migration, no comms, no deprecation window. The board may be
  reset.
- **Single developer, no deadline.**
- **Workstream:** entirely FRONTEND, plus `docs/decisions/` and `.mcp.json`.
- **The V2 data contract is frozen for this iteration.** The Sankey payload, the recap payload, the
  status enum and every metric definition are inputs to V2.1, not subjects of it.

## Open questions / risks

Q1, Q2, Q3, Q4, Q5 and Q6 (below, struck through) are **resolved** — kept for traceability. Q7
remains fully open.

- ~~Q1 — Landing page: audience and routing.~~ **Resolved.** Genuine public marketing page;
  routing option B (`/` public, app moves to `/app`). See R10.1 and Target users.
- ~~Q2 — Theming: how far?~~ **Resolved.** Neutral + one accent hue (not a full themed palette);
  working light/dark/system toggle **is** in scope for V2.1. See R11.1–R11.2.
- ~~Q3 — "Restructure the Sankey and the recap visually" — the undescribed item.~~ **Resolved:
  superseded.** Confirmed in scope: fixed/intentional label sizing (R12.1) and label/ribbon-
  collision fixes plus hover/focus detail (R12.3). The previously-undescribed "something else" and
  R12.6's open recap scope are now both resolved by the broader design-overhaul direction the user
  confirmed — no separate item remains. R12.6/R12.7 record the recap's concrete resolution (a
  three-skin selector, grounded in Mobbin references plus `strava_reference.PNG`); R16 records the
  rest of that direction (board view, entry-flow/settings/stat-tile polish) as new scope outside
  R12.
- ~~Q4 — Table approach.~~ **Resolved.** A (column priority hide) + B (card list at narrow
  widths), combined. D (slim the Status cell) was not selected as a required deliverable but
  remains a cheap optional bonus. C (expandable rows) is out of scope. See R13.2.
- ~~Q5 — Mobbin MCP.~~ **Resolved: skipped for V2.1.** Not installed, not used. See R15.
- ~~Q6 — Is V2.1 truly frontend-only?~~ **Resolved: yes, confirmed.** See Constraints &
  assumptions.
- **Q7 — Reference material — still open.** The user confirmed more reference material is coming
  (beyond `frontend/reference/strava_reference.PNG`) for the landing page and theming direction,
  but it had not been supplied as of this revision. R11 (palette) and R10 (landing page) can
  proceed on the confirmed defaults above without it, but should incorporate it if it arrives
  before those stages start.

**Risks:**

- **A UI overhaul is the most efficient way to silently undo an accessibility audit.** Focus rings,
  contrast, `aria-sort`, live regions and the chart text alternatives are all in the blast radius of
  a re-theme and a table restructure. Treat the V2 audit as a regression suite, not history.
- **Dark mode doubles the verification surface** and the app has no visual regression testing. Every
  route, both themes, both viewport extremes is a manual matrix that grows with every screen.
- **The recap export is the most fragile thing V2.1 touches.** `html-to-image` at `pixelRatio: 4`
  is sensitive to how styles are applied, and Motion-driven inline transforms and some gradient/
  filter constructs do not serialize reliably. R12.5 is a gate, not a guideline — verify with a real
  export early, not at the end.
- **The landing page's product visual will drift** from the real product if it's a screenshot, and
  will couple the landing route to app internals if it's the real component (R10.4). Neither option
  is free; pick deliberately.
- ~~**"Restructure visually" is the vaguest item in this document** and, until Q3 is answered, the
  most likely to produce work that is thrown away. R12 should not start before it is answered.~~
  **Resolved** — see Q3, R12.6/R12.7.
- **MagicUI on a marketing page invites overuse.** R14.3's one-continuous-accent rule exists
  precisely for this and will feel wrong in the moment; the conventions doc is the tiebreaker, not
  taste-in-the-moment.
- **Mobbin MCP is unproven in this repo.** It is not installed, its output quality is unknown, and
  R15.2 deliberately makes it optional so nothing stalls behind it.

---

## Out of scope (V2.1)

- Any backend, API, schema or migration work.
- New metrics, new analytics, status-event log (still deferred — `PRD_V2.md`'s known limitation
  stands).
- CSV import/export (design of record remains in `PRD_V2.md`'s *Deferred: CSV import/export*).
- Status-distinction onboarding (still deferred — `PRD_V2.md`).
- Marketing infrastructure: CMS, blog, pricing, email capture, third-party analytics, cookie
  consent, SSR/prerendering, OG image generation, sitemap/structured data.
- User-configurable theming beyond light/dark/system. No custom accent picker, no density setting.
- Component-library replacement, i18n, native app, browser extension.
- Everything already out of scope in V1 and V2.

---

## Delivery sequence

Proposed ordering. Each stage is independently shippable and leaves the app working.

0. **Done — MagicUI foundation.** MCP server, rules, conventions doc, `MotionConfig`, the
   `BlurFade`/`BorderBeam`/`NumberTicker` pass, R9's recap redesign, and the Sankey geometry
   revision. Recorded in [Already implemented](#already-implemented-in-this-iteration); no work
   remains here.
1. **R11 — theming tokens (and the theme provider).** First, because everything built afterwards
   should be built in the final palette rather than re-themed twice. Q2 resolved (accent hue +
   dark mode); ready to start.
2. **R13 — applications table.** Self-contained, highest day-to-day UX payoff, no dependency on
   anything else. Q4 resolved (A + B); ready to start. R13.2's option D can land immediately
   regardless if convenient.
3. **R12 — Sankey and recap restructure.** After the palette exists, since status colors are the
   chart's primary visual language. Q3 is now fully resolved (R12.6/R12.7's three-skin recap
   selector); R12.7's skin infrastructure (`FRONTEND_TASKS.md` F48) must land before the Duolingo/
   Beli skins (F49/F50). Verify the export (R12.5) at the start of this stage, not the end, and
   again per skin once R12.7 lands.
4. **R10 — landing page.** Largest new surface; depends on the palette and reuses the restructured
   chart/recap for its product visual. Q1 resolved (public marketing page, routing option B);
   ready to start once R11 lands.
5. **R14.2 / R14.6 — motion on the new surfaces**, plus the conventions-doc and inventory update.
   Last, so motion is applied to finished layouts rather than being reworked as they change.
6. **R16 — design-overhaul additions** (board view, entry-flow/settings/stat-tile polish). Depends
   on R11's tokens landing first, same reasoning as R12/R13; otherwise independent of every other
   stage. `FRONTEND_TASKS.md`'s Milestone FV11 (F51–F54).

**R15 (Mobbin MCP)** is not a stage — if it's happening, it happens before stage 1's design work
begins, and nothing waits on it.
