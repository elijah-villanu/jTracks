import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { applicationFixtures } from "@/mocks/fixtures/applications"
import type {
  Application,
  ApplicationStatus,
  ApplicationsOverTimePoint,
  DashboardRange,
  DashboardStats,
  StatusBreakdownEntry,
  TimeSeriesGranularity,
} from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

/**
 * Canonical status-breakdown order (applied -> interviewing -> offer ->
 * rejected -> ghosted), per PRD.md -- deliberately excludes `saved`
 * since those applications haven't entered the outcome funnel yet.
 */
const STATUS_BREAKDOWN_ORDER: ApplicationStatus[] = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "ghosted",
]

/** The "applied-or-later" cohort response/ghost rate and the breakdown are both computed over. */
const APPLIED_COHORT_STATUSES: ApplicationStatus[] = STATUS_BREAKDOWN_ORDER

/** Any of these counts as "got a response" for response_rate. */
const RESPONDED_STATUSES: ApplicationStatus[] = ["interviewing", "offer", "rejected"]

/** Statuses that plausibly moved past "applied" for the avg-response-time mock approximation below. */
const RESPONSE_TIME_STATUSES: ApplicationStatus[] = ["interviewing", "offer", "rejected"]

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** An application's "effective date" for range filtering and bucketing -- when it applied, or failing that when it was saved/created. */
function effectiveDate(application: Application): string {
  return application.date_applied ?? application.date_saved ?? application.created_at.slice(0, 10)
}

function isInRange(date: string, range: DashboardRange, nowMs: number): boolean {
  if (range === "all") {
    return true
  }
  const days = range === "week" ? 7 : 30
  const cutoffMs = nowMs - days * MS_PER_DAY
  return new Date(`${date}T00:00:00Z`).getTime() >= cutoffMs
}

/** ISO week start (Monday) for a given YYYY-MM-DD date, used to bucket the "all" range by week instead of by day. */
function isoWeekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay() // 0 (Sun) - 6 (Sat)
  const diffToMonday = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  return d.toISOString().slice(0, 10)
}

function bucketKeyFor(date: string, range: DashboardRange): string {
  // Day buckets for week/month (enough spread to be meaningful over a
  // handful of weeks); week buckets for "all" so a multi-month span
  // doesn't render one bar per day.
  return range === "all" ? isoWeekStart(date) : date
}

function buildStatusBreakdown(cohort: Application[]): StatusBreakdownEntry[] {
  const total = cohort.length
  return STATUS_BREAKDOWN_ORDER.map((status) => {
    const count = cohort.filter((application) => application.status === status).length
    return {
      status,
      count,
      // total === 0 -> every entry is 0/0%, never a division by zero.
      percentage: total === 0 ? 0 : (count / total) * 100,
    }
  })
}

function buildApplicationsOverTime(
  inRange: Application[],
  range: DashboardRange
): ApplicationsOverTimePoint[] {
  const counts = new Map<string, number>()

  for (const application of inRange) {
    const key = bucketKeyFor(effectiveDate(application), range)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => a.period.localeCompare(b.period))
}

/** Bucketing granularity this mock actually produces for a given range -- see `bucketKeyFor`. */
function granularityFor(range: DashboardRange): TimeSeriesGranularity {
  return range === "all" ? "week" : "day"
}

/** Mirrors the real backend's `_pct`: percentage 0-100, 1 decimal, `0` if `whole` is falsy -- never a 0-1 fraction. */
function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10
}

function computeRates(cohort: Application[]): {
  response_rate: number
  ghost_rate: number
  rejection_rate: number
} {
  const total = cohort.length
  const responded = cohort.filter((application) => RESPONDED_STATUSES.includes(application.status)).length
  const ghosted = cohort.filter((application) => application.status === "ghosted").length
  const rejected = cohort.filter((application) => application.status === "rejected").length

  return {
    response_rate: pct(responded, total),
    ghost_rate: pct(ghosted, total),
    rejection_rate: pct(rejected, total),
  }
}

/**
 * Mock approximation of avg time-to-response: this data model has no
 * status-change event history (that's real backend work, see
 * BACKEND_TASKS.md's B14), so this averages
 * `(Date(updated_at) - Date(date_applied)) / 1 day` across in-range
 * applications currently in interviewing/offer/rejected with a non-null
 * `date_applied` -- i.e. applications that visibly moved past "applied"
 * and whose `updated_at` plausibly reflects that move. Excludes
 * `ghosted` (no response happened) and `applied` (hasn't moved yet).
 * The real B14 endpoint will have actual status-change timestamps and
 * won't need this approximation.
 */
function computeAvgResponseTimeDays(inRange: Application[]): number | null {
  const qualifying = inRange.filter(
    (application) => RESPONSE_TIME_STATUSES.includes(application.status) && application.date_applied
  )

  if (qualifying.length === 0) {
    return null
  }

  const totalDays = qualifying.reduce((sum, application) => {
    const appliedMs = new Date(application.date_applied as string).getTime()
    const updatedMs = new Date(application.updated_at).getTime()
    return sum + (updatedMs - appliedMs) / MS_PER_DAY
  }, 0)

  return totalDays / qualifying.length
}

/**
 * Mock `GET /dashboard/stats` for F7. Reads `?range=week|month|all`
 * (defaults to `month` if missing/invalid), filters `applicationFixtures`
 * to whichever are "in range" by their effective date, and derives every
 * figure in `DashboardStats` from that filtered set -- see the helpers
 * above for the exact formulas. Replace with a real fetch once B14 ships.
 */
export const dashboardHandlers = [
  http.get(url("/dashboard/stats"), ({ request }) => {
    const rawRange = new URL(request.url).searchParams.get("range")
    const range: DashboardRange = rawRange === "week" || rawRange === "all" ? rawRange : "month"

    const nowMs = Date.now()
    const inRange = applicationFixtures.filter((application) =>
      isInRange(effectiveDate(application), range, nowMs)
    )

    const cohort = inRange.filter((application) => APPLIED_COHORT_STATUSES.includes(application.status))
    const { response_rate, ghost_rate, rejection_rate } = computeRates(cohort)

    const stats: DashboardStats = {
      range,
      total: cohort.length,
      status_breakdown: buildStatusBreakdown(cohort),
      applications_over_time: buildApplicationsOverTime(inRange, range),
      time_series_granularity: granularityFor(range),
      response_rate,
      ghost_rate,
      rejection_rate,
      avg_time_to_response_days: computeAvgResponseTimeDays(inRange),
    }

    return HttpResponse.json(stats)
  }),
]
