import { useState } from "react"
import { ApplicationsOverTimeChart } from "@/components/dashboard/applications-over-time-chart"
import { DateRangeControl } from "@/components/dashboard/date-range-control"
import { RecapDialog } from "@/components/dashboard/recap-dialog"
import { SankeyChart } from "@/components/dashboard/sankey-chart"
import { StatTile } from "@/components/dashboard/stat-tile"
import { StatusBreakdownChart } from "@/components/dashboard/status-breakdown-chart"
import { BlurFade } from "@/components/ui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import { validateCustomRange } from "@/lib/date-range"
import type { DashboardRange } from "@/types/api"

/**
 * Entrance-animation stagger for this page's three content groups (stat
 * row, chart row, pipeline flow) -- see docs/decisions/magicui-conventions.md
 * for the timing/easing convention this follows project-wide. Kept as a
 * named constant rather than inlined per-`BlurFade` so the stagger step is
 * obvious and stays consistent if a fourth group is ever added here.
 */
const ENTRANCE_STAGGER_SECONDS = 0.08

/**
 * F7's dashboard: status breakdown, applications-over-time trend, and
 * response/ghost-rate KPIs, all scoped by a range toggle -- widened by
 * F13 from week/month/all to the full week/month/year/all/custom set via
 * the shared DateRangeControl. Reads `GET /dashboard/stats` (mocked in
 * src/mocks/handlers/dashboard.ts until BACKEND_TASKS.md's B14 ships).
 */
export function AnalyticsPage() {
  const [range, setRange] = useState<DashboardRange>("month")
  const [customStart, setCustomStart] = useState<string | null>(null)
  const [customEnd, setCustomEnd] = useState<string | null>(null)
  const [isRecapOpen, setIsRecapOpen] = useState(false)
  const { stats, isLoading, error } = useDashboardStats(range, customStart, customEnd)

  // Recomputed locally (cheap, pure) so it can gate the inline error shown
  // next to the date pickers -- distinct from `error` above, which also
  // covers real fetch/server failures (surfaced in the banner below).
  const customRangeError = range === "custom" ? validateCustomRange(customStart, customEnd) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Status breakdown, application volume, and response/ghost rates for your pipeline.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <DateRangeControl
            range={range}
            onRangeChange={setRange}
            start={customStart}
            end={customEnd}
            onStartChange={setCustomStart}
            onEndChange={setCustomEnd}
            ariaLabel="Date range"
            error={customRangeError}
          />

          <Button type="button" size="sm" variant="secondary" onClick={() => setIsRecapOpen(true)}>
            Generate recap
          </Button>
        </div>
      </div>

      <RecapDialog open={isRecapOpen} onOpenChange={setIsRecapOpen} />

      {error && !customRangeError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/*
        A11y (WCAG 4.1.3): changing the range refetches and swaps out every
        tile and chart on the page. `role="status"` here means the wait and
        the "results are ready" moment are both announced instead of the
        page silently rearranging itself.
      */}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isLoading
          ? "Loading dashboard..."
          : stats
            ? `Dashboard updated: ${stats.total} submitted application${stats.total === 1 ? "" : "s"} in the selected range.`
            : ""}
      </p>

      {!isLoading &&
        stats && (
          <>
            <BlurFade delay={0}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatTile label="Total Applications" value={String(stats.total)} numericValue={stats.total} accent />
                <StatTile
                  label="Response Rate"
                  value={`${stats.response_rate.toFixed(0)}%`}
                  numericValue={stats.response_rate}
                  suffix="%"
                />
                <StatTile
                  label="Ghost Rate"
                  value={`${stats.ghost_rate.toFixed(0)}%`}
                  numericValue={stats.ghost_rate}
                  suffix="%"
                />
                <StatTile
                  label="Rejection/Fail Rate"
                  value={`${stats.rejection_fail_rate.toFixed(0)}%`}
                  numericValue={stats.rejection_fail_rate}
                  suffix="%"
                />
                <StatTile
                  label="Avg Time to Response"
                  value={`${stats.avg_time_to_response_days?.toFixed(1) ?? "—"} days`}
                  numericValue={stats.avg_time_to_response_days}
                  suffix=" days"
                  decimalPlaces={1}
                />
              </div>
            </BlurFade>

            <BlurFade delay={ENTRANCE_STAGGER_SECONDS}>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    {/*
                      A11y (WCAG 1.3.1 / 2.4.10): `CardTitle` is a <div>, so
                      the three chart titles were not headings and a screen
                      reader user had no way to jump between the sections of
                      this page. Tailwind preflight resets heading
                      typography, so nesting <h2> changes nothing visually.
                    */}
                    <CardTitle>
                      <h2>Status breakdown</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <StatusBreakdownChart data={stats.status_breakdown} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2>Applications over time</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ApplicationsOverTimeChart
                      data={stats.applications_over_time}
                      granularity={stats.time_series_granularity}
                    />
                  </CardContent>
                </Card>
              </div>
            </BlurFade>

            <BlurFade delay={ENTRANCE_STAGGER_SECONDS * 2}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>Pipeline flow</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/*
                    F36: `width` is intentionally omitted so the chart
                    measures its own wrapping element's content width via
                    ResizeObserver and lays out at that real pixel value --
                    `fontSize` then renders at a constant 9px at every
                    breakpoint instead of scaling with a stretched viewBox.
                    `height` stays a fixed, authored value (this card's
                    content height doesn't need to track viewport width).
                    `interactive` (F38) turns on the per-node hover/focus
                    detail affordance -- dashboard-only, never passed by
                    `RecapCard`'s static export render.
                  */}
                  <SankeyChart
                    data={stats.sankey}
                    height={170}
                    fontSize={9}
                    className="w-full"
                    interactive
                  />
                </CardContent>
              </Card>
            </BlurFade>
          </>
        )}
    </div>
  )
}
