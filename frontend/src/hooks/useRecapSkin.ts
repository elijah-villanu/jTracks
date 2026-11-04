import { useStoredState } from "@/hooks/useStoredState"
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

export function useRecapSkin(): [RecapSkinId, (next: RecapSkinId) => void] {
  // `isRecapSkinId` is what keeps a stale/junk stored value from rendering
  // an undefined component.
  return useStoredState(RECAP_SKIN_STORAGE_KEY, isRecapSkinId, () => DEFAULT_RECAP_SKIN_ID)
}
