import type { User } from "@/types/api"

/**
 * The single mock account F2 authenticates against. Uses the same
 * `user_id` that owns every seeded application in
 * `src/mocks/fixtures/applications.ts` so a logged-in session sees
 * those applications as its own.
 */
export const USER_FIXTURE: User = {
  id: "8f14e45f-ceea-467e-99d0-1b5a35a0d9c3",
  email: "demo@jtracks.dev",
  ghost_days_default: 14,
  created_at: "2026-01-05T00:00:00Z",
}

/** Password accepted for the fixture account by the mock `/auth/login` handler. */
export const USER_FIXTURE_PASSWORD = "password123"

/** Fake JWT-shaped token issued by the mock auth handlers. */
export const FAKE_ACCESS_TOKEN = "mock-jwt.demo-user.token"
