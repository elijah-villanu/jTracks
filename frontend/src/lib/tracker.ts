import { ALL_STATUSES } from "@/components/StatusBadge"
import { dayOf, dayOfTimestamp, plural } from "@/lib/days"
import { isStaleInterview } from "@/lib/staleness"
import type { Application } from "@/types/api"

/**
 * Id of an application's status trigger (the board's Move button or the
 * table's status button). Only one view is mounted at a time, so it is
 * unique; ApplicationsPage finds it again by id to put focus back after a
 * move remounts the card in another column.
 */
export const statusTriggerId = (applicationId: string) => `status-${applicationId}`

export const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase() || "?"

/** The date a card shows and sorts by: when it was saved, for Saved; when it was applied, otherwise. */
export function cardDay(a: Application): number | null {
  const iso = a.status === "saved" ? (a.date_saved ?? a.created_at.slice(0, 10)) : a.date_applied
  return iso ? dayOf(iso) : null
}

export interface GhostRing {
  /** 0..1, how much of the ring is filled. */
  fill: number
  text: string
  tone: "" | "near" | "stale"
  label: string
  note: string
}

/**
 * The countdown ring on a card, or null when there is nothing to count.
 * Applied: days left before the daily sweep marks it Ghosted, from the same
 * rule as backend/app/services/ghosting.py (date_applied + the row's own limit,
 * else the account default). Interviewing: a full amber ring once it has had
 * no update for 28+ days (lib/staleness.ts).
 */
export function ghostRing(a: Application, defaultDays: number, today: number): GhostRing | null {
  if (a.status === "applied" && a.date_applied) {
    const limit = a.ghost_days_override ?? defaultDays
    const quiet = Math.max(today - dayOf(a.date_applied), 0)
    const left = Math.max(limit - quiet, 0)
    return {
      fill: Math.min(1, quiet / limit),
      text: `${left}d`,
      tone: left <= 3 ? "near" : "",
      label: `${plural(left, "day")} until Ghosted. Quiet ${quiet} of ${limit} days${a.ghost_days_override ? " (its own limit)" : ""}.`,
      note: `Days until marked Ghosted · quiet ${quiet} of ${limit}`,
    }
  }
  if (isStaleInterview(a)) {
    const since = today - dayOfTimestamp(a.updated_at)
    return {
      fill: 1,
      text: `${since}d`,
      tone: "stale",
      label: `No update in ${since} days.`,
      note: "Days since this interview was updated",
    }
  }
  return null
}

/** Days until an Applied row ghosts, or null for any other row. */
export function daysUntilGhosted(a: Application, defaultDays: number, today: number): number | null {
  if (a.status !== "applied" || !a.date_applied) return null
  return (a.ghost_days_override ?? defaultDays) - (today - dayOf(a.date_applied))
}

/* ---------- board column sorts ---------- */
export type ColumnSort = "new" | "old" | "az" | "za"

export const COLUMN_SORTS: { value: ColumnSort; label: string }[] = [
  { value: "new", label: "Newest first" },
  { value: "old", label: "Oldest first" },
  { value: "az", label: "Company A–Z" },
  { value: "za", label: "Company Z–A" },
]

const byCompany = (x: Application, y: Application) =>
  x.company.localeCompare(y.company) || x.title.localeCompare(y.title)
const dayOrZero = (a: Application) => cardDay(a) ?? 0

export const COLUMN_COMPARE: Record<ColumnSort, (x: Application, y: Application) => number> = {
  new: (x, y) => dayOrZero(y) - dayOrZero(x) || byCompany(x, y),
  old: (x, y) => dayOrZero(x) - dayOrZero(y) || byCompany(x, y),
  az: byCompany,
  za: (x, y) => byCompany(y, x),
}

/* ---------- table sorts ---------- */
export type TableSortKey = "company" | "status" | "applied" | "updated"
export interface TableSort {
  key: TableSortKey
  /** 1 ascending, -1 descending. */
  dir: 1 | -1
}

const TABLE_VALUE: Record<TableSortKey, (a: Application) => string | number> = {
  company: (a) => a.company.toLowerCase(),
  status: (a) => ALL_STATUSES.indexOf(a.status),
  applied: (a) => (a.date_applied ? dayOf(a.date_applied) : -1),
  updated: (a) => Date.parse(a.updated_at),
}

export function sortRows(list: Application[], { key, dir }: TableSort): Application[] {
  const value = TABLE_VALUE[key]
  return [...list].sort((x, y) => {
    const a = value(x)
    const b = value(y)
    return (a < b ? -1 : a > b ? 1 : 0) * dir
  })
}

/** "Today", "Yesterday", "12 days ago". */
export function updatedAgo(a: Application, today: number): string {
  const n = today - dayOfTimestamp(a.updated_at)
  return n <= 0 ? "Today" : n === 1 ? "Yesterday" : `${n} days ago`
}
