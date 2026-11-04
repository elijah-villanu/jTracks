import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { inclusiveDaySpanDays } from "@/lib/date-range"
import { buildSankey } from "@/lib/sankey-data"
import { applicationFixtures } from "@/mocks/fixtures/applications"
import {
  addDaysIso,
  buildStatusBreakdown,
  computeAvgResponseTimeDays,
  countOf,
  FUNNEL_STATUSES,
  funnelCounts,
  parseRangeQuery,
  pct,
  RESPONDED_STATUSES,
} from "@/mocks/handlers/analytics"
import { requireAuth } from "@/mocks/handlers/require-auth"
import type {
  Application,
  ApplicationsOverTimePoint,
  DashboardRange,
  DashboardStats,
  TimeSeriesGranularity,
} from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

/** An application's "effective date" for range filtering and bucketing -- when it applied, or failing that when it was saved/created. */
function effectiveDate(application: Application): string {
  return application.date_applied ?? application.date_saved ?? application.created_at.slice(0, 10)
}

/**
 * `week`/`month`/`year` window ISO date strings compared lexicographically
 * (safe for `YYYY-MM-DD`) rather than millisecond arithmetic, per R6's
 * "compute spans in UTC, not local-timezone `new Date()` math" guidance --
 * `todayIso` is the one place "now" gets resolved, everything downstream
 * is plain string comparison. `custom` uses the caller-supplied window
 * directly; `all` is unbounded.
 */
function isInRange(
  date: string,
  range: DashboardRange,
  todayIso: string,
  customStart: string | null,
  customEnd: string | null
): boolean {
  if (range === "all") {
    return true
  }
  if (range === "custom") {
    return customStart !== null && customEnd !== null && date >= customStart && date <= customEnd
  }
  const days = range === "week" ? 7 : range === "month" ? 30 : 365 // year
  const cutoffIso = addDaysIso(todayIso, -(days - 1)) // inclusive of today
  return date >= cutoffIso
}

function buildApplicationsOverTime(
  inRange: Application[],
  granularity: TimeSeriesGranularity
): ApplicationsOverTimePoint[] {
  const counts = new Map<string, number>()

  for (const application of inRange) {
    const date = effectiveDate(application)
    const key = granularity === "month" ? date.slice(0, 7) : date // YYYY-MM or YYYY-MM-DD
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => a.period.localeCompare(b.period))
}

/** Mirrors `backend/app/services/ranges.py`'s `CUSTOM_DAILY_MAX_SPAN_DAYS`: a custom span at or under this many days is bucketed daily, otherwise monthly. */
const CUSTOM_DAILY_MAX_SPAN_DAYS = 92

/**
 * Bucketing granularity this mock actually produces for a given range,
 * per R6.4's spirit (day buckets for short spans, month for long ones) --
 * doesn't attempt exact zero-filling to precisely N points, just a
 * sensibly-scaled series. `week`/`month` bucket by day; `year` and `all`
 * (both potentially long, unbounded-ish spans) bucket by month, matching
 * `ranges.py`'s real granularity choice for those two; `custom` follows
 * `ranges.py`'s exact 92-day threshold.
 */
function granularityFor(range: DashboardRange, customSpanDays: number | null): TimeSeriesGranularity {
  if (range === "year" || range === "all") {
    return "month"
  }
  if (range === "custom" && customSpanDays !== null && customSpanDays > CUSTOM_DAILY_MAX_SPAN_DAYS) {
    return "month"
  }
  return "day"
}

/**
 * Mock `GET /dashboard/stats` for F7, updated for the V2 metric contract
 * (F11/F12) and F13's full `week|month|year|all|custom` range set.
 * Defaults to `month` if `range` is missing/invalid, filters
 * `applicationFixtures` to whichever are "in range" by their effective
 * date, and derives every figure in `DashboardStats` from that filtered
 * set -- the shared helpers in `./analytics` hold the exact formulas.
 * A bad custom range is a `422`, mirroring the real backend so the
 * frontend's "surface the server's 422 too" defense-in-depth path has
 * something real to exercise even though the client already validates
 * first.
 */
export const dashboardHandlers = [
  http.get(url("/dashboard/stats"), ({ request }) => {
    const authError = requireAuth(request)
    if (authError) {
      return authError
    }

    const query = parseRangeQuery(request, "month")
    if (query instanceof HttpResponse) {
      return query
    }
    const { range, customStart, customEnd } = query

    const todayIso = new Date().toISOString().slice(0, 10)
    const inRange = applicationFixtures.filter((application) =>
      isInRange(effectiveDate(application), range, todayIso, customStart, customEnd)
    )

    // The "applied-or-later" cohort the breakdown, rates and Sankey are computed over.
    const cohort = inRange.filter((application) => FUNNEL_STATUSES.includes(application.status))
    const total = cohort.length
    const responded = cohort.filter((application) => RESPONDED_STATUSES.includes(application.status)).length
    const granularity = granularityFor(
      range,
      customStart && customEnd ? inclusiveDaySpanDays(customStart, customEnd) : null
    )

    const stats: DashboardStats = {
      range,
      total,
      status_breakdown: buildStatusBreakdown(cohort),
      applications_over_time: buildApplicationsOverTime(inRange, granularity),
      time_series_granularity: granularity,
      response_rate: pct(responded, total),
      ghost_rate: pct(countOf(cohort, "ghosted"), total),
      rejection_fail_rate: pct(countOf(cohort, "rejected") + countOf(cohort, "failed"), total),
      avg_time_to_response_days: computeAvgResponseTimeDays(inRange),
      sankey: buildSankey(funnelCounts(cohort)),
    }

    return HttpResponse.json(stats)
  }),
]
