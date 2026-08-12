import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { applicationFixtures } from "@/mocks/fixtures/applications"
import type {
  Application,
  ApplicationStatus,
  DashboardRecap,
  RecapHighlight,
  RecapRange,
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
 */

/** Mirrors `dashboard_service.py`'s `_FUNNEL_STATUSES` (excludes `saved`). */
const FUNNEL_STATUSES: ApplicationStatus[] = ["applied", "interviewing", "offer", "rejected", "ghosted"]

/** Mirrors `dashboard_service.py`'s `_RESPONDED`. */
const RESPONDED_STATUSES: ApplicationStatus[] = ["interviewing", "offer", "rejected"]

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

/** Mirrors `recap_service.py`'s `_period`: week = today-6d..today, month = today-29d..today (both inclusive of today). */
function periodFor(range: RecapRange, todayIso: string): { start: string; end: string; label: string } {
  if (range === "week") {
    return { start: addDaysIso(todayIso, -6), end: todayIso, label: "This week" }
  }
  return { start: addDaysIso(todayIso, -29), end: todayIso, label: "This month" }
}

/** Mirrors `dashboard_service.py`'s `_fetch_submitted`: only applications with a `date_applied`, filtered to the window (inclusive). */
function submittedInWindow(apps: Application[], start: string, end: string): Application[] {
  return apps.filter(
    (application) =>
      application.date_applied !== null &&
      application.date_applied >= start &&
      application.date_applied <= end
  )
}

/** Mirrors `dashboard_service.py`'s status-count/percentage breakdown (funnel order, excludes `saved`). */
function buildStatusBreakdown(apps: Application[]): StatusBreakdownEntry[] {
  const total = apps.length
  return FUNNEL_STATUSES.map((status) => {
    const count = apps.filter((application) => application.status === status).length
    return { status, count, percentage: pct(count, total) }
  })
}

/**
 * Mirrors `dashboard_service.py`'s `avg_time_to_response_days`: mean
 * whole-day gap between `date_applied` and `updated_at`'s *calendar
 * date* (not a fractional/time-of-day diff), over responded
 * (interviewing/offer/rejected) applications, discarding negative gaps
 * (bad data), rounded to 1 decimal. `null` if none qualify.
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
    const rawRange = new URL(request.url).searchParams.get("range")
    const range: RecapRange = rawRange === "month" ? "month" : "week" // default "week", matching the real backend

    const todayIso = new Date().toISOString().slice(0, 10)
    const { start, end, label } = periodFor(range, todayIso)

    const apps = submittedInWindow(applicationFixtures, start, end)
    const total = apps.length
    const statusBreakdown = buildStatusBreakdown(apps)

    const offers = statusBreakdown.find((entry) => entry.status === "offer")?.count ?? 0
    const interviewingCount = statusBreakdown.find((entry) => entry.status === "interviewing")?.count ?? 0
    const interviews = interviewingCount + offers

    const responded = apps.filter((application) => RESPONDED_STATUSES.includes(application.status)).length
    const ghosted = apps.filter((application) => application.status === "ghosted").length
    const responseRate = pct(responded, total)
    const ghostRate = pct(ghosted, total)
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
    ]
    if (avgResponseTimeDays !== null) {
      highlights.push({ label: "Avg. reply time", value: `${avgResponseTimeDays.toFixed(0)} days` })
    }

    const recap: DashboardRecap = {
      range,
      period_label: label,
      period_start: start,
      period_end: end,
      total_applications: total,
      headline,
      highlights,
      status_breakdown: statusBreakdown,
    }

    return HttpResponse.json(recap)
  }),
]
