import { HttpResponse } from "msw"
import { EXPIRED_ACCESS_TOKEN } from "@/mocks/fixtures/user"

/**
 * Shared bearer-token check for protected mock handlers (F20). Every
 * protected handler already did the "missing/malformed `Authorization`
 * header -> 401" check inline; this centralizes that plus the new
 * `EXPIRED_ACCESS_TOKEN` sentinel check (see `src/mocks/fixtures/user.ts`)
 * so a test can force a `401` deterministically without a real token-expiry
 * clock, exercising F20's refresh-on-401 flow.
 *
 * Returns an `HttpResponse` (401) if the request should be rejected, or
 * `null` if it's authorized and the handler should proceed.
 */
export function requireAuth(request: Request): HttpResponse<{ message: string }> | null {
  const authHeader = request.headers.get("Authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : ""

  if (!token || token === EXPIRED_ACCESS_TOKEN) {
    return HttpResponse.json({ message: "Unauthorized." }, { status: 401 })
  }

  return null
}
