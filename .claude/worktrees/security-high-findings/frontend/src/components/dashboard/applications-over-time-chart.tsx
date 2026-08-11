import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { ApplicationsOverTimePoint } from "@/types/api"

/**
 * Sequential, single-series encoding (one series = application volume
 * over time), so this intentionally uses one hue rather than the
 * categorical status palette -- the same blue already used for
 * "applied" everywhere else in this app (see StatusBadge.tsx's
 * STATUS_COLOR_CLASSES.applied). The dataviz skill's categorical
 * palette validator doesn't apply to a single-hue sequential ramp, so
 * it isn't run against this color.
 */
const TREND_COLOR = "#3b82f6"

const chartConfig = {
  count: { label: "Applications", color: TREND_COLOR },
} satisfies ChartConfig

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

function formatBucketLabel(iso: string): string {
  return dateFormatter.format(new Date(`${iso}T00:00:00Z`))
}

interface ApplicationsOverTimeChartProps {
  data: ApplicationsOverTimePoint[]
}

export function ApplicationsOverTimeChart({ data }: ApplicationsOverTimeChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No applications in this range yet.</p>
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatBucketLabel}
          tickLine={false}
          axisLine={false}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          stroke="var(--muted-foreground)"
          width={32}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={
            <ChartTooltipContent labelFormatter={(value) => formatBucketLabel(String(value))} />
          }
        />
        <Area
          dataKey="count"
          type="monotone"
          stroke={TREND_COLOR}
          fill={TREND_COLOR}
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
