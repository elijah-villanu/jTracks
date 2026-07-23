import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { applicationFixtures } from "@/mocks/fixtures/applications"
import type { Application, ApplicationStatus } from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

interface ApplicationPatchBody {
  status?: ApplicationStatus
  [key: string]: unknown
}

/**
 * Mock `/applications` endpoints. F1 required `GET /applications`; F3
 * adds `PATCH /applications/{id}` for status changes (and any other
 * field a future milestone starts sending). Mutates
 * `applicationFixtures` in place by id so changes persist across the
 * session without a real backend -- same pattern as
 * src/mocks/handlers/auth.ts's fixture-backed responses.
 */
export const applicationHandlers = [
  http.get(url("/applications"), ({ request }) => {
    const status = new URL(request.url).searchParams.get("status") as ApplicationStatus | null

    const applications = status
      ? applicationFixtures.filter((application) => application.status === status)
      : applicationFixtures

    return HttpResponse.json(applications)
  }),

  http.patch(url("/applications/:id"), async ({ params, request }) => {
    const { id } = params as { id: string }
    const index = applicationFixtures.findIndex((application) => application.id === id)

    if (index === -1) {
      return HttpResponse.json({ message: "Application not found." }, { status: 404 })
    }

    const patch = (await request.json()) as ApplicationPatchBody

    const updated: Application = {
      ...applicationFixtures[index],
      ...patch,
      id: applicationFixtures[index].id,
      updated_at: new Date().toISOString(),
    }

    applicationFixtures[index] = updated

    return HttpResponse.json(updated)
  }),
]
