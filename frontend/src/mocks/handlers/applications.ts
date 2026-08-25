import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import { applicationFixtures } from "@/mocks/fixtures/applications"
import { requireAuth } from "@/mocks/handlers/require-auth"
import type { Application, ApplicationStatus } from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

/** The fixed owner every mock-created application is assigned to -- must match `USER_ID` in applications.ts's fixtures. */
const USER_ID = "8f14e45f-ceea-467e-99d0-1b5a35a0d9c3"

interface ApplicationPatchBody {
  status?: ApplicationStatus
  [key: string]: unknown
}

interface ApplicationCreateBody {
  company?: string
  title?: string
  status?: ApplicationStatus
  [key: string]: unknown
}

/**
 * Mock `/applications` endpoints. F1 required `GET /applications`; F3
 * added `PATCH /applications/{id}` for status changes; F4 adds
 * `POST /applications` (manual create) and `DELETE /applications/{id}`.
 * Mutates `applicationFixtures` in place so changes persist across the
 * session without a real backend -- same pattern as
 * src/mocks/handlers/auth.ts's fixture-backed responses.
 */
export const applicationHandlers = [
  http.get(url("/applications"), ({ request }) => {
    const authError = requireAuth(request)
    if (authError) {
      return authError
    }

    const status = new URL(request.url).searchParams.get("status") as ApplicationStatus | null

    const applications = status
      ? applicationFixtures.filter((application) => application.status === status)
      : applicationFixtures

    return HttpResponse.json(applications)
  }),

  http.post(url("/applications"), async ({ request }) => {
    const authError = requireAuth(request)
    if (authError) {
      return authError
    }

    const body = (await request.json()) as ApplicationCreateBody

    if (!body.company || !body.title || !body.status) {
      return HttpResponse.json(
        { message: "company, title, and status are required." },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    const created: Application = {
      id: crypto.randomUUID(),
      user_id: USER_ID,
      company: body.company,
      title: body.title,
      status: body.status,
      job_url: (body.job_url as string | null | undefined) ?? null,
      location: (body.location as string | null | undefined) ?? null,
      salary: (body.salary as string | null | undefined) ?? null,
      date_posted: (body.date_posted as string | null | undefined) ?? null,
      date_saved: (body.date_saved as string | null | undefined) ?? null,
      date_applied: (body.date_applied as string | null | undefined) ?? null,
      ghost_days_override: (body.ghost_days_override as number | null | undefined) ?? null,
      notes: (body.notes as string | null | undefined) ?? null,
      created_at: now,
      updated_at: now,
    }

    applicationFixtures.push(created)

    return HttpResponse.json(created, { status: 201 })
  }),

  http.patch(url("/applications/:id"), async ({ params, request }) => {
    const authError = requireAuth(request)
    if (authError) {
      return authError
    }

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

  http.delete(url("/applications/:id"), ({ params, request }) => {
    const authError = requireAuth(request)
    if (authError) {
      return authError
    }

    const { id } = params as { id: string }
    const index = applicationFixtures.findIndex((application) => application.id === id)

    if (index === -1) {
      return HttpResponse.json({ message: "Application not found." }, { status: 404 })
    }

    applicationFixtures.splice(index, 1)

    return new HttpResponse(null, { status: 204 })
  }),
]
