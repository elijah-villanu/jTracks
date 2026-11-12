/**
 * Whole-day arithmetic in UTC, the way the backend does it (app/core/clock.py):
 * a date is a day number (days since 1970-01-01, UTC), so "today minus applied"
 * never drifts by one on a non-UTC machine.
 */
const DAY_MS = 86_400_000
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** `YYYY-MM-DD` to a day number. */
export const dayOf = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS)

/** An ISO timestamp (e.g. `updated_at`) to the UTC day it falls on. */
export const dayOfTimestamp = (ts: string): number => Math.floor(Date.parse(ts) / DAY_MS)

export const todayDay = (): number => Math.floor(Date.now() / DAY_MS)

/** Day number back to `YYYY-MM-DD`. */
export const isoOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10)

/** "Nov 10". */
export function shortDate(day: number): string {
  const d = new Date(day * DAY_MS)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export const monthName = (day: number): string => MONTHS[new Date(day * DAY_MS).getUTCMonth()]
export const yearOf = (day: number): number => new Date(day * DAY_MS).getUTCFullYear()

/** Monday = 0 ... Sunday = 6. */
export const weekdayOf = (day: number): number => (new Date(day * DAY_MS).getUTCDay() + 6) % 7

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
