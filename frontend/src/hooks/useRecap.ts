import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import type { DashboardRecap, RecapRange } from "@/types/api"

export interface UseRecapResult {
  recap: DashboardRecap | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetches `GET /dashboard/recap?range=...` for F8's recap dialog,
 * refetching whenever `range` changes -- same loading/error pattern as
 * useDashboardStats (F7). `enabled` lets the dialog skip fetching while
 * closed, so opening it always starts from a fresh loading state rather
 * than showing a stale recap from the last time it was open.
 */
export function useRecap(range: RecapRange, enabled: boolean): UseRecapResult {
  const [recap, setRecap] = useState<DashboardRecap | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setRecap(null)
      return
    }

    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const data = await apiClient.get<DashboardRecap>("/dashboard/recap", { params: { range } })
        if (!cancelled) {
          setRecap(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load recap.")
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
  }, [range, enabled])

  return { recap, isLoading, error }
}
