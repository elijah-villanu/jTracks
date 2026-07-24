/**
 * Shared contract types.
 *
 * These mirror the `applications` / `users` entities defined in
 * DATABASE_TASKS.md and the API surface defined in BACKEND_TASKS.md /
 * FRONTEND_TASKS.md. Keep this file in sync with those documents --
 * later milestones (F2+) build directly on these shapes.
 */

export type ApplicationStatus =
  | "saved"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected"
  | "ghosted"

export interface Application {
  id: string
  user_id: string
  company: string
  title: string
  status: ApplicationStatus
  job_url: string | null
  location: string | null
  salary: string | null
  date_posted: string | null
  date_saved: string | null
  date_applied: string | null
  ghost_days_override: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  ghost_days_default: number
  created_at: string
}

/**
 * Auth contract (F2 -- mocked in src/mocks/handlers/auth.ts until B2/B3
 * ship). `access_token` is a JWT once the real backend exists; the mock
 * issues an opaque fake token. `AuthResponse` is returned by
 * `/auth/signup`, `/auth/login`, and `/auth/oauth/google`.
 */
export interface AuthResponse {
  access_token: string
  user: User
}

/**
 * Autofill contract (F5 -- mocked in src/mocks/handlers/autofill.ts;
 * the real parsers are BACKEND_TASKS.md's B10-B13, not yet built).
 * `POST /applications/autofill { url }` returns one of three shapes:
 * a successful parse, an explicit "we don't support this domain"
 * (LinkedIn/Glassdoor/anything unrecognized), or a "we tried and
 * couldn't" (supported domain, but the fetch/parse itself failed --
 * timeout, blocked, structure changed). Per PRD.md, all three (plus
 * any thrown network error) must land the user on the same manual
 * review/edit form -- see AutofillResponse's consumer in
 * src/components/applications/autofill-dialog.tsx.
 */
export interface AutofillParsedFields {
  company: string
  title: string
  location: string | null
  salary: string | null
  date_posted: string | null
}

export interface AutofillUnsupported {
  unsupported: true
}

export interface AutofillFailed {
  failed: true
}

export type AutofillResponse = AutofillParsedFields | AutofillUnsupported | AutofillFailed

export function isAutofillSuccess(response: AutofillResponse): response is AutofillParsedFields {
  return !("unsupported" in response) && !("failed" in response)
}

export function isAutofillUnsupported(response: AutofillResponse): response is AutofillUnsupported {
  return "unsupported" in response && response.unsupported === true
}

export function isAutofillFailed(response: AutofillResponse): response is AutofillFailed {
  return "failed" in response && response.failed === true
}

/**
 * Dashboard stats contract (F7 -- mocked in src/mocks/handlers/dashboard.ts
 * until BACKEND_TASKS.md's B14 ships). `GET /dashboard/stats?range=...`
 * returns this shape. Per PRD.md, the status breakdown deliberately
 * excludes `saved` (those haven't entered the outcome funnel yet) --
 * `total_applications` is the one figure that includes it.
 */
export type DashboardRange = "week" | "month" | "all"

export interface StatusBreakdownEntry {
  status: ApplicationStatus // only applied/interviewing/offer/rejected/ghosted will appear
  count: number
  percentage: number // 0-100, of the applied-or-later cohort (the breakdown's own total), not of all applications including saved
}

export interface ApplicationsOverTimePoint {
  date: string // ISO date, bucket start
  count: number
}

export interface DashboardStats {
  range: DashboardRange
  total_applications: number // every application regardless of status, including saved
  status_breakdown: StatusBreakdownEntry[]
  applications_over_time: ApplicationsOverTimePoint[]
  response_rate: number // 0-1 fraction: (interviewing+offer+rejected) / (applied+interviewing+offer+rejected+ghosted) -- i.e. of everything that was actually applied to, how much got ANY response
  ghost_rate: number // 0-1 fraction: ghosted / (applied+interviewing+offer+rejected+ghosted)
  avg_response_time_days: number | null // null if there's no data to compute it from in the current range
}

/**
 * Recap contract (F8 -- mocked in src/mocks/handlers/recap.ts until
 * BACKEND_TASKS.md's B16 ships). `GET /dashboard/recap?range=week|month`
 * returns this shape. Mirrors backend/app/schemas/dashboard.py's
 * `DashboardRecap`/`RecapHighlight` field-for-field -- unlike
 * `DashboardStats` above, this one is deliberately kept in exact sync
 * with the real backend contract (see docs/decisions/recap-image-approach.md,
 * B15: client-side rendering) so F8 needs zero changes when B16 ships,
 * only a mock-vs-real fetch swap. Recap only supports week/month (no "all").
 */
export type RecapRange = "week" | "month"

export interface RecapHighlight {
  label: string
  value: string
}

export interface DashboardRecap {
  range: RecapRange
  period_label: string // "This week" / "This month"
  period_start: string // ISO date (YYYY-MM-DD)
  period_end: string // ISO date (YYYY-MM-DD)
  total_applications: number
  headline: string
  highlights: RecapHighlight[]
  status_breakdown: StatusBreakdownEntry[]
}
