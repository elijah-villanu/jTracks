import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ChartDataTable } from "@/components/dashboard/chart-data-table"
import { STATUS_LABEL } from "@/components/StatusBadge"
import type { StatusBreakdownEntry } from "@/types/api"

/**
 * Validated status-breakdown palette, now theme-aware (F28/R11.3/R11.4).
 * Order matches the pipeline order this chart renders in: applied ->
 * interviewing_oa -> offer -> rejected -> failed -> ghosted. The actual
 * hex values are produced by the dataviz skill's scripts/validate_palette.js
 * (OKLCH lightness/chroma/CVD/contrast checks) -- don't re-derive them,
 * they now live in `index.css`'s `--status-*` custom properties (`:root`
 * for light, `.dark` for dark) so they're made once, in the token layer,
 * and every consumer -- this chart's `<Cell fill>`, `sankey-chart.tsx`'s
 * node fill/ribbon stroke, `StatusBadge`'s classes are a separate
 * Tailwind-class-based system, see StatusBadge.tsx -- reads the same
 * source. Two slots (interviewing_oa, offer) sit in the sub-3:1 contrast
 * WARN band in light mode, which is only legal because every bar below
 * carries a permanent visible count/percentage label (not a hover-only
 * tooltip) -- see the measured numbers in
 * docs/decisions/magicui-conventions.md. `failed` uses Tailwind's
 * pink-500 (#ec4899), deliberately distinct from `rejected`'s red so the
 * two are never confused at a glance.
 *
 * These are `var(--status-*)` references, not literal hex -- they resolve
 * against whichever of `:root`/`.dark` is active on `<html>`, so this
 * object needs no theme-aware branching of its own; the browser's normal
 * CSS cascade does that. The one place that does NOT want this live
 * cascade behavior is `RecapCard`'s exported Sankey instance -- see
 * `STATUS_LITERAL_COLORS` below and recap-card.tsx's doc comment for why.
 */
export const STATUS_BREAKDOWN_COLORS: Record<StatusBreakdownEntry["status"], string> = {
  applied: "var(--status-applied)",
  interviewing_oa: "var(--status-interviewing-oa)",
  offer: "var(--status-offer)",
  rejected: "var(--status-rejected)",
  failed: "var(--status-failed)",
  ghosted: "var(--status-ghosted)",
  saved: "var(--status-saved)", // never rendered -- status_breakdown excludes "saved" -- present only to satisfy the Record type
}

/**
 * Fixed, theme-*independent* literal-color mirror of the map above, for
 * `RecapCard`'s exported Sankey instance only (see recap-card.tsx).
 *
 * `RecapCard` is deliberately not supposed to depend on `.dark` state --
 * the exported PNG has no theme context, and its own card chrome is a
 * fixed dark gradient regardless of the app's current theme (see
 * recap-card.tsx's doc comment). If its Sankey used the `var(--status-*)`
 * map above, the color actually baked into the export would silently
 * follow whichever theme happened to be active on `<html>` at export
 * time (html-to-image's clone step resolves `var()` via
 * `getComputedStyle` before serializing, so it *would* bake in a
 * concrete color either way -- just the wrong one, coupled to the
 * exporting user's current theme instead of a fixed appearance). These
 * literal values are simply the original light-mode hexes, which is what
 * this card already rendered against its own dark background before
 * dark mode existed -- unchanged, so the export looks the same as it
 * always has.
 */
export const STATUS_LITERAL_COLORS: Record<StatusBreakdownEntry["status"], string> = {
  applied: "#3b82f6",
  interviewing_oa: "#f59e0b",
  offer: "#10b981",
  rejected: "#ef4444",
  failed: "#ec4899",
  ghosted: "#8b5cf6",
  saved: "#94a3b8",
}

const chartConfig = {
  count: { label: "Applications" },
} satisfies ChartConfig

interface StatusBreakdownChartProps {
  data: StatusBreakdownEntry[]
}

/**
 * Horizontal bar chart, one bar per status in pipeline order, each with
 * a permanent visible "count (percentage%)" label -- required per the
 * validated palette's contrast WARN band noted above, not optional
 * polish.
 */
export function StatusBreakdownChart({ data }: StatusBreakdownChartProps) {
  const hasData = data.some((entry) => entry.count > 0)

  if (!hasData) {
    return (
      <p className="text-sm text-muted-foreground">
        No applications in this range have moved past Saved yet.
      </p>
    )
  }

  const chartData = data.map((entry) => ({
    status: entry.status,
    label: STATUS_LABEL[entry.status],
    count: entry.count,
    labelText: `${entry.count} (${entry.percentage.toFixed(0)}%)`,
    fill: STATUS_BREAKDOWN_COLORS[entry.status],
  }))

  const total = data.reduce((sum, entry) => sum + entry.count, 0)
  const largest = chartData.reduce((best, entry) => (entry.count > best.count ? entry : best), chartData[0])

  return (
    <figure className="m-0">
      {/*
        A11y (WCAG 1.1.1): status is encoded by bar colour here, and the
        bar/axis SVG has no accessible name. The permanent "count
        (percentage%)" LabelList makes it readable for sighted users but
        is still just unlabelled <text> in the SVG to a screen reader, so
        the visual layer is hidden and the same numbers are exposed as a
        table below -- which also removes the colour-only dependency
        between `rejected` (red) and `failed` (pink) (WCAG 1.4.1).

        `inert` alongside `aria-hidden` because recharts marks its own
        <svg class="recharts-surface"> `tabindex="0"` -- see the longer
        note in applications-over-time-chart.tsx.
      */}
      <div aria-hidden="true" inert>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 8, right: 56, top: 8, bottom: 8 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={90}
              tickLine={false}
              axisLine={false}
              stroke="var(--muted-foreground)"
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="count" radius={4}>
              {chartData.map((entry) => (
                <Cell key={entry.status} fill={entry.fill} />
              ))}
              <LabelList
                dataKey="labelText"
                position="right"
                className="fill-foreground"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      <figcaption>
        <ChartDataTable
          caption="Applications by status"
          columns={["Status", "Applications", "Share"]}
          rows={data.map((entry) => [
            STATUS_LABEL[entry.status],
            entry.count,
            `${entry.percentage.toFixed(0)}%`,
          ])}
          summary={`Bar chart: ${total} submitted application${total === 1 ? "" : "s"}${
            largest ? `, most common status ${largest.label} with ${largest.count}` : ""
          }. Full data follows.`}
        />
      </figcaption>
    </figure>
  )
}
