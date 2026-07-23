import { useCallback, useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import type { Application } from "@/types/api"

interface UseApplicationsResult {
  applications: Application[]
  isLoading: boolean
  error: string | null
  /**
   * Sends `PATCH /applications/{id}` with `patch` and merges the
   * response into local state by id -- no refetch of the whole list.
   * Rejects (throwing whatever `apiClient.patch` throws, typically an
   * `ApiError`) on failure so callers can surface their own error UI.
   */
  updateApplication: (id: string, patch: Partial<Application>) => Promise<Application>
}

/**
 * Fetches the seeded application list from `GET /applications`
 * (mocked via MSW in dev -- see src/mocks/handlers.ts) and exposes
 * `updateApplication` for in-place status changes (F3's per-row status
 * control) without a full reload.
 */
export function useApplications(): UseApplicationsResult {
  const [applications, setApplications] = useState<Application[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setIsLoading(true)
        const data = await apiClient.get<Application[]>("/applications")
        if (!cancelled) {
          setApplications(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load applications.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const updateApplication = useCallback(async (id: string, patch: Partial<Application>) => {
    const updated = await apiClient.patch<Application>(`/applications/${id}`, patch)
    setApplications((prev) => prev.map((application) => (application.id === id ? updated : application)))
    return updated
  }, [])

  return { applications, isLoading, error, updateApplication }
}
