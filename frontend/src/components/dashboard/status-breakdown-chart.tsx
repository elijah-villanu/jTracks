import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { STATUS_LABEL } from "@/components/StatusBadge"
import type { StatusBreakdownEntry } from "@/types/api"

/**
 * Validated status-breakdown palette (light mode only). Order matches
 * the pipeline order this chart renders in: applied -> interviewing ->
 * offer -> rejected -> ghosted. Produced by the dataviz skill's
 * scripts/validate_palette.js (OKLCH lightness/chroma/CVD/contrast
 * checks) -- don't re-derive these. Two slots (interviewing, offer) sit
 * in the sub-3:1 contrast WARN band, which is only legal because every
 * bar below carries a permanent visible count/percentage label (not a
 * hover-only tooltip). This app has no reachable dark mode yet (the
 * `.dark` class is never applied -- no toggle exists, see index.css),
 * so these are hardcoded rather than theme-aware. Dark-safe equivalents
 * exist if a toggle ever ships: interviewing #d97706, offer #059669
 * (others unchanged).
 */
const STATUS_BREAKDOWN_COLORS: Record<StatusBreakdownEntry["status"], string> = {
  applied: "#3b82f6",
  interviewing: "#f59e0b",
  offer: "#10b981",
  rejected: "#ef4444",
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

  return (
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
  )
}
