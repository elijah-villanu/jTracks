/**
 * Shared helpers for F13's `custom` dashboard range: UTC-safe day-span
 * math (mirroring `backend/app/core/clock.py`'s reasoning -- never do
 * local-timezone `new Date()` arithmetic on `YYYY-MM-DD` strings) plus
 * conversion between those ISO date strings and the `Date` objects
 * `react-day-picker`'s `Calendar` (src/components/ui/calendar.tsx) hands
 * back on selection. Used by both `date-range-control.tsx` (the shared
 * range toggle) and the mock handlers (src/mocks/handlers/dashboard.ts /
 * recap.ts), which mirror the same 1-366-day validation server-side per
 * BACKEND_TASKS.md's B22.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Max inclusive day span the backend (and this mock) accepts for `range=custom`, per BACKEND_TASKS.md's B22. */
export const MAX_CUSTOM_RANGE_DAYS = 366

/** Parses a `YYYY-MM-DD` string as UTC midnight -- never `new Date(iso)`, which is local-timezone-dependent for date-only strings in some engines and inconsistent across them. */
function parseIsoDateUtc(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime()
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` format check, plus a real-calendar-date check (rejects e.g. `2024-13-40`). Used by the mock handlers to validate `range=custom`'s `start`/`end` query params server-side. */
export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE_RE.test(value)) {
    return false
  }
  return !Number.isNaN(parseIsoDateUtc(value))
}

/** Inclusive day span between two `YYYY-MM-DD` strings, computed entirely in UTC (same day -> 1, not 0). */
export function inclusiveDaySpanDays(start: string, end: string): number {
  return Math.round((parseIsoDateUtc(end) - parseIsoDateUtc(start)) / MS_PER_DAY) + 1
}

/**
 * Client-side validation for a `custom` range, per PRD_V2.md R6.2:
 * `start <= end` and an inclusive span of 1-366 days. Returns a
 * human-readable error, or `null` if the range is valid. An incomplete
 * pair (either date still unset) is *not* an error -- it's just not
 * ready to submit yet -- so callers should gate the actual fetch on
 * `start && end` separately.
 */
export function validateCustomRange(start: string | null, end: string | null): string | null {
  if (!start || !end) {
    return null
  }
  if (start > end) {
    return "Start date must be on or before the end date."
  }
  const span = inclusiveDaySpanDays(start, end)
  if (span > MAX_CUSTOM_RANGE_DAYS) {
    return `Custom range can't span more than ${MAX_CUSTOM_RANGE_DAYS} days (currently ${span}).`
  }
  return null
}

/** Formats a `Date` (as produced by the Calendar's local-midnight selection) as a `YYYY-MM-DD` string, reading local fields directly rather than going through `toISOString` (which would shift the date in positive-UTC-offset timezones). */
export function dateToIsoDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Parses a `YYYY-MM-DD` string into a local-midnight `Date`, the inverse of `dateToIsoDateString` -- deliberately not `new Date(iso)`, which parses as UTC midnight and would display as the previous day in positive-UTC-offset timezones. */
export function isoDateStringToDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day)
}

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * R6.3's `custom` period label, e.g. `"Jan 1 – Mar 15, 2026"` (spelled out
 * on both sides when the range crosses a year boundary) -- ported
 * byte-for-byte from `backend/app/services/ranges.py`'s
 * `format_custom_label` so the mock and the real backend agree exactly.
 * Built by hand (not `Intl.DateTimeFormat`/`%-d`) to sidestep any
 * locale/host inconsistency in day-padding.
 */
export function formatCustomRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00Z`)
  const end = new Date(`${endIso}T00:00:00Z`)
  const startYear = start.getUTCFullYear()
  const endYear = end.getUTCFullYear()

  let left = `${MONTH_ABBREVIATIONS[start.getUTCMonth()]} ${start.getUTCDate()}`
  const right = `${MONTH_ABBREVIATIONS[end.getUTCMonth()]} ${end.getUTCDate()}, ${endYear}`
  if (startYear !== endYear) {
    left = `${left}, ${startYear}`
  }
  return `${left} – ${right}`
}
