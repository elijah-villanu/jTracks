import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { applicationFixtures } from "@/mocks/fixtures/applications"
import type { ApplicationStatus } from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

/**
 * F1 only requires `GET /applications`. The remaining endpoints from
 * the shared API surface (BACKEND_TASKS.md) are stubbed as comments
 * below so future milestones (F2+) have an obvious place to add
 * handlers without needing to rediscover the base URL wiring.
 */
export const handlers = [
  http.get(url("/applications"), ({ request }) => {
    const status = new URL(request.url).searchParams.get("status") as ApplicationStatus | null

    const applications = status
      ? applicationFixtures.filter((application) => application.status === status)
      : applicationFixtures

    return HttpResponse.json(applications)
  }),

  // POST   /auth/signup
  // POST   /auth/login
  // POST   /auth/oauth/google
  // GET    /auth/me
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
