import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import {
  FAKE_ACCESS_TOKEN,
  REFRESHED_ACCESS_TOKEN,
  USER_FIXTURE,
  USER_FIXTURE_PASSWORD,
} from "@/mocks/fixtures/user"
import { requireAuth } from "@/mocks/handlers/require-auth"
import type { AuthResponse } from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

interface EmailPasswordBody {
  email?: string
  password?: string
}

const authResponse: AuthResponse = {
  access_token: FAKE_ACCESS_TOKEN,
  token_type: "bearer",
}

/**
 * Name/value of the mock httpOnly refresh cookie (F21/R7.6). The real
 * backend's cookie is `HttpOnly; Secure; SameSite=None; Path=/auth`
 * (B25) -- but `SameSite=None` *requires* `Secure`, which requires
 * HTTPS, and this dev server runs on plain `http://localhost`. Using the
 * real backend's exact attributes here would make the browser silently
 * refuse to set the cookie at all, breaking the mock entirely. So the
 * mock deliberately uses `Path=/; SameSite=Lax` instead (no `Secure`,
 * no cross-site `SameSite=None`) so it actually gets stored and resent
 * by the browser over plain HTTP -- this is a mock-only deviation, not a
 * statement about the real backend's contract.
 */
const REFRESH_COOKIE_NAME = "jtracks_refresh"
const SET_REFRESH_COOKIE = `${REFRESH_COOKIE_NAME}=mock-refresh-value; Path=/; SameSite=Lax`
const CLEAR_REFRESH_COOKIE = `${REFRESH_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`

/** `true` when the request's `Cookie` header carries the mock refresh cookie. */
function hasRefreshCookie(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") ?? ""
  return cookieHeader.includes(`${REFRESH_COOKIE_NAME}=`)
}

/**
 * Mock auth endpoints for F2, mirroring the real backend's
 * `TokenResponse` contract (backend/API_SPEC_V1.md #6.3):
 * `{ access_token: string, token_type: string }` on success -- no `user`
 * field. Callers hydrate `user` with a follow-up `GET /auth/me` (see
 * `AuthProvider.applyAuthResponse` in src/lib/auth-context.tsx).
 *
 * Any email/password works for signup. Login only succeeds against the
 * fixture account (see src/mocks/fixtures/user.ts) so a login-failure
 * UI state is exercised too. `GET /auth/me` always returns the one
 * fixture user regardless of the signup email supplied above, since
 * this mock only ever tracks a single account.
 *
 * F21: login/signup/oauth all also set the mock `jtracks_refresh` cookie
 * (see `SET_REFRESH_COOKIE` above) so `POST /auth/refresh` and a
 * boot-time silent-refresh (`AuthProvider.hydrate`) can be exercised
 * against a genuine browser-stored cookie, not just an always-succeeds
 * stub.
 */
export const authHandlers = [
  http.post(url("/auth/signup"), async ({ request }) => {
    const body = (await request.json()) as EmailPasswordBody

    if (!body.email || !body.password) {
      return HttpResponse.json(
        { message: "Email and password are required." },
        { status: 400 }
      )
    }

    return HttpResponse.json<AuthResponse>(authResponse, {
      headers: { "Set-Cookie": SET_REFRESH_COOKIE },
    })
  }),

  http.post(url("/auth/login"), async ({ request }) => {
    const body = (await request.json()) as EmailPasswordBody

    if (body.email === USER_FIXTURE.email && body.password === USER_FIXTURE_PASSWORD) {
      return HttpResponse.json<AuthResponse>(authResponse, {
        headers: { "Set-Cookie": SET_REFRESH_COOKIE },
      })
    }

    return HttpResponse.json({ message: "Invalid email or password." }, { status: 401 })
  }),

  http.post(url("/auth/oauth/google"), async () => {
    // Mock only -- real Google Identity Services integration lands
    // once B3 ships. Unconditionally "succeeds" as the fixture user.
    return HttpResponse.json<AuthResponse>(authResponse, {
      headers: { "Set-Cookie": SET_REFRESH_COOKIE },
    })
  }),

  /**
   * Mock `POST /auth/logout` for F21/R7.4: requires the same
   * `X-Refresh-Request: 1` CSRF-defense header as `/auth/refresh` (B25 --
   * logout is the other cookie-reading endpoint), mirroring the real
   * backend's `403` on a missing header. Otherwise always `204`, even with
   * no or an invalid refresh cookie present (idempotent), and clears the
   * mock cookie so a subsequent `/auth/refresh` genuinely fails afterward --
   * this is what makes "log out then reload lands on login" testable
   * end-to-end rather than just asserted by inspection of in-memory state.
   */
  http.post(url("/auth/logout"), ({ request }) => {
    if (request.headers.get("X-Refresh-Request") !== "1") {
      return HttpResponse.json({ message: "Missing X-Refresh-Request header." }, { status: 403 })
    }

    return new HttpResponse(null, {
      status: 204,
      headers: { "Set-Cookie": CLEAR_REFRESH_COOKIE },
    })
  }),

  http.get(url("/auth/me"), ({ request }) => {
    const authError = requireAuth(request)
    if (authError) {
      return authError
    }

    return HttpResponse.json(USER_FIXTURE)
  }),

  /**
   * Mock `POST /auth/refresh` for F20/F21/R7.6, mirroring B25's real
   * contract: requires the `X-Refresh-Request: 1` CSRF-defense header
   * (missing -> `403`), requires the mock `jtracks_refresh` cookie to
   * actually be present (missing -> `401`, F21 -- this is what makes a
   * post-logout or never-logged-in refresh attempt genuinely fail rather
   * than always succeeding), and on success returns a fresh
   * `AuthResponse`-shaped `{ access_token, token_type }` -- deliberately a
   * *different* token (`REFRESHED_ACCESS_TOKEN`) than `FAKE_ACCESS_TOKEN`
   * so a test can confirm the token store actually got updated
   * post-refresh.
   *
   * `forceRefreshFailure` (toggled via `setRefreshFailureForTesting`,
   * below) lets a test deterministically simulate "the refresh cookie
   * itself is missing/expired/revoked" without needing to fabricate real
   * cookie state -- kept alongside the real cookie check above since some
   * tests want to force failure even when a valid cookie is present.
   */
  http.post(url("/auth/refresh"), ({ request }) => {
    if (request.headers.get("X-Refresh-Request") !== "1") {
      return HttpResponse.json({ message: "Missing X-Refresh-Request header." }, { status: 403 })
    }

    if (forceRefreshFailure) {
      return HttpResponse.json({ message: "Refresh token invalid or expired." }, { status: 401 })
    }

    if (!hasRefreshCookie(request)) {
      return HttpResponse.json({ message: "No refresh token cookie present." }, { status: 401 })
    }

    return HttpResponse.json<AuthResponse>({
      access_token: REFRESHED_ACCESS_TOKEN,
      token_type: "bearer",
    })
  }),
]

/**
 * Test-only escape hatch: when `true`, the mock `/auth/refresh` handler
 * above always fails (`401`), simulating a missing/expired/revoked refresh
 * cookie deterministically -- there's no real cookie state to fabricate in
 * a mock, so this is the cleanest way to exercise F20's "refresh itself
 * fails" path. Defaults to `false`; tests should reset it when done.
 */
let forceRefreshFailure = false

export function setRefreshFailureForTesting(shouldFail: boolean): void {
  forceRefreshFailure = shouldFail
}
