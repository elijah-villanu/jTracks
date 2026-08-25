import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ChartDataTable } from "@/components/dashboard/chart-data-table"
import { STATUS_LABEL } from "@/components/StatusBadge"
import type { StatusBreakdownEntry } from "@/types/api"

/**
 * Validated status-breakdown palette (light mode only). Order matches
 * the pipeline order this chart renders in: applied -> interviewing_oa ->
 * offer -> rejected -> failed -> ghosted. Produced by the dataviz skill's
 * scripts/validate_palette.js (OKLCH lightness/chroma/CVD/contrast
 * checks) -- don't re-derive these. Two slots (interviewing_oa, offer) sit
 * in the sub-3:1 contrast WARN band, which is only legal because every
 * bar below carries a permanent visible count/percentage label (not a
 * hover-only tooltip). This app has no reachable dark mode yet (the
 * `.dark` class is never applied -- no toggle exists, see index.css),
 * so these are hardcoded rather than theme-aware. Dark-safe equivalents
 * exist if a toggle ever ships: interviewing_oa #d97706, offer #059669
 * (others unchanged). `failed` uses Tailwind's pink-500 (#ec4899),
 * deliberately distinct from `rejected`'s red so the two are never
 * confused at a glance -- unvalidated against the dataviz script (new
 * status, added for F10), revisit if that script is rerun.
 */
export const STATUS_BREAKDOWN_COLORS: Record<StatusBreakdownEntry["status"], string> = {
  applied: "#3b82f6",
  interviewing_oa: "#f59e0b",
  offer: "#10b981",
  rejected: "#ef4444",
  failed: "#ec4899",
  ghosted: "#8b5cf6",
  saved: "#94a3b8", // never rendered -- status_breakdown excludes "saved" -- present only to satisfy the Record type
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
