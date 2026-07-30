import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { USER_FIXTURE } from "@/mocks/fixtures/user"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

interface SettingsBody {
  ghost_days_default?: unknown
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

/**
 * Mock `/settings` endpoints for F6. There's no real backend yet (see
 * BACKEND_TASKS.md), so this is the contract the real API needs to
 * match: `{ ghost_days_default: number }` on both GET and PATCH
 * success. Mutates the shared `USER_FIXTURE` in place (see
 * src/mocks/fixtures/user.ts) so `GET /auth/me` and `GET /settings`
 * never disagree with each other.
 */
export const settingsHandlers = [
  http.get(url("/settings"), ({ request }) => {
    const authHeader = request.headers.get("Authorization")

    if (!authHeader?.startsWith("Bearer ") || !authHeader.slice("Bearer ".length)) {
      return HttpResponse.json({ message: "Unauthorized." }, { status: 401 })
    }

    return HttpResponse.json({ ghost_days_default: USER_FIXTURE.ghost_days_default })
  }),

  http.patch(url("/settings"), async ({ request }) => {
    const authHeader = request.headers.get("Authorization")

    if (!authHeader?.startsWith("Bearer ") || !authHeader.slice("Bearer ".length)) {
      return HttpResponse.json({ message: "Unauthorized." }, { status: 401 })
    }

    const body = (await request.json()) as SettingsBody

    if (!isPositiveInteger(body.ghost_days_default)) {
      return HttpResponse.json(
        { message: "ghost_days_default must be a positive integer." },
        { status: 400 }
      )
    }

    USER_FIXTURE.ghost_days_default = body.ghost_days_default

    return HttpResponse.json({ ghost_days_default: USER_FIXTURE.ghost_days_default })
  }),
]
