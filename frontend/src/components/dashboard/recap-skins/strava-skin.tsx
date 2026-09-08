import { forwardRef } from "react"
import type { ReactNode } from "react"
import { SankeyChart } from "@/components/dashboard/sankey-chart"
import { STATUS_LITERAL_COLORS } from "@/components/dashboard/status-breakdown-chart"
import {
  RECAP_CARD_STYLE,
  RECAP_LITERAL_COLORS,
  RecapEyebrow,
  RecapFooter,
  featuredStats,
} from "@/components/dashboard/recap-skins/shared"
import type { RecapSkinProps } from "@/components/dashboard/recap-skins/types"

/**
 * Shared scrim panel. The Strava skin's *card* is transparent (F48); each
 * block of content sits on its own translucent slate panel instead, and
 * the gaps between panels are where the user's own backdrop shows
 * through -- a floating stat overlay rather than a filled card, per
 * `frontend/reference/strava_reference.PNG`.
 */
function Panel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl ${className ?? ""}`}
      style={{
        backgroundColor: RECAP_LITERAL_COLORS.scrim,
        boxShadow: `inset 0 0 0 1px ${RECAP_LITERAL_COLORS.scrimHairline}`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * F48's "Strava" skin -- the recap design that shipped in R9, migrated
 * into the skin system with one deliberate change: **the card's own
 * background is now transparent.** The previous
 * `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950` root is
 * gone, per the user's explicit requirement and the layout sketch at
 * `frontend/reference/strava_reference.PNG`.
 *
 * This narrows -- it does not delete -- the "recap card gradient is a
 * permanent exception to token theming" note F28/R11.4 recorded. That
 * note now applies only to the two skins that still paint an opaque
 * background (`duolingo-skin.tsx`, `beli-skin.tsx`). Reviewers should
 * read the change here as intentional rather than as a regression of
 * that decision.
 *
 * **Legibility without a backdrop (F48's stated risk, handled).** The old
 * opaque gradient was what guaranteed contrast for this card's light text
 * and its Sankey's status colors. Drop it naively and the same near-white
 * type lands on whatever the user shares onto -- a plain white Stories
 * canvas would render it invisible. So the transparency is at the *card*
 * level only: every block of content keeps a translucent scrim beneath
 * just the type (`RECAP_LITERAL_COLORS.scrim`, `rgba(15,23,42,0.92)`).
 * That alpha is chosen, not arbitrary -- see `scrim`'s own comment for
 * why the Sankey, not the text, is what sets it.
 *
 * Measured off real 1080x1920 exports rather than eyeballed in the dialog
 * (F48 requires exactly that, since the dialog's own background is not
 * what the PNG composites onto). Sampling the flat scrim and compositing
 * it over both extremes: stat values (#ffffff) land at 14.5:1 over a
 * white backdrop, the muted labels (#cbd5e1) at 9.8:1, and the Sankey's
 * own labels at 13.8:1; over black the same three are 18.2:1, 12.2:1 and
 * 17.4:1. Every value clears WCAG AA at both ends of the range, which is
 * the only way to be safe about a backdrop the app never gets to see.
 *
 * The one number that stays low is the ribbons' separation from the
 * scrim (1.60:1 over white, 1.65:1 over black). That is inherited from
 * the shared chart's 35% stroke opacity and is unchanged from what the
 * opaque gradient produced (1.63:1), so it is not a regression this skin
 * introduced -- and the ribbons are not the sole carrier of anything:
 * the nodes are full-opacity color, and `ChartDataTable` exposes every
 * flow as text (WCAG 1.1.1). Raising it would mean changing
 * `sankey-chart.tsx`, which the dashboard renders too.
 *
 * F28: the Sankey here is passed `STATUS_LITERAL_COLORS` (fixed hex), not
 * the theme-aware `STATUS_BREAKDOWN_COLORS`, so the export never depends
 * on `.dark` state -- see that map's doc comment. `weighted={false}` is
 * the schematic variant (see sankey-chart.tsx): it shows which stages the
 * flow passed through without competing with the hero stats for visual
 * weight.
 *
 * **F35 standing rule -- no animation inside the exported subtree.** This
 * component sits inside what `recap-dialog.tsx` hands to `toBlob`, so no
 * Motion or MagicUI component may be placed anywhere in here (no
 * `BlurFade`, no `BorderBeam`, no `NumberTicker`). An in-flight animation
 * serializes at whatever frame it happens to be on, and Motion's inline
 * transforms are not guaranteed to survive serialization -- either way
 * the exported PNG silently differs from what the user saw. Decorative
 * motion *around* the card, elsewhere in the dialog, is fine; it is
 * outside the exported ref. R12.5 makes this a hard gate: any change in
 * here must be re-verified with a real export, diffed against
 * `frontend/reference/recap-baseline-strava.png`.
 */
export const StravaSkin = forwardRef<HTMLDivElement, RecapSkinProps>(function StravaSkin(
  { recap },
  ref
) {
  const stats = featuredStats(recap.highlights)

  return (
    <div
      ref={ref}
      className="flex flex-col gap-2.5 rounded-[20px] p-3"
      style={{ ...RECAP_CARD_STYLE, color: RECAP_LITERAL_COLORS.onScrim }}
    >
      <Panel className="flex flex-1 flex-col justify-center gap-2.5 px-3 py-3">
        <RecapEyebrow color={RECAP_LITERAL_COLORS.onScrimMuted}>{recap.period_label}</RecapEyebrow>

        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className="text-center"
            style={
              index > 0
                ? {
                    borderTop: `1px solid ${RECAP_LITERAL_COLORS.scrimHairline}`,
                    paddingTop: 10,
                  }
                : undefined
            }
          >
            <p className="text-3xl font-bold" style={{ color: "#ffffff" }}>
              {stat.value}
            </p>
            <p
              className="text-[10px] font-medium tracking-wide uppercase"
              style={{ color: RECAP_LITERAL_COLORS.onScrimMuted }}
            >
              {stat.label}
            </p>
          </div>
        ))}
      </Panel>

      <Panel className="flex justify-center px-2 py-2">
        <SankeyChart
          data={recap.sankey}
          width={230}
          height={110}
          marginX={4}
          marginY={5}
          fontSize={6}
          colors={STATUS_LITERAL_COLORS}
          weighted={false}
        />
      </Panel>

      <Panel className="px-3 py-2">
        <RecapFooter
          recap={recap}
          color={RECAP_LITERAL_COLORS.onScrimMuted}
          mutedColor={RECAP_LITERAL_COLORS.onScrimMuted}
        />
      </Panel>
    </div>
  )
})
