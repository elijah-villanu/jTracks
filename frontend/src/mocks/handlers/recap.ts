import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import {
  formatCustomRangeLabel,
  inclusiveDaySpanDays,
  isValidIsoDate,
  MAX_CUSTOM_RANGE_DAYS,
} from "@/lib/date-range"
import { applicationFixtures } from "@/mocks/fixtures/applications"
import { requireAuth } from "@/mocks/handlers/require-auth"
import { STATUS_LABEL } from "@/components/StatusBadge"
import type {
  Application,
  ApplicationStatus,
  DashboardRange,
  DashboardRecap,
  RecapHighlight,
  Sankey,
  SankeyLink,
  SankeyNode,
  StatusBreakdownEntry,
} from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

/**
 * Mock `GET /dashboard/recap`, replicating backend/app/services/
 * recap_service.py's `compute_recap` (and the `compute_stats` it calls
 * into, backend/app/services/dashboard_service.py) *exactly* -- same
 * period framing, same "submitted" cohort, same headline rules, same
 * highlight labels/order -- so this mock needs zero changes when B16
 * ships, only a mock-vs-real fetch swap. See
 * docs/decisions/recap-image-approach.md (B15: client-side rendering)
 * for why this endpoint only returns numbers; the image itself is
 * rendered and exported entirely client-side, see
 * src/components/dashboard/recap-card.tsx and recap-dialog.tsx.
 *
 * Deliberately NOT reusing F7's dashboard.ts mock helpers
 * (`effectiveDate`/`isInRange`/etc.) here: those window applications by
 * an "effective date" fallback chain (`date_applied` ?? `date_saved` ??
 * `created_at`), a frontend-only approximation. The real backend's
 * `compute_stats` (which `compute_recap` calls into) only considers
 * *submitted* applications (a non-null `date_applied`) filtered by
 * `date_applied` itself, with no fallback to `date_saved`/`created_at`
 * -- so this handler mirrors that directly instead.
 *
 * V2 (F11/F12): status vocabulary widened to the 6-entry funnel, `interviews`
 * now includes `failed` (PRD_V2.md R4.5 -- offer and failed necessarily
 * passed through the interview stage, so all three count), a
 * "Rejection/fail rate" highlight was added, and a `sankey` object is
 * returned -- `DashboardRecap` (src/types/api.ts) carries all of this for
 * real as of F12.
 *
 * F13: widened from `week|month` to the full `week|month|year|all|custom`
 * set, matching `/dashboard/stats`. `period_label`/`period_start`/
 * `period_end` now follow R6.3's table for every range, and `all`'s
 * `period_start` mirrors `recap_service.py`'s exact fallback chain: the
 * earliest `date_applied` across all submitted applications, or (if none
 * exist) the window's `end`, since the payload always needs a real,
 * ordered date pair even when the range itself is unbounded.
 */

/** Mirrors `dashboard_service.py`'s `_FUNNEL_STATUSES` (V2: 6 entries, excludes `saved`). */
const FUNNEL_STATUSES: ApplicationStatus[] = [
  "applied",
  "interviewing_oa",
  "offer",
  "rejected",
  "failed",
  "ghosted",
]

/** Mirrors `dashboard_service.py`'s `_RESPONDED` (V2: adds `failed`). */
const RESPONDED_STATUSES: ApplicationStatus[] = ["interviewing_oa", "offer", "rejected", "failed"]

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Mirrors `dashboard_service.py`'s `_pct`: `round((part / whole) * 100, 1)`, `0.0` if `whole` is falsy. */
function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10
}

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/**
 * Window + R6.3 label for each range, mirroring `ranges.py`'s
 * `resolve_range` (`start: null` means unbounded, i.e. `all`). `year`
 * here is a flat trailing 365 days rather than `ranges.py`'s trailing-12-
 * calendar-months -- a deliberate simplification F13's task notes permit
 * ("directionally correct" is enough for a mock); the real backend's
 * choice of calendar months (see `ranges.py`'s module docstring) is a
 * bucketing-precision concern this endpoint doesn't have anyway, since
 * `DashboardRecap` carries no time series.
 */
function periodFor(
  range: DashboardRange,
  todayIso: string,
  customStart: string | null,
  customEnd: string | null
): { start: string | null; end: string; label: string } {
  if (range === "week") {
    return { start: addDaysIso(todayIso, -6), end: todayIso, label: "This week" }
  }
  if (range === "month") {
    return { start: addDaysIso(todayIso, -29), end: todayIso, label: "This month" }
  }
  if (range === "year") {
    return { start: addDaysIso(todayIso, -364), end: todayIso, label: "This year" }
  }
  if (range === "all") {
    return { start: null, end: todayIso, label: "All time" }
  }
  // custom -- both dates are validated (present, ordered, 1-366 day span) by the handler before this runs.
  return {
    start: customStart,
    end: customEnd as string,
    label: formatCustomRangeLabel(customStart as string, customEnd as string),
  }
}

/** Mirrors `dashboard_service.py`'s `_fetch_submitted`: only applications with a `date_applied`, filtered to the window (inclusive). `start: null` means unbounded (the `all` range). */
function submittedInWindow(apps: Application[], start: string | null, end: string): Application[] {
  return apps.filter(
    (application) =>
      application.date_applied !== null &&
      (start === null || application.date_applied >= start) &&
      application.date_applied <= end
  )
}

/** Earliest `date_applied` among a set of applications (already filtered to non-null), or `null` if empty -- feeds `all`'s `period_start` fallback, mirroring `recap_service.py`'s `agg.earliest_applied`. */
function earliestAppliedDate(apps: Application[]): string | null {
  return apps.reduce<string | null>((earliest, application) => {
    if (!application.date_applied) {
      return earliest
    }
    return earliest === null || application.date_applied < earliest ? application.date_applied : earliest
  }, null)
}

/** Mirrors `dashboard_service.py`'s status-count/percentage breakdown (funnel order, excludes `saved`, V2: 6 entries including zero counts). */
function buildStatusBreakdown(apps: Application[]): StatusBreakdownEntry[] {
  const total = apps.length
  return FUNNEL_STATUSES.map((status) => {
    const count = apps.filter((application) => application.status === status).length
    return { status, count, percentage: pct(count, total) }
  })
}

/**
 * Builds the `sankey` object per BACKEND_TASKS.md's B24 derivation,
 * scoped to the recap's period window (the same `apps` cohort the rest of
 * this handler already computed): `Applied` node value = total submitted
 * in period; `applied->interviewing_oa` = `interviewing_oa + offer +
 * failed`; `applied->rejected` = `rejected`; `applied->ghosted` =
 * `ghosted`; `interviewing_oa->offer` = `offer`; `interviewing_oa->failed`
 * = `failed`. When `total` is 0, still returns the full shape: all 6
 * nodes at value 0, empty `links`.
 */
function buildSankey(apps: Application[]): Sankey {
  const countOf = (status: ApplicationStatus) =>
    apps.filter((application) => application.status === status).length

  const interviewingOa = countOf("interviewing_oa")
  const offer = countOf("offer")
  const rejected = countOf("rejected")
  const ghosted = countOf("ghosted")
  const failed = countOf("failed")
  const total = apps.length

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
  // `applied` with no outflow yet.
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

/**
 * Mirrors `dashboard_service.py`'s `avg_time_to_response_days`: mean
 * whole-day gap between `date_applied` and `updated_at`'s *calendar
 * date* (not a fractional/time-of-day diff), over responded
 * (interviewing_oa/offer/rejected/failed) applications, discarding
 * negative gaps (bad data), rounded to 1 decimal. `null` if none qualify.
 */
function computeAvgResponseTimeDays(apps: Application[]): number | null {
  const days = apps
    .filter((application) => RESPONDED_STATUSES.includes(application.status) && application.date_applied)
    .map((application) => {
      const appliedMs = new Date(`${application.date_applied}T00:00:00Z`).getTime()
      const updatedMs = new Date(`${application.updated_at.slice(0, 10)}T00:00:00Z`).getTime()
      return Math.round((updatedMs - appliedMs) / MS_PER_DAY)
    })
    .filter((delta) => delta >= 0)

  if (days.length === 0) {
    return null
  }

  const avg = days.reduce((sum, delta) => sum + delta, 0) / days.length
  return Math.round(avg * 10) / 10
}

export const recapHandlers = [
  http.get(url("/dashboard/recap"), ({ request }) => {
    const authError = requireAuth(request)
    if (authError) {
      return authError
    }

    const searchParams = new URL(request.url).searchParams
    const rawRange = searchParams.get("range")
    // Default "week", matching the real backend.
    const range: DashboardRange =
      rawRange === "week" ||
      rawRange === "month" ||
      rawRange === "year" ||
      rawRange === "all" ||
      rawRange === "custom"
        ? rawRange
        : "week"

    let customStart: string | null = null
    let customEnd: string | null = null

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
      if (inclusiveDaySpanDays(customStart, customEnd) > MAX_CUSTOM_RANGE_DAYS) {
        return HttpResponse.json(
          { message: `Custom range can't span more than ${MAX_CUSTOM_RANGE_DAYS} days.` },
          { status: 422 }
        )
      }
    }

    const todayIso = new Date().toISOString().slice(0, 10)
    const { start, end, label } = periodFor(range, todayIso, customStart, customEnd)

    const apps = submittedInWindow(applicationFixtures, start, end)
    const total = apps.length
    // `all` has no lower bound, so its "start" is the first application the
    // user ever submitted; with nothing submitted at all, collapse to `end`
    // so the payload still carries a real, ordered pair of dates -- mirrors
    // `recap_service.py`'s `period_start` fallback chain exactly.
    const periodStart = start ?? earliestAppliedDate(apps) ?? end
    const statusBreakdown = buildStatusBreakdown(apps)

    const offers = statusBreakdown.find((entry) => entry.status === "offer")?.count ?? 0
    const interviewingOaCount = statusBreakdown.find((entry) => entry.status === "interviewing_oa")?.count ?? 0
    const failed = statusBreakdown.find((entry) => entry.status === "failed")?.count ?? 0
    // R4.5: offer and failed necessarily passed through the interview stage, so all three count.
    const interviews = interviewingOaCount + offers + failed

    const responded = apps.filter((application) => RESPONDED_STATUSES.includes(application.status)).length
    const ghosted = apps.filter((application) => application.status === "ghosted").length
    const rejected = apps.filter((application) => application.status === "rejected").length
    const responseRate = pct(responded, total)
    const ghostRate = pct(ghosted, total)
    const rejectionFailRate = pct(rejected + failed, total)
    const avgResponseTimeDays = computeAvgResponseTimeDays(apps)

    let headline: string
    if (total === 0) {
      headline = "No applications yet this period — go get 'em."
    } else if (offers > 0) {
      headline = `${total} applications, ${offers} offer${offers !== 1 ? "s" : ""}!`
    } else {
      headline = `${total} applications sent ${label.toLowerCase()}.`
    }

    const highlights: RecapHighlight[] = [
      { label: "Applications", value: String(total) },
      { label: "Interviews", value: String(interviews) },
      { label: "Offers", value: String(offers) },
      { label: "Response rate", value: `${responseRate.toFixed(0)}%` },
      { label: "Ghost rate", value: `${ghostRate.toFixed(0)}%` },
      { label: "Rejection/fail rate", value: `${rejectionFailRate.toFixed(0)}%` },
    ]
    if (avgResponseTimeDays !== null) {
      highlights.push({ label: "Avg. reply time", value: `${avgResponseTimeDays.toFixed(0)} days` })
    }

    const recap: DashboardRecap = {
      range,
      period_label: label,
      period_start: periodStart,
      period_end: end,
      total_applications: total,
      headline,
      highlights,
      status_breakdown: statusBreakdown,
      sankey: buildSankey(apps),
    }

    return HttpResponse.json(recap)
  }),
]
