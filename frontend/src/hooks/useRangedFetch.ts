import { useEffect, useState } from "react"
import { apiClient, apiErrorMessage } from "@/lib/api-client"
import { validateCustomRange } from "@/lib/date-range"
import type { DashboardRange } from "@/types/api"

export interface RangedFetchResult<T> {
  data: T | null
  isLoading: boolean
  error: string | null
}

/**
 * Shared body of `useDashboardStats` (F7) and `useRecap` (F8): fetches
 * `path?range=...`, refetching whenever `range`/`start`/`end`/`enabled`
 * changes.
 *
 * F13: `start`/`end` (ISO `YYYY-MM-DD`) are only sent when `range ===
 * "custom"` -- `apiClient`'s `params` drops `undefined` values, so they're
 * simply omitted otherwise. Per PRD_V2.md R6.2, a `custom` range is
 * validated client-side (`lib/date-range.ts`'s `validateCustomRange`)
 * before firing any request -- an invalid or incomplete pair short-circuits
 * without touching the network. The server's `422` is still surfaced as
 * defense in depth if one comes back anyway.
 *
 * `enabled: false` clears `data` and skips the fetch (the recap dialog uses
 * it so reopening always starts from a fresh loading state).
 */
export function useRangedFetch<T>(
  path: string,
  range: DashboardRange,
  start: string | null,
  end: string | null,
  enabled: boolean,
  errorFallback: string
): RangedFetchResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setData(null)
      return
    }

    if (range === "custom") {
      // An incomplete pair is not ready to submit yet, but not an error either.
      const validationError = validateCustomRange(start, end)
      if (validationError || !start || !end) {
        setData(null)
        setError(validationError)
        setIsLoading(false)
        return
      }
    }

    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const result = await apiClient.get<T>(path, {
          params: {
            range,
            start: range === "custom" ? (start ?? undefined) : undefined,
            end: range === "custom" ? (end ?? undefined) : undefined,
          },
        })
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorMessage(err, errorFallback))
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
  }, [path, range, start, end, enabled, errorFallback])

  return { data, isLoading, error }
}
