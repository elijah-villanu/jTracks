import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { sankey, sankeyLinkHorizontal } from "d3-sankey"
import type { SankeyGraph, SankeyNode as D3SankeyNode } from "d3-sankey"
import { ChartDataTable } from "@/components/dashboard/chart-data-table"
import { STATUS_BREAKDOWN_COLORS } from "@/components/dashboard/status-breakdown-chart"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ApplicationStatus, Sankey, SankeyLink } from "@/types/api"

type NodeExtra = { key: ApplicationStatus; label: string }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentionally the "no extra properties" case d3-sankey's own types expect (see SankeyExtraProperties)
interface LinkExtra {}

/** Ribbon thickness used for every link when `weighted={false}`, instead of d3-sankey's real value-proportional `link.width`. */
const UNWEIGHTED_STROKE_WIDTH = 5

/**
 * F37: statuses that can carry *outgoing* flow in the pipeline (R1.3's
 * Applied -> Interviewing/OA -> Offer|Failed, Applied -> Rejected|Ghosted
 * shape). These are the only two keys a node "shortfall" (value with no
 * matching outgoing link) can mean "still in flight" for -- every other
 * status is a pipeline terminus by definition, so it never has outgoing
 * links and an unfilled remainder there wouldn't mean anything. This
 * mirrors this file's own R5.4 doc note below ("rows still sitting in
 * `applied` / `interviewing_oa`") -- it's the same fixed pipeline-shape
 * knowledge already relied on there and in `SankeyEmptyPlaceholder`, not a
 * re-derivation of topology from `status_breakdown` (R5.5): the actual
 * shortfall *amount* below is still computed purely from this payload's
 * own `nodes`/`links`.
 */
const NON_TERMINAL_STATUSES: ReadonlySet<ApplicationStatus> = new Set(["applied", "interviewing_oa"])

/** Extra top margin reserved, beyond `marginY`, for a pass-through node's F38 above-node label -- see `topInset` in the component body. */
const ABOVE_LABEL_HEADROOM = 6

export interface SankeyChartProps {
  data: Sankey
  /**
   * Fixed pixel width. Omit it to have the chart measure its own wrapping
   * element's content-box width via `ResizeObserver` instead (F36) --
   * real, constant-px sizing at every breakpoint (not a scaled viewBox),
   * so `fontSize` renders at the same computed pixel size everywhere.
   * Measurement is opt-in via omission, never mandatory: `RecapCard`
   * always passes an explicit `width` (230, its fixed 270px-wide export
   * target), which skips the `ResizeObserver` entirely and renders at
   * that exact size, unchanged from before F36. When omitting `width`,
   * `className` must give the wrapping element a real width of its own
   * (e.g. `"w-full"`, as `AnalyticsPage` does) -- a shrink-to-fit wrapper
   * has nothing to measure.
   */
  width?: number
  height: number
  /** Room reserved on each side/top/bottom for the layout extent, in px. */
  marginX?: number
  marginY?: number
  fontSize?: number
  className?: string
  /**
   * Status -> color map for node `fill` / ribbon `stroke`. Defaults to
   * the theme-aware `STATUS_BREAKDOWN_COLORS` (F28), which is correct for
   * every live, in-app instance of this chart (the CSS cascade resolves
   * its `var(--status-*)` references against whichever theme is active).
   * `RecapCard` passes `STATUS_LITERAL_COLORS` instead -- see that
   * module's doc comment for why the exported instance needs fixed,
   * theme-independent values.
   */
  colors?: Record<ApplicationStatus, string>
  /**
   * `true` (default): node/link thickness is proportional to value, per
   * R5.4 -- the dashboard's accurate, to-scale rendering.
   *
   * `false`: a schematic variant for the simplified recap card (see
   * PRD_V2.md's Recap redesign addendum) -- every node still shown gets a
   * uniform `fixedValue` and every link a uniform stroke width, so the
   * diagram conveys *which stages the flow passed through*, not their
   * relative volume. Zero-value nodes are dropped rather than rendered at
   * the same uniform size, since a status nobody reached should not
   * appear at all. Topology (which nodes/links exist) is never altered --
   * only their rendered size -- so this still satisfies R5.5's "frontend
   * must not re-derive the topology."
   */
  weighted?: boolean
  /**
   * F38: mounts a keyboard-reachable hover/focus detail affordance (a
   * transparent, real `<button>` per node, anchored with shadcn's
   * `Tooltip`) layered over the `aria-hidden` SVG -- outside it in the
   * DOM, never ARIA bolted onto the SVG's own `<rect>`/`<path>` elements,
   * which would regress F16's a11y model. Dashboard-only: `RecapCard`'s
   * static export target never sets this, per F35's rule that nothing
   * interactive/animated belongs in the exported subtree. No-op unless
   * `weighted` is also true (an unweighted node's uniform `fixedValue`
   * carries no real total to report).
   */
  interactive?: boolean
}

interface SankeyEmptyPlaceholderProps {
  width: number
  height: number
  /** The `applied` node's `value` from the payload -- see the two-case split below. */
  appliedValue: number
  className?: string
}

/**
 * F17: dedicated empty-state UI for the two degenerate cases that both
 * produce `links.length === 0` (see the addendum in
 * docs/decisions/sankey-library.md and the doc comment on `SankeyChart`
 * below for why `d3-sankey` cannot lay these out at all). The two cases
 * read very differently to a user and get distinct copy:
 *
 * - `appliedValue === 0`: `total === 0`, a genuinely empty board. Reuses
 *   the exact message/styling `status-breakdown-chart.tsx` already uses
 *   for its own empty state, for consistency across the dashboard's two
 *   charts.
 * - `appliedValue > 0`: every submitted row is still sitting in `applied`
 *   -- real in-flight activity, not an empty board. Telling this user
 *   "nothing here" would be wrong and mildly demoralizing right when their
 *   funnel is most interesting to them, so this case gets its own
 *   progress-framed copy instead.
 */
function SankeyEmptyPlaceholder({ width, height, appliedValue, className }: SankeyEmptyPlaceholderProps) {
  const allStillApplied = appliedValue > 0
  const message = allStillApplied
    ? `All ${appliedValue} application${appliedValue === 1 ? "" : "s"} ${appliedValue === 1 ? "is" : "are"} still in flight — outcomes will appear here as they land.`
    : "No applications in this range have moved past Saved yet."

  // A11y: this used to be `role="img" aria-label={message}` wrapping the
  // very same message as text. `role="img"` makes a container's contents
  // opaque to assistive tech, so the visible sentence was being replaced
  // by an identical aria-label -- pure redundancy that also stopped the
  // text from being reachable with a screen reader's normal read-next
  // command. It's plain prose; let it be plain prose.
  return (
    <p
      className={`m-0 flex items-center justify-center text-center text-sm text-muted-foreground ${className ?? ""}`}
      style={{ width, height }}
    >
      {message}
    </p>
  )
}

/**
 * F36: measures a wrapping element's content-box width via
 * `ResizeObserver`, for the container-measured sizing mode (the `width`
 * prop omitted). `enabled=false` skips creating the observer entirely --
 * explicit-width callers (`RecapCard`) never pay for or trigger this.
 *
 * Anti-thrash (F36's stated risk): the wrapping element's own width is
 * driven by its *parent's* layout (a block element sized by its
 * container's flow), never by the SVG's own rendered size -- the SVG
 * inside it is always given a fixed pixel `width` attribute equal to the
 * last measured value, and setting a fixed pixel attribute on a child
 * does not feed back into a block parent's width the way `width: auto`
 * content sizing can. Combined with rounding to whole pixels and a
 * `requestAnimationFrame`-batched update that's a no-op when the rounded
 * value hasn't changed, measure -> layout -> element resizes -> measure
 * again cannot loop.
 *
 * Two things this deliberately does *not* do, both found during F39's
 * real-browser pass:
 *
 * 1. **It does not wait for `requestAnimationFrame` to produce a first
 *    width.** The width is seeded synchronously from
 *    `getBoundingClientRect()` the moment the node attaches. An
 *    rAF-only first measurement means the component renders an empty
 *    box until a frame is served -- and a tab that is hidden or
 *    occluded is served no frames at all (Chrome throttles both rAF and
 *    `ResizeObserver` delivery there), so the chart stayed permanently
 *    blank. rAF is still used to debounce *subsequent* resizes, which is
 *    what it's actually good for.
 * 2. **It does not capture the node in an effect with static deps.**
 *    This component swaps its wrapper element -- the zero-width
 *    placeholder branch below renders a different `<div>` than the
 *    resolved chart does -- so an observer bound once to
 *    `measureRef.current` would go on watching a detached node and never
 *    see another resize. A callback ref re-binds the observer whenever
 *    the underlying node actually changes.
 */
function useMeasuredWidth(enabled: boolean) {
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const frameRef = useRef(0)

  const measureRef = useCallback(
    (element: HTMLDivElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      cancelAnimationFrame(frameRef.current)

      if (!enabled || !element) {
        return
      }

      const seed = Math.round(element.getBoundingClientRect().width)
      if (seed > 0) {
        setMeasuredWidth((previous) => (previous === seed ? previous : seed))
      }

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) {
          return
        }
        const next = Math.round(entry.contentRect.width)
        cancelAnimationFrame(frameRef.current)
        frameRef.current = requestAnimationFrame(() => {
          setMeasuredWidth((previous) => (previous === next ? previous : next))
        })
      })
      observer.observe(element)
      observerRef.current = observer
    },
    [enabled]
  )

  useEffect(
    () => () => {
      observerRef.current?.disconnect()
      cancelAnimationFrame(frameRef.current)
    },
    []
  )

  return { measureRef, measuredWidth }
}

/**
 * Real F16 Sankey component -- renders the backend's `sankey` payload
 * (`GET /dashboard/stats`/`GET /dashboard/recap`) as plain SVG (<rect>
 * nodes, <path> ribbons via d3-sankey's sankeyLinkHorizontal(), <text>
 * labels), matching F14's chosen approach
 * (docs/decisions/sankey-library.md) so it survives html-to-image export
 * unchanged. Topology comes entirely from `data.nodes`/`data.links` --
 * never re-derived from `status_breakdown` (R5.5). Sizing props are kept
 * flexible so this can sit at both the dashboard scale (container-
 * measured width, fontSize ~9) and the recap-card scale (fixed 230px
 * wide, fontSize ~6).
 *
 * R5.4 handling: each node's `value` is passed through as d3-sankey's
 * `node.fixedValue` (see computeNodeValues in
 * node_modules/d3-sankey/src/sankey.js) instead of letting the library
 * derive it from the sum of the node's links. That means a node's
 * rectangle height always reflects its true value even when its outgoing
 * links sum to less than that value (rows still sitting in `applied` /
 * `interviewing_oa`) -- the shortfall reads as unfilled space at the
 * bottom of the node's own slot. F37 gives that unfilled space its own
 * visual treatment (a lower-opacity, dashed-outline cap on the node rect)
 * plus an inline "N in flight" label and a `ChartDataTable` row/summary
 * clause, instead of leaving it silent -- computed as `node.value - sum
 * (outgoing link values)` straight from `data`, never from a phantom
 * node/link (R5.4/R5.5 forbid inventing either).
 *
 * Empty-links guard: per the addendum in docs/decisions/sankey-library.md,
 * `d3-sankey` returns `x0`/`x1` as `null` for *every* node (including ones
 * with real nonzero values) whenever `links.length === 0` -- it derives a
 * node's column purely from graph traversal over `links`. That happens in
 * exactly two real cases: `total === 0`, and everything still sitting in
 * `applied`. Detect that case before calling the layout at all and render
 * a placeholder instead -- do not paper over the nulls with a `?? 0`
 * fallback, which would render a broken, collapsed-to-the-left diagram.
 *
 * F38 label placement: the previous `x0 < width / 2` test only correctly
 * distinguishes a two-column graph's source (label right) from its sinks
 * (label left). This topology is three columns -- `applied` (source-only)
 * -> `interviewing_oa` (both incoming and outgoing links: a pass-through)
 * -> `offer`/`rejected`/`failed`/`ghosted` (sinks, pushed to the rightmost
 * column by d3-sankey's default alignment even though `rejected`/`ghosted`
 * are direct targets of `applied`) -- and the old test put the middle
 * column's label on the right, straight over its own outgoing ribbons.
 * Placement is now derived from each node's real role in `data.links`
 * (source-only / sink-only / pass-through / isolated), not from its raw
 * x-position: a pass-through node's label sits centered *above* its rect
 * instead, clear of both the incoming ribbon (which only touches the
 * rect's left edge) and the outgoing ones (which only touch the right
 * edge). Only an isolated zero-value node (no links at all this cohort)
 * falls back to the old x-position heuristic, which is safe there since
 * no ribbon touches it to collide with.
 */
export function SankeyChart({
  data,
  width,
  height,
  marginX = 8,
  marginY = 8,
  fontSize = 9,
  className,
  colors = STATUS_BREAKDOWN_COLORS,
  weighted = true,
  interactive = false,
}: SankeyChartProps) {
  const shouldMeasure = width === undefined
  const { measureRef, measuredWidth } = useMeasuredWidth(shouldMeasure)
  const effectiveWidth = width ?? measuredWidth ?? 0

  const hasLinks = data.links.length > 0

  const nodeLabel = (key: ApplicationStatus) => data.nodes.find((node) => node.key === key)?.label ?? key

  // F38: which statuses this cohort's own links make a source and/or a
  // target of -- the basis for the per-node label-placement rule above.
  const nodeRoles = useMemo(() => {
    const hasIncoming = new Set<ApplicationStatus>()
    const hasOutgoing = new Set<ApplicationStatus>()
    for (const link of data.links) {
      hasOutgoing.add(link.source)
      hasIncoming.add(link.target)
    }
    return { hasIncoming, hasOutgoing }
  }, [data.links])

  const hasPassThroughNode = data.nodes.some(
    (node) => nodeRoles.hasIncoming.has(node.key) && nodeRoles.hasOutgoing.has(node.key)
  )
  // F38: a pass-through node's label is drawn above its rect, so the
  // layout extent's top edge needs headroom for that text beyond the
  // caller's own `marginY` -- reserved only when a pass-through node is
  // actually present, so topology without one (e.g. the two degenerate
  // states, handled below) keeps the original margins.
  const topInset = hasPassThroughNode ? Math.max(marginY, fontSize + ABOVE_LABEL_HEADROOM) : marginY

  // F37: per-node shortfall (value with no matching outgoing link),
  // derived purely from this payload's own `nodes`/`links` -- never from
  // `status_breakdown` (R5.5) -- and only for the two statuses that can
  // ever have outgoing flow (see `NON_TERMINAL_STATUSES`). Only populated
  // for a real (>0) shortfall, so a fixture with none produces an empty
  // map and therefore no annotation anywhere.
  const shortfallByKey = useMemo(() => {
    const outgoing = new Map<ApplicationStatus, number>()
    for (const link of data.links) {
      outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + link.value)
    }
    const shortfalls = new Map<ApplicationStatus, number>()
    for (const node of data.nodes) {
      if (!NON_TERMINAL_STATUSES.has(node.key)) {
        continue
      }
      const shortfall = node.value - (outgoing.get(node.key) ?? 0)
      if (shortfall > 0) {
        shortfalls.set(node.key, shortfall)
      }
    }
    return shortfalls
  }, [data.nodes, data.links])

  const graph = useMemo<SankeyGraph<NodeExtra, LinkExtra> | null>(() => {
    if (!hasLinks || effectiveWidth <= 0) {
      return null
    }

    const layout = sankey<NodeExtra, LinkExtra>()
      .nodeId((node) => node.key)
      .nodeWidth(10)
      .nodePadding(12)
      .extent([
        [marginX, topInset],
        [Math.max(marginX + 1, effectiveWidth - marginX), Math.max(topInset + 1, height - marginY)],
      ])

    // Unweighted: drop nodes nobody reached (a link's value>0 filter
    // upstream guarantees every node a surviving link still references
    // has value>0, so this can never orphan a link) and give every
    // remaining node/link a uniform size instead of a value-proportional
    // one -- see the `weighted` doc comment above.
    const nodes = weighted ? data.nodes : data.nodes.filter((node) => node.value > 0)

    return layout({
      nodes: nodes.map((node) => ({
        key: node.key,
        label: node.label,
        // R5.4: fixed, not derived from link sums -- see the doc comment above.
        fixedValue: weighted ? node.value : 1,
      })),
      links: data.links.map((link) => ({
        source: link.source,
        target: link.target,
        value: weighted ? link.value : 1,
      })),
    })
  }, [data, hasLinks, effectiveWidth, height, marginX, marginY, topInset, weighted])

  const linkPath = useMemo(() => sankeyLinkHorizontal<NodeExtra, LinkExtra>(), [])

  // F38: per-node geometry/role/shortfall, shared by the SVG's <rect>/
  // <text> and (in `interactive` mode) the overlay hover/focus triggers,
  // so the two never drift apart.
  const positionedNodes = useMemo(() => {
    if (!graph) {
      return []
    }
    return graph.nodes.map((node) => {
      const x0 = node.x0 ?? 0
      const x1 = node.x1 ?? 0
      const y0 = node.y0 ?? 0
      const y1 = node.y1 ?? 0
      const isSource = nodeRoles.hasOutgoing.has(node.key) && !nodeRoles.hasIncoming.has(node.key)
      const isSink = nodeRoles.hasIncoming.has(node.key) && !nodeRoles.hasOutgoing.has(node.key)
      const isPassThrough = nodeRoles.hasIncoming.has(node.key) && nodeRoles.hasOutgoing.has(node.key)
      // Isolated (no links at all this cohort): fall back to the
      // original position heuristic -- safe there, since no ribbon
      // touches an isolated node to collide with either way.
      const labelOnRight = isSink ? false : isSource ? true : x0 < effectiveWidth / 2
      const shortfall = weighted ? (shortfallByKey.get(node.key) ?? 0) : 0
      const outgoingLinks: SankeyLink[] = data.links.filter((link) => link.source === node.key)
      return { node, x0, x1, y0, y1, isPassThrough, labelOnRight, shortfall, outgoingLinks }
    })
  }, [graph, nodeRoles, effectiveWidth, weighted, shortfallByKey, data.links])

  const wrapperClassName = [className, "relative"].filter(Boolean).join(" ")

  // Container-measured mode, first paint before ResizeObserver has ever
  // fired: reserve the authored `height` so nothing shifts once the real
  // width resolves, but don't attempt to lay out a 0-width graph.
  if (shouldMeasure && effectiveWidth <= 0) {
    return <div ref={measureRef} className={wrapperClassName} style={{ height }} />
  }

  if (!graph) {
    const appliedValue = data.nodes.find((node) => node.key === "applied")?.value ?? 0
    if (!shouldMeasure && !interactive) {
      // Explicit-size, non-interactive callers (RecapCard) keep the
      // original, wrapper-free output exactly.
      return (
        <SankeyEmptyPlaceholder width={effectiveWidth} height={height} appliedValue={appliedValue} className={className} />
      )
    }
    return (
      <div ref={shouldMeasure ? measureRef : undefined} className={wrapperClassName}>
        <SankeyEmptyPlaceholder width={effectiveWidth} height={height} appliedValue={appliedValue} />
      </div>
    )
  }

  // F37: node label carries its total, plus an explicit "N in flight"
  // clause when it has a real shortfall -- only in `weighted` mode, since
  // an unweighted node's uniform `fixedValue` has no real total to
  // qualify. A zero-shortfall node's label is unchanged (no "0 in flight"
  // noise).
  const labelFor = (node: D3SankeyNode<NodeExtra, LinkExtra>, shortfall: number) => {
    if (!weighted) {
      return node.label
    }
    return shortfall > 0 ? `${node.label} (${node.value} · ${shortfall} in flight)` : `${node.label} (${node.value})`
  }

  const svgBody = (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${effectiveWidth} ${height}`}
      width={effectiveWidth}
      height={height}
      className={shouldMeasure || interactive ? undefined : className}
    >
      <g>
        {graph.links.map((link) => {
          const source = link.source as D3SankeyNode<NodeExtra, LinkExtra>
          const target = link.target as D3SankeyNode<NodeExtra, LinkExtra>
          const d = linkPath(link)
          if (!d) {
            return null
          }
          return (
            <path
              key={`${source.key}-${target.key}`}
              d={d}
              fill="none"
              stroke={colors[source.key]}
              strokeOpacity={0.35}
              strokeWidth={weighted ? Math.max(1, link.width ?? 0) : UNWEIGHTED_STROKE_WIDTH}
            />
          )
        })}
      </g>
      <g>
        {positionedNodes.map(({ node, x0, x1, y0, y1, isPassThrough, labelOnRight, shortfall }) => {
          const rectWidth = Math.max(1, x1 - x0)
          const rectHeight = Math.max(1, y1 - y0)
          const nodeValue = node.value ?? 0
          // F37: the "filled" (has an outgoing link) portion of the
          // node's own rect fills from the top, matching d3-sankey's own
          // stacking order for a node's `sourceLinks` (see
          // docs/decisions/sankey-library.md) -- the shortfall cap below
          // it is the same status color at lower opacity with a dashed
          // outline, not a new color, so it stays within the existing
          // token palette.
          const filledHeight =
            shortfall > 0 && nodeValue > 0
              ? Math.max(0, Math.min(rectHeight, rectHeight * ((nodeValue - shortfall) / nodeValue)))
              : rectHeight

          return (
            <g key={node.key}>
              <rect x={x0} y={y0} width={rectWidth} height={filledHeight} rx={2} fill={colors[node.key]} />
              {shortfall > 0 && (
                <rect
                  x={x0}
                  y={y0 + filledHeight}
                  width={rectWidth}
                  height={Math.max(0, rectHeight - filledHeight)}
                  rx={2}
                  fill={colors[node.key]}
                  fillOpacity={0.25}
                  stroke={colors[node.key]}
                  strokeDasharray="2 2"
                  strokeOpacity={0.7}
                />
              )}
              {isPassThrough ? (
                <text
                  x={(x0 + x1) / 2}
                  y={y0 - 4}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fill="currentColor"
                >
                  {labelFor(node, shortfall)}
                </text>
              ) : (
                <text
                  x={labelOnRight ? x1 + 4 : x0 - 4}
                  y={(y0 + y1) / 2}
                  dominantBaseline="middle"
                  textAnchor={labelOnRight ? "start" : "end"}
                  fontSize={fontSize}
                  fill="currentColor"
                >
                  {labelFor(node, shortfall)}
                </text>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )

  const dataTable = (() => {
    const shortfallRows = positionedNodes
      .filter(({ shortfall }) => shortfall > 0)
      .map(({ node, shortfall }) => [node.label, "Still in flight", shortfall] as [string, string, number])
    const shortfallSummary = shortfallRows
      .map(([label, , shortfall]) => `${shortfall} still in flight at ${label}`)
      .join(", ")

    return (
      <ChartDataTable
        caption="Application pipeline flow, stage to stage"
        columns={["From", "To", "Applications"]}
        rows={[
          ...data.links.map((link) => [nodeLabel(link.source), nodeLabel(link.target), link.value]),
          ...shortfallRows,
        ]}
        summary={`Sankey diagram of how applications moved between pipeline stages. Stage totals: ${data.nodes
          .map((node) => `${node.label} ${node.value}`)
          .join(", ")}. ${shortfallSummary ? `${shortfallSummary}. ` : ""}Stage-to-stage flows follow.`}
      />
    )
  })()

  // F38: keyboard-reachable hover/focus detail, real focusable <button>
  // elements positioned over (but outside, in the DOM, of) the
  // `aria-hidden` SVG -- never ARIA on the SVG's own nodes. Dashboard-
  // only (`interactive`) and weighted-only (an unweighted node's
  // `fixedValue` has no real total to report).
  const overlay =
    interactive && weighted ? (
      <div className="pointer-events-none absolute inset-0">
        {positionedNodes
          .filter(({ y1, y0 }) => y1 - y0 > 0)
          .map(({ node, x0, x1, y0, y1, shortfall, outgoingLinks }) => {
            const detailParts = [`${node.label}: ${node.value} total`]
            for (const link of outgoingLinks) {
              detailParts.push(`→ ${nodeLabel(link.target)}: ${link.value}`)
            }
            if (shortfall > 0) {
              detailParts.push(`${shortfall} still in flight`)
            }
            const detail = detailParts.join(". ")
            const accessibleName = `${node.label}: ${node.value} application${node.value === 1 ? "" : "s"}${
              shortfall > 0 ? `, ${shortfall} still in flight` : ""
            }`

            return (
              <Tooltip key={node.key}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={accessibleName}
                      className="pointer-events-auto absolute rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      style={{
                        left: x0,
                        top: y0,
                        width: Math.max(1, x1 - x0),
                        height: Math.max(1, y1 - y0),
                      }}
                    />
                  }
                />
                <TooltipContent>{detail}</TooltipContent>
              </Tooltip>
            )
          })}
      </div>
    ) : null

  if (!shouldMeasure && !interactive) {
    // Explicit-size, non-interactive callers (RecapCard) keep the
    // original, wrapper-free output exactly -- no measurement, no
    // overlay, byte-identical DOM shape to before F36/F38.
    return (
      <>
        {svgBody}
        {dataTable}
      </>
    )
  }

  return (
    <div ref={shouldMeasure ? measureRef : undefined} className={wrapperClassName}>
      {svgBody}
      {overlay}
      {dataTable}
    </div>
  )
}
