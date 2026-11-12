import { isRecapDesign, type RecapDesign } from "@/components/dashboard/chart-summaries"
import { useStoredState } from "@/hooks/useStoredState"

/**
 * Which recap design the viewer last picked (the dialog opens on it, and
 * Settings > Appearance sets it). A display preference, so localStorage. The
 * key predates the current designs; an old stored value falls back to "ink".
 */
export const RECAP_SKIN_STORAGE_KEY = "jtracks_recap_skin"

export function useRecapSkin(): [RecapDesign, (next: RecapDesign) => void] {
  return useStoredState(RECAP_SKIN_STORAGE_KEY, isRecapDesign, () => "ink")
}
