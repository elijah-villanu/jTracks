import { dayOf, dayOfTimestamp, monthName, shortDate, weekdayOf, yearOf } from "@/lib/days"
import type { Application, ApplicationStatus, DashboardRange, StatusBreakdownEntry } from "@/types/api"

const DAY_MS = 86_400_000

/** An inclusive window of day numbers; `start: null` is "all time". */
export interface DayWindow {
  start: number | null
  end: number
}

/**
 * The same windows as backend/app/services/ranges.py, so the panels worked out
 * here (time to hear back, weekdays, activity) cover exactly the applications
 * the backend's numbers do: week = last 7 days, month = last 30, year = the
 * trailing 12 calendar months, custom = the two dates inclusive.
 */
export function resolveWindow(
  range: DashboardRange,
  customStart: string | null,
  customEnd: string | null,
  today: number
): DayWindow | null {
  switch (range) {
    case "week":
      return { start: today - 6, end: today }
    case "month":
      return { start: today - 29, end: today }
    case "year": {
      const d = new Date(today * DAY_MS)
      return { start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1) / DAY_MS, end: today }
    }
    case "all":
      return { start: null, end: today }
    case "custom":
      return customStart && customEnd && customStart <= customEnd ? { start: dayOf(customStart), end: dayOf(customEnd) } : null
  }
}

/** The same number of days just before `w`: what the KPI deltas compare against. None for all time. */
export function priorWindow(w: DayWindow): DayWindow | null {
  if (w.start === null) return null
  const length = w.end - w.start + 1
  return { start: w.start - length, end: w.start - 1 }
}

/** "Oct 12 – Nov 10", "Nov 4 – 10", "Dec 1, 2025 – Jan 30, 2026". */
export function periodText(w: DayWindow, earliest: number | null): string {
  const a = w.start ?? earliest ?? w.end
  const ya = yearOf(a)
  const yb = yearOf(w.end)
  if (ya !== yb) return `${shortDate(a)}, ${ya} – ${shortDate(w.end)}, ${yb}`
  return monthName(a) === monthName(w.end)
    ? `${shortDate(a)} – ${new Date(w.end * DAY_MS).getUTCDate()}`
    : `${shortDate(a)} – ${shortDate(w.end)}`
}

export const inWindow = (a: Application, w: DayWindow): boolean => {
  if (!a.date_applied) return false
  const d = dayOf(a.date_applied)
  return (w.start === null || d >= w.start) && d <= w.end
}

/** Statuses that count as hearing back (a rejection is a reply), as in the backend's response rate. */
const RESPONDED: ApplicationStatus[] = ["interviewing_oa", "offer", "rejected", "failed"]

export interface Funnel {
  total: number
  applied: number
  interviewing: number
  offer: number
  rejected: number
  failed: number
  ghosted: number
  /** Everything that left Applied except by ghosting. */
  responded: number
  /** Interviewing / OA, plus the offers and failed interviews that came out of one. */
  interviews: number
}

/** Counts per outcome, from the backend's status breakdown. */
export function funnelOf(breakdown: StatusBreakdownEntry[], total: number): Funnel {
  const c = (s: ApplicationStatus) => breakdown.find((e) => e.status === s)?.count ?? 0
  const interviewing = c("interviewing_oa")
  const offer = c("offer")
  const rejected = c("rejected")
  const failed = c("failed")
  return {
    total,
    applied: c("applied"),
    interviewing,
    offer,
    rejected,
    failed,
    ghosted: c("ghosted"),
    responded: interviewing + offer + rejected + failed,
    interviews: interviewing + offer + failed,
  }
}

/**
 * Days from applying to the last status change, for every reply in the window:
 * the backend's own definition behind avg_time_to_response_days (there is no
 * status history, so the last change is the closest measure).
 */
export function replyDays(apps: Application[], w: DayWindow): number[] {
  return apps
    .filter((a) => RESPONDED.includes(a.status) && inWindow(a, w))
    .map((a) => dayOfTimestamp(a.updated_at) - dayOf(a.date_applied!))
    .filter((d) => d >= 0)
}

/** Applications sent per weekday (Monday first) within the window. */
export function weekdayCounts(apps: Application[], w: DayWindow): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const a of apps) if (inWindow(a, w)) counts[weekdayOf(dayOf(a.date_applied!))] += 1
  return counts
}

/** Applications sent per day, across everything ever sent. */
export function perDay(apps: Application[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const a of apps) {
    if (!a.date_applied) continue
    const d = dayOf(a.date_applied)
    map.set(d, (map.get(d) ?? 0) + 1)
  }
  return map
}

/** Weekly streaks, Monday to Sunday. The current week counts once it has one application. */
export function streaks(per: Map<number, number>, today: number): { current: number; longest: number } {
  const week = (monday: number) => {
    let n = 0
    for (let i = 0; i < 7; i++) n += per.get(monday + i) ?? 0
    return n
  }
  const thisMonday = today - weekdayOf(today)
  let current = 0
  let m = week(thisMonday) ? thisMonday : thisMonday - 7
  while (week(m)) {
    current += 1
    m -= 7
  }
  let longest = 0
  let run = 0
  if (per.size) {
    const first = Math.min(...per.keys())
    for (let mon = first - weekdayOf(first); mon <= thisMonday; mon += 7) {
      if (week(mon)) longest = Math.max(longest, ++run)
      else run = 0
    }
  }
  return { current, longest }
}

/** Time-to-hear-back buckets, in days. */
export const HEAR_BINS: [number, number, string][] = [
  [0, 3, "0–3"],
  [4, 7, "4–7"],
  [8, 14, "8–14"],
  [15, 21, "15–21"],
  [22, 30, "22–30"],
  [31, Infinity, "31+"],
]

/** How many weeks the calendar shows for a window: its length, held between 26 and 53. */
export const calendarWeeks = (w: DayWindow) => Math.max(26, Math.min(53, Math.ceil((w.start === null ? 365 : w.end - w.start + 1) / 7)))
