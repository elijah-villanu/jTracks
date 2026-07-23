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
