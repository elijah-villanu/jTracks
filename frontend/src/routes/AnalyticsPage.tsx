import { useState } from "react"
import { ApplicationsOverTimeChart } from "@/components/dashboard/applications-over-time-chart"
import { RecapDialog } from "@/components/dashboard/recap-dialog"
import { StatTile } from "@/components/dashboard/stat-tile"
import { StatusBreakdownChart } from "@/components/dashboard/status-breakdown-chart"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import type { DashboardRange } from "@/types/api"

const RANGE_OPTIONS: { value: DashboardRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All" },
]

/**
 * F7's dashboard: status breakdown, applications-over-time trend, and
 * response/ghost-rate KPIs, all scoped by a range toggle (week/month/
 * all). Reads `GET /dashboard/stats` (mocked in
 * src/mocks/handlers/dashboard.ts until BACKEND_TASKS.md's B14 ships).
 */
export function AnalyticsPage() {
  const [range, setRange] = useState<DashboardRange>("month")
  const [isRecapOpen, setIsRecapOpen] = useState(false)
  const { stats, isLoading, error } = useDashboardStats(range)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Status breakdown, application volume, and response/ghost rates for your pipeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5" role="group" aria-label="Date range">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={range === option.value ? "default" : "outline"}
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <Button type="button" size="sm" variant="secondary" onClick={() => setIsRecapOpen(true)}>
            Generate recap
          </Button>
        </div>
      </div>

      <RecapDialog open={isRecapOpen} onOpenChange={setIsRecapOpen} />

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      ) : (
        stats && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Total Applications" value={String(stats.total)} />
              <StatTile label="Response Rate" value={`${stats.response_rate.toFixed(0)}%`} />
              <StatTile label="Ghost Rate" value={`${stats.ghost_rate.toFixed(0)}%`} />
              <StatTile
                label="Avg Time to Response"
                value={`${stats.avg_time_to_response_days?.toFixed(1) ?? "—"} days`}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Status breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <StatusBreakdownChart data={stats.status_breakdown} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Applications over time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ApplicationsOverTimeChart data={stats.applications_over_time} />
                </CardContent>
              </Card>
            </div>
          </>
        )
      )}
    </div>
  )
}
