import { useEffect, useState } from "react"
import { ApiError, apiClient } from "@/lib/api-client"
import { validateCustomRange } from "@/lib/date-range"
import type { DashboardRange, DashboardRecap } from "@/types/api"

export interface UseRecapResult {
  recap: DashboardRecap | null
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
 * Fetches `GET /dashboard/recap?range=...` for F8's recap dialog,
 * refetching whenever `range`/`start`/`end`/`enabled` changes -- same
 * loading/error pattern as useDashboardStats (F7). `enabled` lets the
 * dialog skip fetching while closed, so opening it always starts from a
 * fresh loading state rather than showing a stale recap from the last
 * time it was open.
 *
 * F13: `start`/`end` (ISO `YYYY-MM-DD`) are only sent when `range ===
 * "custom"`, validated client-side first (`lib/date-range.ts`'s
 * `validateCustomRange`) -- same short-circuit-before-fetch behavior as
 * useDashboardStats. The server's `422` is still surfaced as defense in
 * depth if one comes back anyway.
 */
export function useRecap(
  range: DashboardRange,
  start: string | null,
  end: string | null,
  enabled: boolean
): UseRecapResult {
  const [recap, setRecap] = useState<DashboardRecap | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setRecap(null)
      return
    }

    if (range === "custom") {
      const validationError = validateCustomRange(start, end)
      if (validationError) {
        setRecap(null)
        setError(validationError)
        setIsLoading(false)
        return
      }
      if (!start || !end) {
        setRecap(null)
        setError(null)
        setIsLoading(false)
        return
      }
    }

    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const data = await apiClient.get<DashboardRecap>("/dashboard/recap", {
          params: {
            range,
            start: range === "custom" ? (start ?? undefined) : undefined,
            end: range === "custom" ? (end ?? undefined) : undefined,
          },
        })
        if (!cancelled) {
          setRecap(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(extractErrorMessage(err, "Failed to load recap."))
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
  }, [range, start, end, enabled])

  return { recap, isLoading, error }
}
