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
  google_id: null,
  ghost_days_default: 14,
}

/** Password accepted for the fixture account by the mock `/auth/login` handler. */
export const USER_FIXTURE_PASSWORD = "password123"

/** Fake JWT-shaped token issued by the mock auth handlers. */
export const FAKE_ACCESS_TOKEN = "mock-jwt.demo-user.token"

/**
 * Sentinel bearer token every protected mock handler (see
 * `src/mocks/handlers/require-auth.ts`) treats as expired, returning `401`
 * regardless of any other request state. There's no real token-expiry
 * clock in a mock, so this lets F20's refresh-on-401 flow be exercised
 * deterministically: call `setAccessToken(EXPIRED_ACCESS_TOKEN)` and any
 * subsequent authenticated request will `401`, triggering the single-flight
 * `POST /auth/refresh` attempt.
 */
export const EXPIRED_ACCESS_TOKEN = "expired.demo-user.token"

/**
 * Fresh token minted by the mock `POST /auth/refresh` handler on success --
 * deliberately distinct from `FAKE_ACCESS_TOKEN` so a test/manual check can
 * confirm the token store was actually updated post-refresh, not just left
 * alone.
 */
export const REFRESHED_ACCESS_TOKEN = "refreshed-jwt.demo-user.token"
