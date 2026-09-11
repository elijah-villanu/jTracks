import { forwardRef } from "react"
import { RECAP_SKINS } from "@/components/dashboard/recap-skins"
import type { RecapSkinId } from "@/components/dashboard/recap-skins"
import type { DashboardRecap } from "@/types/api"

interface RecapCardProps {
  recap: DashboardRecap
  /** Which design from the `RECAP_SKINS` registry to render. */
  skin: RecapSkinId
}

/**
 * F8's exportable recap sticker -- a fixed 9:16 (Instagram-Stories-
 * aspect) card, sized 270x480 on screen so recap-dialog.tsx can export it
 * at `pixelRatio: 4` for a clean 1080x1920 PNG.
 *
 * F48 turned this from *the* recap design into a thin dispatcher over the
 * `RECAP_SKINS` registry (`recap-skins/index.ts`). The design that used
 * to live in this file is now `recap-skins/strava-skin.tsx`; the other
 * two are `duolingo-skin.tsx` (F49) and `beli-skin.tsx` (F50). Everything
 * that made this component's contract worth documenting lives with the
 * skins now, and each carries the same rules in its own doc comment --
 * this indirection deliberately keeps zero design decisions of its own so
 * that adding a skin never means editing this file.
 *
 * The forwarded ref goes straight through to whichever skin is selected,
 * because that node *is* the export target: `recap-dialog.tsx` holds one
 * ref per skin and hands `toBlob` only the one currently on screen. That
 * is what satisfies F48's "exactly one skin renders in the exportable
 * subtree at a time" -- all three cards exist in the carousel's DOM, but
 * an export only ever reaches into one of them.
 *
 * Two invariants that apply to *every* skin, restated here because this
 * is where a new one gets registered:
 *
 * 1. **Theme independence (F28).** A skin may not resolve any
 *    `var(--...)` token for its own colors. html-to-image's clone step
 *    resolves custom properties through `getComputedStyle` before
 *    serializing, so a tokened color bakes whichever theme was active on
 *    `<html>` at export time into a PNG that has no theme context once it
 *    leaves the app. Use the fixed literals in `recap-skins/shared.tsx`
 *    and `STATUS_LITERAL_COLORS`.
 * 2. **No animation in the exported subtree (F35).** No Motion or MagicUI
 *    component (`BlurFade`, `BorderBeam`, `NumberTicker`, ...) may appear
 *    anywhere inside a skin. An in-flight animation serializes at
 *    whatever frame it is on, and Motion's inline transforms are not
 *    guaranteed to survive serialization -- either way the PNG silently
 *    differs from what the user saw. Motion elsewhere in the dialog is
 *    fine; it is outside these refs. R12.5 makes this a hard gate: verify
 *    changes with a real export against the per-skin baselines in
 *    `frontend/reference/`, not by eye in the dialog preview.
 */
export const RecapCard = forwardRef<HTMLDivElement, RecapCardProps>(function RecapCard(
  { recap, skin },
  ref
) {
  const entry = RECAP_SKINS.find((candidate) => candidate.id === skin) ?? RECAP_SKINS[0]
  const SkinComponent = entry.Component

  return <SkinComponent ref={ref} recap={recap} />
})
