import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { ApplicationsOverTimePoint, TimeSeriesGranularity } from "@/types/api"

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

const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" })

/**
 * `period` is `YYYY-MM-DD` for day buckets, `YYYY-MM` for month buckets
 * (F13 -- `year` and long-span `custom` ranges bucket by month, see
 * `mocks/handlers/dashboard.ts`'s `granularityFor`). Month buckets are
 * formatted as `"Aug 2026"` rather than reusing the day formatter, which
 * would otherwise mislabel every point as the 1st of the month.
 */
function formatBucketLabel(iso: string, granularity: TimeSeriesGranularity): string {
  if (granularity === "month") {
    // `YYYY-MM` has no day component -- append one so `Date` parses it
    // as that month's 1st (in UTC) rather than rolling back to the
    // previous month on non-UTC-aligned parses.
    return monthFormatter.format(new Date(`${iso}-01T00:00:00Z`))
  }
  return dayFormatter.format(new Date(`${iso}T00:00:00Z`))
}

interface ApplicationsOverTimeChartProps {
  data: ApplicationsOverTimePoint[]
  granularity: TimeSeriesGranularity
}

export function ApplicationsOverTimeChart({ data, granularity }: ApplicationsOverTimeChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No applications in this range yet.</p>
  }

  const formatLabel = (value: string) => formatBucketLabel(value, granularity)

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="period"
          tickFormatter={formatLabel}
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
          content={<ChartTooltipContent labelFormatter={(value) => formatLabel(String(value))} />}
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
