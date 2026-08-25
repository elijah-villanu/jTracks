import type { Application } from "@/types/api"

/**
 * F22 (PRD_V2.md R3): purely visual nudge for `interviewing_oa` rows that
 * have gone quiet. R2 narrowed the automatic ghosting sweep to
 * `applied`-status rows only, so an interview can otherwise sit stale
 * forever with no prompt to act on it. This threshold is hard-coded and
 * intentionally unrelated to `ghost_days_default` / `ghost_days_override`
 * (those drive the separate, `applied`-only auto-ghosting sweep) -- it
 * must never be exposed as a setting. Display-only: never writes, never
 * calls an API, never changes `status`.
 */
export const STALE_INTERVIEW_THRESHOLD_DAYS = 28

export const STALE_INTERVIEW_MESSAGE =
  "No activity for over 28 days — consider updating this application's status."

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * True when `application.status` is `interviewing_oa` and its `updated_at`
 * is more than 28 days before "now". Both sides of the comparison are UTC
 * epoch milliseconds -- `Date.now()` and `new Date(updated_at).getTime()`
 * on the ISO-8601 `updated_at` timestamp (which always carries an explicit
 * UTC offset) -- so this avoids the local-timezone off-by-one class of bug
 * that motivated `backend/app/core/clock.py`; never mix a UTC-parsed date
 * against a local-timezone "today".
 */
export function isStaleInterview(application: Application): boolean {
  if (application.status !== "interviewing_oa") {
    return false
  }
  const updatedAtMs = new Date(application.updated_at).getTime()
  if (Number.isNaN(updatedAtMs)) {
    return false
  }
  const ageDays = (Date.now() - updatedAtMs) / MS_PER_DAY
  return ageDays > STALE_INTERVIEW_THRESHOLD_DAYS
}
