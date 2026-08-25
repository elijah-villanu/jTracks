import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ChartDataTable } from "@/components/dashboard/chart-data-table"
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

  const total = data.reduce((sum, point) => sum + point.count, 0)
  const peak = data.reduce((best, point) => (point.count > best.count ? point : best), data[0])
  const bucketWord = granularity === "month" ? "month" : granularity === "week" ? "week" : "day"

  return (
    <figure className="m-0">
      {/*
        A11y (WCAG 1.1.1): recharts renders an <svg> full of unlabelled
        <path>/<text> nodes with no accessible name, and the tooltip that
        carries the actual numbers is hover/pointer-only. Hide the visual
        layer from assistive tech and expose the same data as a real
        table + one-line summary below.

        `inert` as well as `aria-hidden`: recharts puts `tabindex="0"` on
        its own <svg class="recharts-surface">, which was an unlabelled
        tab stop announcing nothing even before this wrapper existed.
        `aria-hidden` alone would leave that tab stop in place while
        hiding it from the screen reader -- strictly worse. `inert` takes
        the subtree out of the tab order as well.
      */}
      <div aria-hidden="true" inert>
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
              content={
                <ChartTooltipContent labelFormatter={(value) => formatLabel(String(value))} />
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
      </div>

      <figcaption>
        <ChartDataTable
          caption={`Applications over time, by ${bucketWord}`}
          columns={[granularity === "month" ? "Month" : "Date", "Applications"]}
          rows={data.map((point) => [formatLabel(point.period), point.count])}
          summary={`Line chart: ${total} application${total === 1 ? "" : "s"} across ${
            data.length
          } ${bucketWord}${data.length === 1 ? "" : "s"}${
            peak ? `, peaking at ${peak.count} on ${formatLabel(peak.period)}` : ""
          }. Full data follows.`}
        />
      </figcaption>
    </figure>
  )
}
