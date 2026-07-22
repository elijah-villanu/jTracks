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
