import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { FAKE_ACCESS_TOKEN, USER_FIXTURE, USER_FIXTURE_PASSWORD } from "@/mocks/fixtures/user"
import type { AuthResponse } from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

interface EmailPasswordBody {
  email?: string
  password?: string
}

const authResponse: AuthResponse = {
  access_token: FAKE_ACCESS_TOKEN,
  user: USER_FIXTURE,
}

/**
 * Mock auth endpoints for F2. There's no real backend yet (B2/B3), so
 * this is the contract that the real API needs to match:
 * `{ access_token: string, user: User }` on success.
 *
 * Any email/password works for signup. Login only succeeds against the
 * fixture account (see src/mocks/fixtures/user.ts) so a login-failure
 * UI state is exercised too.
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

    return HttpResponse.json<AuthResponse>({
      access_token: FAKE_ACCESS_TOKEN,
      user: { ...USER_FIXTURE, email: body.email },
    })
  }),

  http.post(url("/auth/login"), async ({ request }) => {
    const body = (await request.json()) as EmailPasswordBody

    if (body.email === USER_FIXTURE.email && body.password === USER_FIXTURE_PASSWORD) {
      return HttpResponse.json<AuthResponse>(authResponse)
    }

    return HttpResponse.json({ message: "Invalid email or password." }, { status: 401 })
  }),

  http.post(url("/auth/oauth/google"), async () => {
    // Mock only -- real Google Identity Services integration lands
    // once B3 ships. Unconditionally "succeeds" as the fixture user.
    return HttpResponse.json<AuthResponse>(authResponse)
  }),

  http.get(url("/auth/me"), ({ request }) => {
    const authHeader = request.headers.get("Authorization")

    if (!authHeader?.startsWith("Bearer ") || !authHeader.slice("Bearer ".length)) {
      return HttpResponse.json({ message: "Unauthorized." }, { status: 401 })
    }

    return HttpResponse.json(USER_FIXTURE)
  }),
]
