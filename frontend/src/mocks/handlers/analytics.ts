import { HttpResponse } from "msw"
import { inclusiveDaySpanDays, isValidIsoDate, MAX_CUSTOM_RANGE_DAYS } from "@/lib/date-range"
import type { FunnelCounts } from "@/lib/sankey-data"
import type { Application, ApplicationStatus, DashboardRange, StatusBreakdownEntry } from "@/types/api"

/**
 * Helpers shared by the `/dashboard/stats` and `/dashboard/recap` mocks, so
 * the two compute every figure the same way -- and the way the real
 * `backend/app/services/dashboard_service.py` does.
 */

/** Mirrors `dashboard_service.py`'s `FUNNEL_STATUSES` (6 entries, excludes `saved`). */
export const FUNNEL_STATUSES: ApplicationStatus[] = [
  "applied",
  "interviewing_oa",
  "offer",
  "rejected",
  "failed",
  "ghosted",
]

/** Mirrors `dashboard_service.py`'s `_RESPONDED`: everything that left `applied` other than by ghosting. */
export const RESPONDED_STATUSES: ApplicationStatus[] = ["interviewing_oa", "offer", "rejected", "failed"]

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Mirrors `dashboard_service.py`'s `_pct`: 0-100, 1 decimal, `0` if `whole` is 0. */
export function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10
}

/** Adds (or subtracts, for negative `delta`) whole days to a `YYYY-MM-DD` string, entirely in UTC. */
export function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export function countOf(apps: Application[], status: ApplicationStatus): number {
  return apps.filter((application) => application.status === status).length
}

export function funnelCounts(apps: Application[]): FunnelCounts {
  return {
    total: apps.length,
    interviewingOa: countOf(apps, "interviewing_oa"),
    offer: countOf(apps, "offer"),
    rejected: countOf(apps, "rejected"),
    ghosted: countOf(apps, "ghosted"),
    failed: countOf(apps, "failed"),
  }
}

/** Funnel order, zero counts included. */
export function buildStatusBreakdown(apps: Application[]): StatusBreakdownEntry[] {
  return FUNNEL_STATUSES.map((status) => {
    const count = countOf(apps, status)
    return { status, count, percentage: pct(count, apps.length) }
  })
}

/**
 * Mirrors `avg_time_to_response_days`: mean whole-day gap between
 * `date_applied` and `updated_at`'s calendar date over responded
 * applications, negative gaps (bad data) discarded, 1 decimal. `null` if
 * none qualify.
 */
export function computeAvgResponseTimeDays(apps: Application[]): number | null {
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

export interface RangeQuery {
  range: DashboardRange
  /** Set only for `range=custom`, already validated. */
  customStart: string | null
  customEnd: string | null
}

/**
 * Reads `range`/`start`/`end` like the real `RangeQuery` schema: an unknown
 * `range` becomes `fallback`, and a bad custom range is a `422` (missing or
 * malformed dates, `start > end`, or a span over 366 days).
 */
export function parseRangeQuery(request: Request, fallback: DashboardRange): RangeQuery | HttpResponse<{ detail: string }> {
  const searchParams = new URL(request.url).searchParams
  const rawRange = searchParams.get("range")
  const range: DashboardRange =
    rawRange === "week" ||
    rawRange === "month" ||
    rawRange === "year" ||
    rawRange === "all" ||
    rawRange === "custom"
      ? rawRange
      : fallback

  if (range !== "custom") {
    return { range, customStart: null, customEnd: null }
  }

  const customStart = searchParams.get("start")
  const customEnd = searchParams.get("end")
  if (!isValidIsoDate(customStart) || !isValidIsoDate(customEnd)) {
    return HttpResponse.json(
      { detail: "range=custom requires valid start and end dates (YYYY-MM-DD)." },
      { status: 422 }
    )
  }
  if (customStart > customEnd) {
    return HttpResponse.json({ detail: "start must be on or before end." }, { status: 422 })
  }
  if (inclusiveDaySpanDays(customStart, customEnd) > MAX_CUSTOM_RANGE_DAYS) {
    return HttpResponse.json(
      { detail: `Custom range can't span more than ${MAX_CUSTOM_RANGE_DAYS} days.` },
      { status: 422 }
    )
  }
  return { range, customStart, customEnd }
}
