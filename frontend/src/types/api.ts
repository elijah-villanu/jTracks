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
  google_id: string | null
  ghost_days_default: number
}

/**
 * Auth contract, mirroring the real backend's `TokenResponse`
 * (backend/API_SPEC_V1.md #6.3). Returned by `/auth/signup`,
 * `/auth/login`, and `/auth/oauth/google`. Deliberately has **no** `user`
 * field -- callers must follow up with `GET /auth/me` for the profile
 * (see `AuthProvider.applyAuthResponse` in src/lib/auth-context.tsx).
 */
export interface AuthResponse {
  access_token: string
  token_type: string
}

/**
 * Autofill contract, mirroring the real backend's `AutofillParsed` /
 * `AutofillUnsupported` / `AutofillFailed` union (backend/API_SPEC_V1.md
 * #3.4/#6.12-6.14) field-for-field. `POST /applications/autofill { url }`
 * always returns `200` and discriminates on `status`, never an HTTP
 * error status -- a parse failure, an unsupported domain, and a thrown
 * network error are three different things a client must handle, but
 * only the last one is an actual `try`/`catch` case. Per PRD.md, all
 * three (plus any thrown network error) must land the user on the same
 * manual review/edit form -- see AutofillResponse's consumer in
 * src/components/applications/autofill-dialog.tsx.
 */
export interface AutofillParsedFields {
  company: string | null
  title: string | null
  location: string | null
  salary: string | null
  date_posted: string | null
  job_url: string
  suggested_status: ApplicationStatus // always "applied"
}

export interface AutofillParsed {
  status: "parsed"
  source: "greenhouse" | "workday"
  fields: AutofillParsedFields
}

export interface AutofillUnsupported {
  status: "unsupported"
  url: string
}

export interface AutofillFailed {
  status: "failed"
  url: string
  reason: string | null
}

export type AutofillResponse = AutofillParsed | AutofillUnsupported | AutofillFailed

export function isAutofillSuccess(response: AutofillResponse): response is AutofillParsed {
  return response.status === "parsed"
}

export function isAutofillUnsupported(response: AutofillResponse): response is AutofillUnsupported {
  return response.status === "unsupported"
}

export function isAutofillFailed(response: AutofillResponse): response is AutofillFailed {
  return response.status === "failed"
}

/**
 * Dashboard stats contract, mirroring the real backend's `DashboardStats`
 * (backend/API_SPEC_V1.md #6.17) field-for-field. `GET /dashboard/stats?range=...`
 * returns this shape. Per the real backend, both dashboard endpoints only
 * consider *submitted* applications (a non-null `date_applied`) -- `total`
 * excludes `saved` rows entirely, unlike this file's earlier
 * `total_applications` (which counted every application including
 * `saved`). See src/mocks/handlers/dashboard.ts for how the mock
 * approximates this without real status-change history.
 */
export type DashboardRange = "week" | "month" | "all"

export interface StatusBreakdownEntry {
  status: ApplicationStatus // only applied/interviewing/offer/rejected/ghosted will appear
  count: number
  percentage: number // 0-100, share of `total`, 1 decimal
}

export interface ApplicationsOverTimePoint {
  period: string // ISO date (YYYY-MM-DD) for daily buckets, "YYYY-MM" for monthly -- not named `date`
  count: number
}

export type TimeSeriesGranularity = "day" | "week" | "month"

export interface DashboardStats {
  range: DashboardRange
  total: number // submitted applications in the window (excludes `saved`) -- not named `total_applications`
  status_breakdown: StatusBreakdownEntry[]
  applications_over_time: ApplicationsOverTimePoint[]
  time_series_granularity: TimeSeriesGranularity
  response_rate: number // percentage 0-100: (interviewing+offer+rejected) / total -- a rejection counts as a response
  ghost_rate: number // percentage 0-100: ghosted / total
  rejection_rate: number // percentage 0-100: rejected / total
  avg_time_to_response_days: number | null // null if there's no data to compute it from in the current range
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
