import { BeliSkin } from "@/components/dashboard/recap-skins/beli-skin"
import { DuolingoSkin } from "@/components/dashboard/recap-skins/duolingo-skin"
import { StravaSkin } from "@/components/dashboard/recap-skins/strava-skin"
import type { RecapSkin, RecapSkinId } from "@/components/dashboard/recap-skins/types"

export type { RecapSkin, RecapSkinId, RecapSkinProps } from "@/components/dashboard/recap-skins/types"

/**
 * F48: the recap skin registry -- the single ordered list every consumer
 * reads. The carousel's slide order, the pagination dots, the accessible
 * "design N of M" names, and the per-skin reference PNGs in
 * `frontend/reference/` are all derived from this array, so adding a
 * fourth skin means adding one entry here and one baseline export, not
 * touching the dialog.
 *
 * Order is meaningful: `RECAP_SKINS[0]` is the default for a user who has
 * never picked one (and the fallback when the stored `jtracks_recap_skin`
 * value is missing or unrecognized). Strava leads because it is the
 * design that already shipped -- an existing user opening the dialog
 * after this change sees what they saw before, now as one option among
 * three.
 */
export const RECAP_SKINS: readonly RecapSkin[] = [
  {
    id: "strava",
    label: "Strava",
    description: "Transparent card with stacked stats and a pipeline flow",
    Component: StravaSkin,
  },
  {
    id: "duolingo",
    label: "Duolingo",
    description: "One oversized headline stat over a two-tile grid",
    Component: DuolingoSkin,
  },
  {
    id: "beli",
    label: "Beli",
    description: "Light card with ranked outcomes",
    Component: BeliSkin,
  },
] as const

export const DEFAULT_RECAP_SKIN_ID: RecapSkinId = RECAP_SKINS[0].id

export function isRecapSkinId(value: unknown): value is RecapSkinId {
  return typeof value === "string" && RECAP_SKINS.some((skin) => skin.id === value)
}

export function recapSkinIndex(id: RecapSkinId): number {
  const index = RECAP_SKINS.findIndex((skin) => skin.id === id)
  return index === -1 ? 0 : index
}
