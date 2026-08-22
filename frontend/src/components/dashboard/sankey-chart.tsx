import { useMemo } from "react"
import { sankey, sankeyLinkHorizontal } from "d3-sankey"
import type { SankeyGraph, SankeyNode as D3SankeyNode } from "d3-sankey"
import { ChartDataTable } from "@/components/dashboard/chart-data-table"
import { STATUS_BREAKDOWN_COLORS } from "@/components/dashboard/status-breakdown-chart"
import type { ApplicationStatus, Sankey } from "@/types/api"

type NodeExtra = { key: ApplicationStatus; label: string }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentionally the "no extra properties" case d3-sankey's own types expect (see SankeyExtraProperties)
interface LinkExtra {}

export interface SankeyChartProps {
  data: Sankey
  width: number
  height: number
  /** Room reserved on each side/top/bottom for the layout extent, in px. */
  marginX?: number
  marginY?: number
  fontSize?: number
  className?: string
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
 * Real F16 Sankey component -- renders the backend's `sankey` payload
 * (`GET /dashboard/stats`/`GET /dashboard/recap`) as plain SVG (<rect>
 * nodes, <path> ribbons via d3-sankey's sankeyLinkHorizontal(), <text>
 * labels), matching F14's chosen approach
 * (docs/decisions/sankey-library.md) so it survives html-to-image export
 * unchanged. Topology comes entirely from `data.nodes`/`data.links` --
 * never re-derived from `status_breakdown` (R5.5). Visual design (colors
 * beyond status-palette mapping, typography, animation, node ordering) is
 * out of scope per PRD_V2.md R5.7; sizing props are kept flexible so F18
 * can place this at both the dashboard scale (~343px wide, fontSize ~9) and
 * the recap-card scale (~270px wide card, fontSize ~7) validated by F15.
 *
 * R5.4 handling: each node's `value` is passed through as d3-sankey's
 * `node.fixedValue` (see computeNodeValues in
 * node_modules/d3-sankey/src/sankey.js) instead of letting the library
 * derive it from the sum of the node's links. That means a node's
 * rectangle height always reflects its true value even when its outgoing
 * links sum to less than that value (rows still sitting in `applied` /
 * `interviewing_oa`) -- the shortfall reads as unfilled space at the
 * bottom of the node's own slot, never as a phantom link and never as the
 * real links being rescaled to fill the node.
 *
 * Empty-links guard: per the addendum in docs/decisions/sankey-library.md,
 * `d3-sankey` returns `x0`/`x1` as `null` for *every* node (including ones
 * with real nonzero values) whenever `links.length === 0` -- it derives a
 * node's column purely from graph traversal over `links`. That happens in
 * exactly two real cases: `total === 0`, and everything still sitting in
 * `applied`. Detect that case before calling the layout at all and render
 * a placeholder instead -- do not paper over the nulls with a `?? 0`
 * fallback, which would render a broken, collapsed-to-the-left diagram.
 */
export function SankeyChart({ data, width, height, marginX = 8, marginY = 8, fontSize = 9, className }: SankeyChartProps) {
  const hasLinks = data.links.length > 0

  const graph = useMemo<SankeyGraph<NodeExtra, LinkExtra> | null>(() => {
    if (!hasLinks) {
      return null
    }

    const layout = sankey<NodeExtra, LinkExtra>()
      .nodeId((node) => node.key)
      .nodeWidth(10)
      .nodePadding(12)
      .extent([
        [marginX, marginY],
        [Math.max(marginX + 1, width - marginX), Math.max(marginY + 1, height - marginY)],
      ])

    return layout({
      nodes: data.nodes.map((node) => ({
        key: node.key,
        label: node.label,
        // R5.4: fixed, not derived from link sums -- see the doc comment above.
        fixedValue: node.value,
      })),
      links: data.links.map((link) => ({
        source: link.source,
        target: link.target,
        value: link.value,
      })),
    })
  }, [data, hasLinks, width, height, marginX, marginY])

  const linkPath = useMemo(() => sankeyLinkHorizontal<NodeExtra, LinkExtra>(), [])

  if (!graph) {
    const appliedValue = data.nodes.find((node) => node.key === "applied")?.value ?? 0
    return (
      <SankeyEmptyPlaceholder width={width} height={height} appliedValue={appliedValue} className={className} />
    )
  }

  const nodeLabel = (key: ApplicationStatus) =>
    data.nodes.find((node) => node.key === key)?.label ?? key

  return (
    <>
      {/*
        A11y (WCAG 1.1.1): the previous `role="img"` + "Sankey diagram of
        application pipeline flow" gave the diagram a name but conveyed
        none of its actual content -- a screen reader user learned only
        that a diagram existed. The flow itself (which status feeds which,
        and how many applications) is the entire point, so the SVG is now
        hidden and the same topology is exposed as a real table below.
      */}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={className}
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
              stroke={STATUS_BREAKDOWN_COLORS[source.key]}
              strokeOpacity={0.35}
              strokeWidth={Math.max(1, link.width ?? 0)}
            />
          )
        })}
      </g>
      <g>
        {graph.nodes.map((node) => {
          const x0 = node.x0 ?? 0
          const x1 = node.x1 ?? 0
          const y0 = node.y0 ?? 0
          const y1 = node.y1 ?? 0
          const labelOnRight = x0 < width / 2

          return (
            <g key={node.key}>
              <rect
                x={x0}
                y={y0}
                width={Math.max(1, x1 - x0)}
                height={Math.max(1, y1 - y0)}
                rx={2}
                fill={STATUS_BREAKDOWN_COLORS[node.key]}
              />
              <text
                x={labelOnRight ? x1 + 4 : x0 - 4}
                y={(y0 + y1) / 2}
                dominantBaseline="middle"
                textAnchor={labelOnRight ? "start" : "end"}
                fontSize={fontSize}
                fill="currentColor"
              >
                {node.label} ({node.value})
              </text>
            </g>
          )
        })}
      </g>
      </svg>

      <ChartDataTable
        caption="Application pipeline flow, stage to stage"
        columns={["From", "To", "Applications"]}
        rows={data.links.map((link) => [
          nodeLabel(link.source),
          nodeLabel(link.target),
          link.value,
        ])}
        summary={`Sankey diagram of how applications moved between pipeline stages. Stage totals: ${data.nodes
          .map((node) => `${node.label} ${node.value}`)
          .join(", ")}. Stage-to-stage flows follow.`}
      />
    </>
  )
}
