import { useRangedFetch } from "@/hooks/useRangedFetch"
import type { DashboardRange, DashboardStats } from "@/types/api"

export interface UseDashboardStatsResult {
  stats: DashboardStats | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetches `GET /dashboard/stats?range=...` for F7's AnalyticsPage -- kept
 * as a small local hook rather than a shared context/provider since
 * nothing else in the app needs dashboard data yet. Fetch/validation
 * behavior lives in `useRangedFetch`.
 */
export function useDashboardStats(
  range: DashboardRange,
  start: string | null,
  end: string | null,
  /** False skips the fetch (Analytics' prior-period call, for "all time"). */
  enabled = true
): UseDashboardStatsResult {
  const { data, isLoading, error } = useRangedFetch<DashboardStats>(
    "/dashboard/stats",
    range,
    start,
    end,
    enabled,
    "Failed to load dashboard stats."
  )
  return { stats: data, isLoading, error }
}
