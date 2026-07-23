import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import type { DashboardRange, DashboardStats } from "@/types/api"

export interface UseDashboardStatsResult {
  stats: DashboardStats | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetches `GET /dashboard/stats?range=...` for F7's AnalyticsPage,
 * refetching whenever `range` changes -- same loading/error pattern as
 * ApplicationsProvider (src/lib/applications-context.tsx), but kept as
 * a small local hook rather than a shared context/provider since
 * nothing else in the app needs dashboard data yet.
 */
export function useDashboardStats(range: DashboardRange): UseDashboardStatsResult {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const data = await apiClient.get<DashboardStats>("/dashboard/stats", { params: { range } })
        if (!cancelled) {
          setStats(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard stats.")
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
  }, [range])

  return { stats, isLoading, error }
}
