import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { formatCustomRangeLabel } from "@/lib/date-range"
import { buildSankey } from "@/lib/sankey-data"
import { applicationFixtures } from "@/mocks/fixtures/applications"
import {
  addDaysIso,
  buildStatusBreakdown,
  computeAvgResponseTimeDays,
  countOf,
  funnelCounts,
  parseRangeQuery,
  pct,
  RESPONDED_STATUSES,
} from "@/mocks/handlers/analytics"
import { requireAuth } from "@/mocks/handlers/require-auth"
import type { Application, DashboardRange, DashboardRecap, RecapHighlight } from "@/types/api"

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
 * Deliberately NOT reusing F7's dashboard.ts windowing
 * (`effectiveDate`/`isInRange`) here: those window applications by
 * an "effective date" fallback chain (`date_applied` ?? `date_saved` ??
 * `created_at`), a frontend-only approximation. The real backend's
 * `compute_stats` (which `compute_recap` calls into) only considers
 * *submitted* applications (a non-null `date_applied`) filtered by
 * `date_applied` itself, with no fallback to `date_saved`/`created_at`
 * -- so this handler mirrors that directly instead. The figures
 * themselves come from the shared helpers in `./analytics`.
 *
 * `period_label`/`period_start`/`period_end` follow R6.3's table for
 * every range, and `all`'s `period_start` mirrors `recap_service.py`'s
 * exact fallback chain: the earliest `date_applied` across all submitted
 * applications, or (if none exist) the window's `end`, since the payload
 * always needs a real, ordered date pair even when the range itself is
 * unbounded.
 */

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
  // custom -- both dates are validated (present, ordered, 1-366 day span) by `parseRangeQuery`.
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

export const recapHandlers = [
  http.get(url("/dashboard/recap"), ({ request }) => {
    const authError = requireAuth(request)
    if (authError) {
      return authError
    }

    // Default "week", matching the real backend.
    const query = parseRangeQuery(request, "week")
    if (query instanceof HttpResponse) {
      return query
    }
    const { range, customStart, customEnd } = query

    const todayIso = new Date().toISOString().slice(0, 10)
    const { start, end, label } = periodFor(range, todayIso, customStart, customEnd)

    const apps = submittedInWindow(applicationFixtures, start, end)
    const total = apps.length
    // `all` has no lower bound, so its "start" is the first application the
    // user ever submitted; with nothing submitted at all, collapse to `end`
    // so the payload still carries a real, ordered pair of dates -- mirrors
    // `recap_service.py`'s `period_start` fallback chain exactly.
    const periodStart = start ?? earliestAppliedDate(apps) ?? end

    const offers = countOf(apps, "offer")
    const failed = countOf(apps, "failed")
    // R4.5: offer and failed necessarily passed through the interview stage, so all three count.
    const interviews = countOf(apps, "interviewing_oa") + offers + failed

    const responded = apps.filter((application) => RESPONDED_STATUSES.includes(application.status)).length
    const responseRate = pct(responded, total)
    const ghostRate = pct(countOf(apps, "ghosted"), total)
    const rejectionFailRate = pct(countOf(apps, "rejected") + failed, total)
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
      status_breakdown: buildStatusBreakdown(apps),
      sankey: buildSankey(funnelCounts(apps)),
    }

    return HttpResponse.json(recap)
  }),
]
