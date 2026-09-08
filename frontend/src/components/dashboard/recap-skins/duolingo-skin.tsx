import { forwardRef } from "react"
import { MessageSquare, Percent } from "lucide-react"
import {
  RECAP_CARD_STYLE,
  RECAP_LITERAL_COLORS,
  RecapEyebrow,
  RecapFooter,
  featuredStats,
} from "@/components/dashboard/recap-skins/shared"
import type { RecapSkinProps } from "@/components/dashboard/recap-skins/types"

/**
 * F49's "Duolingo" skin, informed by the referenced Year-in-Review card
 * (https://mobbin.com/screens/81b67776-4a5d-40d9-860e-9b3b4122357a): an
 * opaque colored card, one clearly dominant stat rendered oversized, and
 * the remaining stats demoted to a compact grid of light tiles beneath
 * it.
 *
 * What was taken from the reference is the *hierarchy* -- a single number
 * big enough to be the whole point of the card, with everything else
 * deliberately secondary -- not its palette or its mascot art. The card
 * is painted in the app's own teal accent family (F27) instead of
 * Duolingo's blue.
 *
 * Unlike the Strava skin, this one keeps an **opaque** background: F48
 * scoped card transparency to Strava alone, so this skin still relies on
 * its own backdrop for contrast and needs no per-block scrim.
 *
 * All colors are fixed literals rather than tokens -- see
 * `RECAP_LITERAL_COLORS` for why the exported card is the one documented
 * exception to token theming.
 *
 * **F35 standing rule applies here too**: this component renders inside
 * the subtree `recap-dialog.tsx` hands to `toBlob`, so no Motion or
 * MagicUI component may be added anywhere in it, and any change must be
 * re-verified with a real export against
 * `frontend/reference/recap-baseline-duolingo.png`.
 */
export const DuolingoSkin = forwardRef<HTMLDivElement, RecapSkinProps>(function DuolingoSkin(
  { recap },
  ref
) {
  const [hero, ...secondary] = featuredStats(recap.highlights)
  const secondaryIcons = [MessageSquare, Percent]

  return (
    <div
      ref={ref}
      className="flex flex-col gap-3 overflow-hidden rounded-[20px] p-4"
      style={{
        ...RECAP_CARD_STYLE,
        background: RECAP_LITERAL_COLORS.duolingoBackground,
        color: RECAP_LITERAL_COLORS.duolingoOnDark,
      }}
    >
      <RecapEyebrow color={RECAP_LITERAL_COLORS.duolingoOnDarkMuted}>
        {recap.period_label}
      </RecapEyebrow>

      {/*
        The dominant stat, plus the payload's own `headline` beneath it.
        The reference card pairs its oversized figure with a one-line
        claim ("I'm a top 8% learner on Duolingo!"), and without an
        equivalent the panel reads as a number stranded in empty space.
        `headline` is already on the recap response and already spoken by
        the dialog's live region, so this needs no new data.

        80px is chosen against the widest realistic value: at four digits
        it still clears the panel's inner width, so a busy year doesn't
        wrap the one element the whole skin is built around.
      */}
      <div
        className="flex flex-1 flex-col items-center justify-center rounded-2xl px-3 py-4 text-center"
        style={{
          backgroundColor: RECAP_LITERAL_COLORS.duolingoPanel,
          boxShadow: `inset 0 0 0 1px ${RECAP_LITERAL_COLORS.duolingoHairline}`,
        }}
      >
        <p className="text-[80px] leading-none font-black" style={{ color: "#ffffff" }}>
          {hero.value}
        </p>
        <p
          className="mt-2 text-[11px] font-semibold tracking-wide uppercase"
          style={{ color: RECAP_LITERAL_COLORS.duolingoOnDarkMuted }}
        >
          {hero.label}
        </p>
        <p className="mt-4 text-[12px] leading-snug font-semibold text-balance">
          {recap.headline}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {secondary.map((stat, index) => {
          const Icon = secondaryIcons[index] ?? MessageSquare
          return (
            <div
              key={stat.label}
              className="rounded-xl px-2.5 py-2"
              style={{
                backgroundColor: RECAP_LITERAL_COLORS.duolingoTile,
                color: RECAP_LITERAL_COLORS.duolingoTileInk,
              }}
            >
              <div className="flex items-center gap-1.5">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="text-xl leading-none font-bold">{stat.value}</span>
              </div>
              <p
                className="mt-1 text-[9px] font-medium tracking-wide uppercase"
                style={{ color: RECAP_LITERAL_COLORS.duolingoTileMuted }}
              >
                {stat.label}
              </p>
            </div>
          )
        })}
      </div>

      <RecapFooter
        recap={recap}
        color={RECAP_LITERAL_COLORS.duolingoOnDark}
        mutedColor={RECAP_LITERAL_COLORS.duolingoOnDarkMuted}
        className="border-t pt-2.5"
        style={{ borderColor: RECAP_LITERAL_COLORS.duolingoHairline }}
      />
    </div>
  )
})
