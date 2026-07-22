import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import type { Application } from "@/types/api"

interface UseApplicationsResult {
  applications: Application[]
  isLoading: boolean
  error: string | null
}

/**
 * Fetches the seeded application list from `GET /applications`
 * (mocked via MSW in dev -- see src/mocks/handlers.ts). Intentionally
 * minimal for F1; later milestones (F3) will replace/extend this with
 * whatever data-fetching approach the board needs (filters, caching,
 * optimistic updates on PATCH, etc).
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

  return { applications, isLoading, error }
}
