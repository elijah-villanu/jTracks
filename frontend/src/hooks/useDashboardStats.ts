import { useEffect, useState } from "react"
import { ApiError, apiClient } from "@/lib/api-client"
import { validateCustomRange } from "@/lib/date-range"
import type { DashboardRange, DashboardStats } from "@/types/api"

export interface UseDashboardStatsResult {
  stats: DashboardStats | null
  isLoading: boolean
  error: string | null
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return (err.body as { message?: string } | undefined)?.message ?? fallback
  }
  return fallback
}

/**
 * Fetches `GET /dashboard/stats?range=...` for F7's AnalyticsPage,
 * refetching whenever `range`/`start`/`end` changes -- same loading/error
 * pattern as ApplicationsProvider (src/lib/applications-context.tsx), but
 * kept as a small local hook rather than a shared context/provider since
 * nothing else in the app needs dashboard data yet.
 *
 * F13: `start`/`end` (ISO `YYYY-MM-DD`) are only sent when `range ===
 * "custom"` -- `apiClient`'s `params` drops `undefined` values, so they're
 * simply omitted otherwise. Per PRD_V2.md R6.2, a `custom` range is
 * validated client-side (`lib/date-range.ts`'s `validateCustomRange`)
 * before firing any request -- an invalid or incomplete pair short-circuits
 * without touching the network. The server's `422` is still surfaced as
 * defense in depth if one comes back anyway.
 */
export function useDashboardStats(
  range: DashboardRange,
  start: string | null,
  end: string | null
): UseDashboardStatsResult {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (range === "custom") {
      const validationError = validateCustomRange(start, end)
      if (validationError) {
        setStats(null)
        setError(validationError)
        setIsLoading(false)
        return
      }
      if (!start || !end) {
        // Incomplete pair -- not ready to submit yet, but not an error either.
        setStats(null)
        setError(null)
        setIsLoading(false)
        return
      }
    }

    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const data = await apiClient.get<DashboardStats>("/dashboard/stats", {
          params: {
            range,
            start: range === "custom" ? (start ?? undefined) : undefined,
            end: range === "custom" ? (end ?? undefined) : undefined,
          },
        })
        if (!cancelled) {
          setStats(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(extractErrorMessage(err, "Failed to load dashboard stats."))
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
  }, [range, start, end])

  return { stats, isLoading, error }
}
