import type { CSSProperties, ReactNode } from "react"
import { Briefcase } from "lucide-react"
import type { DashboardRecap, RecapHighlight } from "@/types/api"

/**
 * On-screen size of every recap skin. 270x480 is a 9:16 (Instagram-
 * Stories-aspect) card that `recap-dialog.tsx` exports at
 * `pixelRatio: 4` for a clean 1080x1920 PNG. Every skin must render at
 * exactly this size -- the export contract, the per-skin reference PNGs
 * in `frontend/reference/`, and the carousel's fixed-height slides all
 * depend on it.
 */
export const RECAP_CARD_WIDTH = 270
export const RECAP_CARD_HEIGHT = 480

/** Shared root styling every skin's outermost element applies. */
export const RECAP_CARD_STYLE: CSSProperties = {
  width: RECAP_CARD_WIDTH,
  aspectRatio: "9 / 16",
}

/**
 * F48: fixed, theme-*independent* literal colors for the recap skins'
 * own chrome (backgrounds, scrims, ink, accents).
 *
 * These are deliberately hex/rgba literals rather than the project's
 * `var(--...)` tokens, and that is the same documented exception
 * `STATUS_LITERAL_COLORS` (status-breakdown-chart.tsx) already carries
 * for this one surface -- not a general licence to hardcode colors.
 * The reason is specific to the export: html-to-image's clone step
 * resolves `var()` through `getComputedStyle` before serializing, so a
 * tokened color would bake whichever theme happened to be active on
 * `<html>` at export time into the PNG. A recap image has no theme
 * context once it leaves the app -- it composites onto someone's
 * Instagram Story -- so it must look identical regardless of the
 * exporting user's light/dark preference.
 *
 * `.claude/rules/shadcn-ui.md`'s "colors stay within the token system"
 * rule still governs every *in-app* surface, including this dialog's own
 * chrome (the carousel controls, dots, and Download/Share buttons all use
 * real tokens). It stops at the exported card.
 */
export const RECAP_LITERAL_COLORS = {
  /**
   * Strava skin only. The per-block scrim that replaces the old opaque
   * card gradient -- see `strava-skin.tsx` for the measured numbers.
   *
   * The alpha is load-bearing, not decorative, and 0.92 is set by the
   * Sankey rather than by the text. Text only needs ~0.72 to clear AA
   * over a white backdrop, but the chart's ribbons are drawn by the
   * shared `sankey-chart.tsx` at `strokeOpacity={0.35}`, so they have
   * very little weight of their own and a light backdrop bleeding through
   * costs them most of their separation -- measured off real exports, a
   * ribbon sits at 1.63:1 against a 0.72 scrim over black but only
   * 1.23:1 over white. At 0.92 it is 1.60/1.65, i.e. the chart looks the
   * same whatever it is shared onto, which is the whole point of a fixed
   * export. Doing it here rather than by raising the chart's stroke
   * opacity keeps the dashboard's already-verified F37/F38 appearance
   * untouched.
   *
   * One value for every panel, deliberately: a denser scrim behind only
   * the chart reads as two mismatched greys once composited over a light
   * background.
   */
  scrim: "rgba(15, 23, 42, 0.92)",
  scrimHairline: "rgba(255, 255, 255, 0.12)",
  onScrim: "#f8fafc",
  onScrimMuted: "#cbd5e1",

  /** Duolingo skin: deep teal card echoing the app's accent hue (F27). */
  duolingoBackground: "linear-gradient(160deg, #0b4f57 0%, #072f35 100%)",
  duolingoPanel: "rgba(255, 255, 255, 0.10)",
  duolingoHairline: "rgba(255, 255, 255, 0.14)",
  duolingoTile: "#f8fafc",
  duolingoTileInk: "#0f172a",
  duolingoTileMuted: "#475569",
  duolingoOnDark: "#f0fdfa",
  duolingoOnDarkMuted: "#99d5d8",

  /** Beli skin: warm paper card, deliberately the light one of the three. */
  beliBackground: "#fdf4e9",
  beliHeadline: "#c2381c",
  beliInk: "#14425a",
  beliMuted: "#4a5b66",
  beliRule: "rgba(20, 66, 90, 0.16)",
} as const

/**
 * Which of `GET /dashboard/recap`'s `highlights` entries (matched by
 * their existing backend/mock `label`) the recap surfaces, in display
 * order, and the shorter caption shown for each -- see the Recap
 * redesign addendum in PRD_V2.md for why these three and not the full
 * highlight set. Relabeling ("Rejection/fail rate" -> "Rejection rate")
 * is display-only; the underlying metric (PRD_V2.md R4.4) is unchanged.
 *
 * F48: shared by all three skins, so they present the same three numbers
 * in different arrangements rather than each choosing its own -- which is
 * also what F49's "no skin-specific data fetching" acceptance requires.
 */
const FEATURED_HIGHLIGHTS: { sourceLabel: string; displayLabel: string }[] = [
  { sourceLabel: "Applications", displayLabel: "Applications sent" },
  { sourceLabel: "Interviews", displayLabel: "Interviews" },
  { sourceLabel: "Rejection/fail rate", displayLabel: "Rejection rate" },
]

export function featuredStats(highlights: RecapHighlight[]): RecapHighlight[] {
  return FEATURED_HIGHLIGHTS.map(({ sourceLabel, displayLabel }) => ({
    label: displayLabel,
    value: highlights.find((highlight) => highlight.label === sourceLabel)?.value ?? "—",
  }))
}

interface RecapFooterProps {
  recap: DashboardRecap
  /** Ink color for the wordmark; the date range renders in `mutedColor`. */
  color: string
  mutedColor: string
  className?: string
  style?: CSSProperties
}

/**
 * The logo lockup + period date range every skin closes with, matching
 * `AppLayout`'s own `Briefcase` + "jTracks" mark.
 *
 * F49 asks for exactly this to be shared rather than reimplemented per
 * skin, so the three designs can't drift on the one piece that carries
 * the app's identity. Colors are passed in because the skins sit on very
 * different backgrounds (two dark, one light) -- the *layout* is what's
 * shared, not the palette.
 */
export function RecapFooter({ recap, color, mutedColor, className, style }: RecapFooterProps) {
  return (
    <div
      className={`flex items-center justify-between text-[9px] ${className ?? ""}`}
      style={{ color: mutedColor, ...style }}
    >
      {/* F57/R17.1: Display role, weight 400 only. Sits inside the html-to-image export subtree (F60 verifies it in the PNG, not on screen). */}
      <span className="flex items-center gap-1 font-display font-normal" style={{ color }}>
        <Briefcase className="size-3" aria-hidden="true" />
        jTracks
      </span>
      <span>
        {recap.period_start} – {recap.period_end}
      </span>
    </div>
  )
}

interface EyebrowProps {
  children: ReactNode
  color: string
  className?: string
}

/** Small uppercase period label ("This week" / "All time") each skin opens with. */
export function RecapEyebrow({ children, color, className }: EyebrowProps) {
  return (
    <span
      className={`text-[10px] font-semibold tracking-wide uppercase ${className ?? ""}`}
      style={{ color }}
    >
      {children}
    </span>
  )
}
