import { useCallback, useState } from "react"

/**
 * A string display preference persisted in `localStorage` (theme, recap
 * skin, view mode). Never use this for auth material -- see token-store.ts.
 *
 * Guarded: `localStorage` throws outright in some privacy modes (and is
 * absent in a non-browser render), and a stored value can be anything --
 * a stale id or hand-edited junk -- so `isValid` is what makes the fallback
 * safe. Persisting is best-effort: a failed write still applies the choice
 * for this session, it just won't survive a reload.
 */
export function useStoredState<T extends string>(
  key: string,
  isValid: (value: string | null) => value is T,
  fallback: () => T
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return isValid(stored) ? stored : fallback()
    } catch {
      return fallback()
    }
  })

  const setAndStore = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, next)
      } catch {
        // Best-effort; see above.
      }
    },
    [key]
  )

  return [value, setAndStore]
}
