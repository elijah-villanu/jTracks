import type { ForwardRefExoticComponent, RefAttributes } from "react"
import type { DashboardRecap } from "@/types/api"

/**
 * F48: the stable identifiers for the recap skins. These strings are
 * persisted verbatim under the `jtracks_recap_skin` localStorage key, so
 * renaming one silently resets returning users to the default -- add new
 * ids rather than repurposing existing ones.
 */
export type RecapSkinId = "strava" | "duolingo" | "beli"

/**
 * Every skin takes exactly this -- the same `GET /dashboard/recap`
 * payload, nothing skin-specific. F49/F50's "shares the same underlying
 * recap data as the other two skins (no skin-specific data fetching)"
 * acceptance is enforced here by construction: a skin has no way to ask
 * for anything else.
 */
export interface RecapSkinProps {
  recap: DashboardRecap
}

/**
 * Skins forward a ref to their root element because `recap-dialog.tsx`
 * hands that exact node to `toBlob` -- the ref *is* the export target.
 */
export type RecapSkinComponent = ForwardRefExoticComponent<
  RecapSkinProps & RefAttributes<HTMLDivElement>
>

export interface RecapSkin {
  id: RecapSkinId
  /** Shown in the selector's accessible names and announcements. */
  label: string
  /** One-line description, announced alongside the label on selection. */
  description: string
  Component: RecapSkinComponent
}
