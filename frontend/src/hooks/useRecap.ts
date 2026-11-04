import { useRangedFetch } from "@/hooks/useRangedFetch"
import type { DashboardRange, DashboardRecap } from "@/types/api"

export interface UseRecapResult {
  recap: DashboardRecap | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetches `GET /dashboard/recap?range=...` for F8's recap dialog. `enabled`
 * lets the dialog skip fetching while closed, so opening it always starts
 * from a fresh loading state rather than showing a stale recap from the
 * last time it was open. Fetch/validation behavior lives in
 * `useRangedFetch`.
 */
export function useRecap(
  range: DashboardRange,
  start: string | null,
  end: string | null,
  enabled: boolean
): UseRecapResult {
  const { data, isLoading, error } = useRangedFetch<DashboardRecap>(
    "/dashboard/recap",
    range,
    start,
    end,
    enabled,
    "Failed to load recap."
  )
  return { recap: data, isLoading, error }
}
