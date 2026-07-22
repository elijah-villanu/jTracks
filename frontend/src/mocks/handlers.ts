import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { applicationFixtures } from "@/mocks/fixtures/applications"
import { authHandlers } from "@/mocks/handlers/auth"
import type { ApplicationStatus } from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

/**
 * F1 required `GET /applications`; F2 adds the auth handlers (see
 * src/mocks/handlers/auth.ts). The remaining endpoints from the shared
 * API surface (BACKEND_TASKS.md) are stubbed as comments below so
 * future milestones (F3+) have an obvious place to add handlers
 * without needing to rediscover the base URL wiring.
 */
export const handlers = [
  ...authHandlers,

  http.get(url("/applications"), ({ request }) => {
    const status = new URL(request.url).searchParams.get("status") as ApplicationStatus | null

    const applications = status
      ? applicationFixtures.filter((application) => application.status === status)
      : applicationFixtures

    return HttpResponse.json(applications)
  }),

  // POST   /applications
  // GET    /applications/{id}
  // PATCH  /applications/{id}
  // DELETE /applications/{id}
  // POST   /applications/autofill
  // GET    /settings
  // PATCH  /settings
  // GET    /dashboard/stats?range=week|month|all
  // GET    /dashboard/recap?range=week|month
]
