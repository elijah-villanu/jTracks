import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { inclusiveDaySpanDays, isValidIsoDate, MAX_CUSTOM_RANGE_DAYS } from "@/lib/date-range"
import { applicationFixtures } from "@/mocks/fixtures/applications"
import { requireAuth } from "@/mocks/handlers/require-auth"
import { STATUS_LABEL } from "@/components/StatusBadge"
import type {
  Application,
  ApplicationStatus,
  ApplicationsOverTimePoint,
  DashboardRange,
  DashboardStats,
  Sankey,
  SankeyLink,
  SankeyNode,
  StatusBreakdownEntry,
  TimeSeriesGranularity,
} from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

/**
 * Canonical status-breakdown order (applied -> interviewing_oa -> offer ->
 * rejected -> failed -> ghosted), per PRD_V2.md R1.3/R4 -- deliberately
 * excludes `saved` since those applications haven't entered the outcome
 * funnel yet. All 6 entries always appear, including zero counts.
 */
const STATUS_BREAKDOWN_ORDER: ApplicationStatus[] = [
  "applied",
  "interviewing_oa",
  "offer",
  "rejected",
  "failed",
  "ghosted",
]

/** The "applied-or-later" cohort response/ghost rate and the breakdown are both computed over. */
const APPLIED_COHORT_STATUSES: ApplicationStatus[] = STATUS_BREAKDOWN_ORDER

/** Any of these counts as "got a response" for response_rate (V2: adds `failed`). */
const RESPONDED_STATUSES: ApplicationStatus[] = ["interviewing_oa", "offer", "rejected", "failed"]

/** Statuses that plausibly moved past "applied" for the avg-response-time mock approximation below (V2: adds `failed`). */
const RESPONSE_TIME_STATUSES: ApplicationStatus[] = ["interviewing_oa", "offer", "rejected", "failed"]

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Adds (or subtracts, for negative `delta`) whole days to a `YYYY-MM-DD` string, entirely in UTC. */
function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

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

/** ISO week start (Monday) for a given YYYY-MM-DD date, used to bucket long spans by week instead of by day. */
function isoWeekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay() // 0 (Sun) - 6 (Sat)
  const diffToMonday = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  return d.toISOString().slice(0, 10)
}

function bucketKeyFor(date: string, granularity: TimeSeriesGranularity): string {
  if (granularity === "month") {
    return date.slice(0, 7) // YYYY-MM
  }
  if (granularity === "week") {
    return isoWeekStart(date)
  }
  return date
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

/**
 * Builds the `sankey` object per BACKEND_TASKS.md's B24 derivation, scoped
 * to the cohort already filtered to the selected range: `Applied` node
 * value = total submitted in range; `applied->interviewing_oa` =
 * `interviewing_oa + offer + failed`; `applied->rejected` = `rejected`;
 * `applied->ghosted` = `ghosted`; `interviewing_oa->offer` = `offer`;
 * `interviewing_oa->failed` = `failed`. Rows still sitting in `applied` or
 * `interviewing_oa` don't flow anywhere -- no synthetic "pending" node or
 * edge (R5.4). When `total` is 0, still returns the full shape: all 6
 * nodes at value 0, empty `links`.
 */
function buildSankey(cohort: Application[]): Sankey {
  const countOf = (status: ApplicationStatus) =>
    cohort.filter((application) => application.status === status).length

  const interviewingOa = countOf("interviewing_oa")
  const offer = countOf("offer")
  const rejected = countOf("rejected")
  const ghosted = countOf("ghosted")
  const failed = countOf("failed")
  const total = cohort.length

  const appliedToInterviewingOa = interviewingOa + offer + failed

  const nodes: SankeyNode[] = [
    { key: "applied", label: STATUS_LABEL.applied, value: total },
    { key: "interviewing_oa", label: STATUS_LABEL.interviewing_oa, value: interviewingOa },
    { key: "rejected", label: STATUS_LABEL.rejected, value: rejected },
    { key: "ghosted", label: STATUS_LABEL.ghosted, value: ghosted },
    { key: "offer", label: STATUS_LABEL.offer, value: offer },
    { key: "failed", label: STATUS_LABEL.failed, value: failed },
  ]

  if (total === 0) {
    return { nodes, links: [] }
  }

  // Per the shared contract (FRONTEND_TASKS.md / BACKEND_TASKS.md), `links`
  // omits any link with `value: 0` -- not just in the `total === 0` case
  // above, but also e.g. when everything submitted is still sitting in
  // `applied` with no outflow yet (appliedToInterviewingOa/rejected/ghosted
  // all 0 while `total` itself is > 0).
  const allLinks: SankeyLink[] = [
    { source: "applied", target: "interviewing_oa", value: appliedToInterviewingOa },
    { source: "applied", target: "rejected", value: rejected },
    { source: "applied", target: "ghosted", value: ghosted },
    { source: "interviewing_oa", target: "offer", value: offer },
    { source: "interviewing_oa", target: "failed", value: failed },
  ]
  const links = allLinks.filter((link) => link.value > 0)

  return { nodes, links }
}

function buildApplicationsOverTime(
  inRange: Application[],
  granularity: TimeSeriesGranularity
): ApplicationsOverTimePoint[] {
  const counts = new Map<string, number>()

  for (const application of inRange) {
    const key = bucketKeyFor(effectiveDate(application), granularity)
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

/** Mirrors the real backend's `_pct`: percentage 0-100, 1 decimal, `0` if `whole` is falsy -- never a 0-1 fraction. */
function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10
}

function computeRates(cohort: Application[]): {
  response_rate: number
  ghost_rate: number
  rejection_fail_rate: number
} {
  const total = cohort.length
  const responded = cohort.filter((application) => RESPONDED_STATUSES.includes(application.status)).length
  const ghosted = cohort.filter((application) => application.status === "ghosted").length
  const rejected = cohort.filter((application) => application.status === "rejected").length
  const failed = cohort.filter((application) => application.status === "failed").length

  return {
    response_rate: pct(responded, total),
    ghost_rate: pct(ghosted, total),
    rejection_fail_rate: pct(rejected + failed, total),
  }
}

/**
 * Mock approximation of avg time-to-response: this data model has no
 * status-change event history (that's real backend work, see
 * BACKEND_TASKS.md's B14), so this averages
 * `(Date(updated_at) - Date(date_applied)) / 1 day` across in-range
 * applications currently in interviewing_oa/offer/rejected/failed with a
 * non-null `date_applied` -- i.e. applications that visibly moved past
 * "applied" and whose `updated_at` plausibly reflects that move. Excludes
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
 * Mock `GET /dashboard/stats` for F7, updated for the V2 metric contract
 * (F11/F12) and F13's full `week|month|year|all|custom` range set.
 * Defaults to `month` if `range` is missing/invalid, filters
 * `applicationFixtures` to whichever are "in range" by their effective
 * date, and derives every figure in `DashboardStats` from that filtered
 * set -- see the helpers above for the exact formulas.
 *
 * `range=custom` requires `start`/`end` query params (`YYYY-MM-DD`),
 * validated per PRD_V2.md R6.2/BACKEND_TASKS.md's B22 (`start <= end`,
 * inclusive span of 1-366 days) -- missing/malformed dates or a violated
 * span both return `422`, mirroring the real backend so the frontend's
 * "surface the server's 422 too" defense-in-depth path has something
 * real to exercise even though the client already validates first.
 * Replace with a real fetch once B21/B24 ship.
 */
export const dashboardHandlers = [
  http.get(url("/dashboard/stats"), ({ request }) => {
    const authError = requireAuth(request)
    if (authError) {
      return authError
    }

    const searchParams = new URL(request.url).searchParams
    const rawRange = searchParams.get("range")
    const range: DashboardRange =
      rawRange === "week" ||
      rawRange === "month" ||
      rawRange === "year" ||
      rawRange === "all" ||
      rawRange === "custom"
        ? rawRange
        : "month"

    let customStart: string | null = null
    let customEnd: string | null = null
    let customSpanDays: number | null = null

    if (range === "custom") {
      customStart = searchParams.get("start")
      customEnd = searchParams.get("end")

      if (!isValidIsoDate(customStart) || !isValidIsoDate(customEnd)) {
        return HttpResponse.json(
          { message: "range=custom requires valid start and end dates (YYYY-MM-DD)." },
          { status: 422 }
        )
      }
      if (customStart > customEnd) {
        return HttpResponse.json({ message: "start must be on or before end." }, { status: 422 })
      }
      customSpanDays = inclusiveDaySpanDays(customStart, customEnd)
      if (customSpanDays > MAX_CUSTOM_RANGE_DAYS) {
        return HttpResponse.json(
          { message: `Custom range can't span more than ${MAX_CUSTOM_RANGE_DAYS} days.` },
          { status: 422 }
        )
      }
    }

    const todayIso = new Date().toISOString().slice(0, 10)
    const inRange = applicationFixtures.filter((application) =>
      isInRange(effectiveDate(application), range, todayIso, customStart, customEnd)
    )

    const cohort = inRange.filter((application) => APPLIED_COHORT_STATUSES.includes(application.status))
    const { response_rate, ghost_rate, rejection_fail_rate } = computeRates(cohort)
    const granularity = granularityFor(range, customSpanDays)

    const stats: DashboardStats = {
      range,
      total: cohort.length,
      status_breakdown: buildStatusBreakdown(cohort),
      applications_over_time: buildApplicationsOverTime(inRange, granularity),
      time_series_granularity: granularity,
      response_rate,
      ghost_rate,
      rejection_fail_rate,
      avg_time_to_response_days: computeAvgResponseTimeDays(inRange),
      sankey: buildSankey(cohort),
    }

    return HttpResponse.json(stats)
  }),
]
