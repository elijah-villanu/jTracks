# ADR: Sankey rendering library (F14)

Status: Accepted — 2026-08-20 (export verdict confirmed by browser-based verification)
Deciders: Frontend (solo developer)
Related tasks: F14 (spike, this file), F15/F16/F18 (blocked on this)
Related PRD: PRD_V2.md R5 (Sankey flow visualization)

## Context

PRD_V2.md R5 wants a Sankey diagram on the dashboard and inside the shareable
recap image (`components/dashboard/recap-dialog.tsx`, shipped in V1/F8). The
recap image is exported client-side with `html-to-image`'s `toBlob()` — a
transparent-background, DOM-serialization-based PNG export, **not** a
`<canvas>` renderer. Whatever draws the Sankey has to survive that exact
export path, since the PRD explicitly calls out canvas-based chart libraries
and anything depending on external stylesheets/web fonts as the likely
failure mode (`html-to-image` walks the live DOM/SVG tree and re-serializes
it; it does not "screenshot" a `<canvas>` element's pixels in a way that
reliably round-trips).

The three levels of the topology (`Applied → Interviewing / OA → Offer` /
`Failed Interview/OA`, plus `Applied → Rejected` / `Ghosted`) come from the
backend's `sankey` payload (`nodes`/`links`, see
`src/mocks/handlers/dashboard.ts`'s `buildSankey()` for the F11 mock shape).
R5.4 additionally requires the renderer to handle nodes whose value exceeds
the sum of their own outgoing links, without fabricating a phantom link or
rescaling real links to paper over the gap.

## Options considered

1. **Recharts' Sankey** (`recharts` is already a dependency, ^3.8.0).
   Recharts does ship a `<Sankey>` component, but it's a thin, largely
   unmaintained wrapper with a fixed node-value model (it derives node
   height from link sums) and no first-class way to force a node's height to
   its own value independent of its links — exactly what R5.4 needs. It
   renders to SVG (good for export), but the topology/label control needed
   here (long labels, partial-outflow nodes) would mean fighting the
   component's built-in layout rather than using it. Rejected: doesn't
   actually solve R5.4 without hacks, and the PRD already flags it as
   "limited."

2. **A canvas-based chart library** (e.g. Chart.js + a Sankey plugin,
   Visx's canvas mode, etc.). Rejected outright per the PRD's own gate:
   canvas content is exactly what `html-to-image` struggles to serialize
   reliably (it re-renders DOM nodes to an SVG `<foreignObject>` internally;
   a `<canvas>`'s pixel buffer isn't part of that DOM-to-SVG walk the way a
   plain element's computed styles are). Not worth prototyping given
   `recap-dialog.tsx` is already a proof that plain DOM/SVG is what works
   with this exact export call.

3. **`d3-sankey` (layout algorithm only) + hand-rolled `<svg>`** — chosen.
   `d3-sankey` computes node/link positions (x0/x1/y0/y1, link widths) and
   nothing else; the actual `<rect>`/`<path>`/`<text>` elements are plain
   SVG, styled with inline SVG attributes (no Tailwind classes on the SVG
   primitives themselves, since fill/stroke need runtime-computed values,
   but the surrounding card *is* Tailwind, matching `recap-card.tsx`'s
   pattern). No canvas anywhere, no external stylesheet or web-font
   dependency (`fill="currentColor"` inherits from surrounding DOM, no
   `@font-face`). This is structurally identical to how `recap-card.tsx`
   already works with `html-to-image` in production (F8) — plain DOM/SVG,
   not a chart-library black box — which is the strongest available
   evidence this will export cleanly.

## Decision

**`d3-sankey` (`npm install d3-sankey @types/d3-sankey`) for layout, rendered
by hand into plain `<svg>`.** See
`frontend/src/components/dev/sankey-prototype.tsx` for the prototype
(`SankeyPrototype`) and `frontend/src/routes/dev/SankeySpike.tsx` for the
spike page it's wired into.

### Bundle-size cost

Two measurements, in increasing order of trustworthiness:

- **Rough proxy** (`du -sh node_modules/<pkg>`, uncompressed, unpacked
  source — not what ships): `d3-sankey` 678K, plus its own pinned deps
  `d3-array@2.12.1` (244K) and `d3-shape@1.3.7` (358K) — these are **not**
  deduped against the `d3-array@3.2.4`/`d3-shape@3.2.0` that `recharts`
  already pulls in transitively via `victory-vendor`, since they're
  different majors (`npm ls d3-sankey d3-array d3-shape` confirms two
  separate copies in the tree). `d3-sankey`'s own minified build
  (`node_modules/d3-sankey/dist/d3-sankey.min.js`) is 5,652 bytes.
- **Real measurement** (the number that actually matters): a production
  `vite build` with the spike route/component present vs. removed —
  `d3-array`/`d3-shape` are ESM/tree-shakeable, so only the functions
  `d3-sankey` and this prototype actually call get bundled, not the two
  full duplicate packages the proxy above implies.
  - Without: `dist/assets/index-*.js` 828.26 kB, gzip 255.19 kB
  - With: `dist/assets/index-*.js` 841.37 kB, gzip 259.33 kB
  - **Delta: +13.11 kB minified / +4.14 kB gzip.** Small, and in line with
    the PRD's "a few KB" expectation for `d3-sankey` alone — tree-shaking
    absorbs most of the theoretical `d3-array`/`d3-shape` duplication cost
    the raw `du -sh` numbers would suggest.

### R5.4 handling ("in-flight applications don't flow anywhere")

`d3-sankey` supports `node.fixedValue` (see
`node_modules/d3-sankey/src/sankey.js`'s `computeNodeValues`): if set, the
node's rendered value is exactly `fixedValue`, **not**
`max(sum(sourceLinks), sum(targetLinks))` (the library's default when
`fixedValue` is unset). `SankeyPrototype` sets `fixedValue: node.value` for
every node from the payload, so:

- A node's rectangle height always reflects its true `value`, independent
  of how much of that value actually has outgoing links.
- The shortfall renders as unfilled space at the bottom of the node's own
  vertical slot — `d3-sankey`'s `computeLinkBreadths` stacks a node's
  `sourceLinks` starting from its `y0`, so a node with less outflow than
  inflow simply has links that don't reach all the way to `y1`. No phantom
  link is created, and no existing link's width is rescaled to compensate.
- Verified against a fixture (`SANKEY_FIXTURE` in `SankeySpike.tsx`) with
  `applied` at value 60 and outgoing links summing to only 38 (a clearly
  visible ~37% gap), plus a second, smaller instance of the same case at
  `interviewing_oa` (value 12, outflow 7) to confirm it isn't a coincidence
  specific to one node in the topology.

One data-shape observation surfaced while building this fixture, worth
flagging to F16 (not a rendering defect, and out of scope to fix here): in
the real `buildSankey()` mock (`src/mocks/handlers/dashboard.ts`), the
`interviewing_oa` node's `value` is defined as *only* the current
literal-status count, while the `applied → interviewing_oa` link's value
additionally includes rows that have since moved on to `offer`/`failed`
(`interviewingOa + offer + failed`). Whenever `offer` or `failed` is
nonzero, that link's value can exceed the `interviewing_oa` node's own
`value` — the inverse of R5.4's documented case (inflow > value rather than
outflow < value). `fixedValue` doesn't create a rendering error in that
case either (the node just draws at its own fixed height while the
incoming ribbon's computed width may exceed it), but it's a real visual
edge case F16 and F15's legibility pass should be aware of and decide how
to handle, since it isn't the R5.4 shortfall this task was scoped to solve.

## Export verification

**Confirmed working.** Verified live in a real Chrome tab (via the `/dev/sankey-spike` page) by calling the
exact `html-to-image` module the app loads (resolved at runtime via
`performance.getEntriesByType('resource')` to its Vite dev-server URL, then `import()`ed directly) and
invoking `toPng(exportContainer, { pixelRatio: 4 })` on the real, on-screen 270×480 export container — the
same call signature `recap-dialog.tsx` uses in production. Inspected the resulting PNG programmatically
(drew it to a canvas, sampled pixels) and visually (rendered it over a checkerboard background alongside the
live component for a side-by-side comparison):

- **Dimensions:** exactly 1080×1920 — 270×480 at pixelRatio 4, the correct Instagram-Stories resolution.
- **Transparency:** the corner pixel (outside the card's `rounded-[20px]` radius) is `rgba(0,0,0,0)` —
  fully transparent, confirming the outer canvas has no background fill (the `backgroundColor` option is
  correctly omitted). The card's own interior is fully opaque (`alpha 255`), matching the gradient
  background and Sankey content actually painting.
- **Content fidelity:** the exported image is visually identical to the live on-screen component — the
  Sankey's ribbons, node colors, and full label text (`"Interviewing / OA"`, `"Failed Interview/OA"`,
  including the R5.4 gap at the `Applied` node) all survived the DOM→SVG→canvas→PNG pipeline uncut and
  unabbreviated. Screenshot comparison on file (not committed — dev-only verification artifact).

**One caveat, not a defect in the rendering approach:** in this sandboxed/CDP-automated browser session,
the `toPng()` call took roughly 90–150 seconds to resolve — much slower than F8's plain-DOM recap card is
known to export in normal use. To isolate whether this was Sankey-specific, the same call was run in
parallel against a trivial control `<div>` with no Sankey content at all; **the control was equally slow**
(~85s), which points to an environment/tooling artifact of this specific automated session (in the same
family as this project's previously-documented `resize_window` non-functionality under CDP automation, see
F9's verification notes) rather than a cost of the Sankey diagram itself. The relative overhead of the
Sankey content over the control (~154s vs ~85s, roughly +80%) is real and worth keeping an eye on at F16/F18
time in a normal, human-driven browser session, but is not the multi-minute hang the raw numbers above might
suggest on their own.

## F15: legibility at ~375px

**Verdict: legible, no fallback needed.** Tested via a real Chrome tab against `SankeyPrototype` (F14) fed
F14's `SANKEY_FIXTURE`, which deliberately carries the two longest R1.3 labels
(`"Interviewing / OA"`, `"Failed Interview/OA"`) plus the R5.4 partial-outflow case.

**Mobile dashboard case (the PRD's stated real risk).** Added a `343px`-wide render to the spike page
(`343px` = a `375px` viewport minus `16px` padding each side, matching `AppLayout.tsx`'s existing `px-4`
convention) at `fontSize={9}`. Screenshot taken and zoomed for inspection. Result: every label — including
both long ones — renders fully, on one line, with no truncation, no wrapping, and no visible overlap between
adjacent labels even where two link targets (`Offer`, `Interviewing / OA`) sit close together vertically.
Verdict holds without needing a rotated/abbreviated-label or vertical-layout fallback.

**Recap image case.** Re-inspected the F14 export container render (`270px` card width, `fontSize={7}` —
smaller than the dashboard case since the card itself is smaller). Labels are legible but **tight**: vertical
spacing between the `Offer (4)` / `Interviewing / OA (12)` / `Failed Interview/OA (3)` cluster is the
smallest margin in either test. Not unreadable, and the actual PNG export is 4x pixel density (see F14's
export verification), so it reads crisply at native size on a phone screen — but this is the closer call of
the two, exactly matching the PRD's own framing ("the recap is plausible; the mobile dashboard is the real
risk"). **Recommendation for F16/F18, not a blocking issue:** if real production data ever produces a
`status_breakdown` with a status count that pushes a label to double digits plus a longer company-name-style
context (not applicable here, labels are fixed strings, so this is a low-probability concern) or if node
padding needs to shrink further to fit more nodes, revisit `nodePadding`/`fontSize` in the recap-sized render
specifically before shipping F18 — the dashboard-sized render has comfortable headroom, the recap-sized one
does not.

**No fallback implemented or required** — R5.6/R8.2's contingency (abbreviated/rotated labels, a
vertical layout under a breakpoint, or falling back to the existing breakdown chart on narrow viewports) is
not needed given the above. F16 should carry the same `fontSize`/`marginX`/`marginY` proportions validated
here (≈9px font at dashboard scale, ≈7px at recap-card scale) rather than reinventing them.

## Addendum: `d3-sankey` behavior on the orphan-node / empty-links contract (pre-F16 check)

The backend confirmed a contract refinement after F14/F15 landed: `sankey.nodes` always has all 6
non-`saved` entries (including zero-value ones), but **`sankey.links` omits any link with `value: 0`** —
so `links` has 0–5 entries, not always 5, and orphan nodes (referenced by no link at all) are routine, not
an edge case. Tested `d3-sankey`'s raw layout output directly (via the same runtime module the app loads,
called from a live browser tab, not just read from docs) against four payload shapes before F16 starts,
per the backend's own suggestion:

1. **`total = 0`** (all 6 nodes at value 0, `links: []`) — layout call does not throw, but **every node's
   `x0`/`x1` come back `null`** (`y0`/`y1` compute fine). `d3-sankey` derives a node's horizontal column
   purely from graph traversal over `links`; with zero links, no node has a determinable depth.
2. **Everything still in `applied`** (`applied` at real value 60, five nodes at 0, `links: []`) — same
   failure: `x0`/`x1` are `null` for **every** node, including `applied` itself, despite `applied` having
   a real nonzero value and correctly-computed `y0`/`y1` (`8` to `312`).
3. **One link carrying 100% of flow** (two real nodes, four zero-value orphans, one link) — all six nodes
   get valid, sensible `x0`/`x1`/`y0`/`y1`. The four orphans default to the rightmost column
   (`x0: 325`) at zero height (`y0 === y1`) — a correct, harmless placement, not an error.
4. **A realistic mixed graph** (F14's own fixture shape, with `offer` forced to value 0 and no link
   referencing it, alongside four real links elsewhere) — same result as case 3: the orphan `offer` node
   gets a valid position (rightmost column, zero height) and every other node's position is unaffected.

**Conclusion: orphan nodes are handled correctly by `d3-sankey` whenever `links` is non-empty — this needs
no special handling in F16 beyond what `SankeyPrototype` already does.** The only real failure mode is the
fully-empty-`links` case (cases 1 and 2 above), where `x0`/`x1` are `null` for literally every node,
including ones with real values. This is not a corner case to patch around in the renderer — **it is
exactly PRD R5.6's two documented degenerate states** ("`total === 0`" and "every submitted row still
sitting in `applied` ... no links at all"), which F17 is already scoped to handle as a **dedicated empty-state
message, not a rendered diagram** ("No applications in this range have moved past Saved yet.", matching
`status-breakdown-chart.tsx`'s existing pattern). **The implication for F16/F17: detect `links.length === 0`
before calling the `d3-sankey` layout at all, and render F17's empty state instead of attempting to lay out
a graph `d3-sankey` cannot position.** Do not add a manual x0/x1 fallback (e.g. `?? 0`) to paper over the
`null`s in this case — that would silently render a broken, collapsed-to-the-left-edge diagram instead of
the intentional empty state the PRD actually calls for.
