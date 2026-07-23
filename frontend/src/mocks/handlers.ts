import { authHandlers } from "@/mocks/handlers/auth"
import { applicationHandlers } from "@/mocks/handlers/applications"
import { autofillHandlers } from "@/mocks/handlers/autofill"
import { settingsHandlers } from "@/mocks/handlers/settings"

/**
 * F1 required `GET /applications`; F2 adds the auth handlers (see
 * src/mocks/handlers/auth.ts); F3 adds the rest of the `/applications`
 * surface (see src/mocks/handlers/applications.ts); F5 adds the mocked
 * autofill parser (see src/mocks/handlers/autofill.ts); F6 adds the
 * `/settings` handlers (see src/mocks/handlers/settings.ts). The
 * remaining endpoints from the shared API surface (BACKEND_TASKS.md)
 * are stubbed as comments below so future milestones have an obvious
 * place to add handlers without needing to rediscover the base URL
 * wiring.
 */
export const handlers = [
  ...authHandlers,
  ...applicationHandlers,
  ...autofillHandlers,
  ...settingsHandlers,

  // POST   /applications
  // GET    /applications/{id}
  // DELETE /applications/{id}
  // GET    /dashboard/stats?range=week|month|all
  // GET    /dashboard/recap?range=week|month
]
