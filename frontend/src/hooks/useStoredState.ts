import { useCallback, useEffect, useState } from "react"

/** Tells every other `useStoredState` on the same key that it changed (settings and the open page share these). */
const CHANGE_EVENT = "stored-state-change"

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

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: string }>).detail
      if (detail.key === key && isValid(detail.value)) setValue(detail.value)
    }
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [key, isValid])

  const setAndStore = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, next)
      } catch {
        // Best-effort; see above.
      }
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key, value: next } }))
    },
    [key]
  )

  return [value, setAndStore]
}
