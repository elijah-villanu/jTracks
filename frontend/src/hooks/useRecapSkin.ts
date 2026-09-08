import { useCallback, useState } from "react"
import { DEFAULT_RECAP_SKIN_ID, isRecapSkinId } from "@/components/dashboard/recap-skins"
import type { RecapSkinId } from "@/components/dashboard/recap-skins"

/**
 * F48: which recap design the viewer last picked.
 *
 * `localStorage`, not the user record, for the same reason F25's theme
 * key uses it (see lib/theme-context.tsx): this is a display preference
 * with no auth or authorization meaning, nothing about it is worth a
 * round trip or a backend contract change, and the worst case for a
 * corrupted/absent value is that the dialog opens on the default skin.
 * It is also read *before* any fetch resolves, so a server-persisted
 * value would arrive too late to avoid a visible swap anyway.
 */
export const RECAP_SKIN_STORAGE_KEY = "jtracks_recap_skin"

function readStoredSkin(): RecapSkinId {
  // Guarded: `localStorage` throws outright in some privacy modes, and
  // a stored value can be anything (a stale id from a removed skin, or
  // hand-edited junk) -- `isRecapSkinId` is what makes the fallback to
  // the default safe rather than rendering an undefined component.
  try {
    const stored = window.localStorage.getItem(RECAP_SKIN_STORAGE_KEY)
    return isRecapSkinId(stored) ? stored : DEFAULT_RECAP_SKIN_ID
  } catch {
    return DEFAULT_RECAP_SKIN_ID
  }
}

export function useRecapSkin(): [RecapSkinId, (next: RecapSkinId) => void] {
  const [skinId, setSkinIdState] = useState<RecapSkinId>(readStoredSkin)

  const setSkinId = useCallback((next: RecapSkinId) => {
    setSkinIdState(next)
    try {
      window.localStorage.setItem(RECAP_SKIN_STORAGE_KEY, next)
    } catch {
      // Persisting is best-effort: the selection still applies for this
      // session, it just won't survive a reload.
    }
  }, [])

  return [skinId, setSkinId]
}
