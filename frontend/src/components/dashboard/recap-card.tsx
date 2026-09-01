import { forwardRef } from "react"
import { Briefcase } from "lucide-react"
import { SankeyChart } from "@/components/dashboard/sankey-chart"
import { STATUS_LITERAL_COLORS } from "@/components/dashboard/status-breakdown-chart"
import type { DashboardRecap, RecapHighlight } from "@/types/api"

interface RecapCardProps {
  recap: DashboardRecap
}

/**
 * Which of `GET /dashboard/recap`'s `highlights` entries (matched by their
 * existing backend/mock `label`) this simplified card surfaces, in display
 * order, and the shorter caption shown for each -- see the Recap redesign
 * addendum in PRD_V2.md for why these three and not the full highlight set.
 * Relabeling ("Rejection/fail rate" -> "Rejection rate") is display-only;
 * the underlying metric (PRD_V2.md R4.4) is unchanged.
 */
const FEATURED_HIGHLIGHTS: { sourceLabel: string; displayLabel: string }[] = [
  { sourceLabel: "Applications", displayLabel: "Applications sent" },
  { sourceLabel: "Interviews", displayLabel: "Interviews" },
  { sourceLabel: "Rejection/fail rate", displayLabel: "Rejection rate" },
]

function featuredStats(highlights: RecapHighlight[]): RecapHighlight[] {
  return FEATURED_HIGHLIGHTS.map(({ sourceLabel, displayLabel }) => ({
    label: displayLabel,
    value: highlights.find((highlight) => highlight.label === sourceLabel)?.value ?? "—",
  }))
}

/**
 * F8's exportable recap sticker -- a fixed 9:16 (Instagram-Stories-
 * aspect) card, sized 270x480 on screen so recap-dialog.tsx can export
 * it at `pixelRatio: 4` for a clean 1080x1920 PNG.
 *
 * Important: this card renders its *own* solid/gradient background
 * (Wrapped/Strava-style floating sticker) -- the "transparent
 * background" requirement from the ADR (docs/decisions/
 * recap-image-approach.md) applies to the *outer PNG canvas* the export
 * step produces around this card, not to the card's own content, which
 * would be illegible floating on nothing. See recap-dialog.tsx's export
 * call for where that outer transparency actually comes from.
 *
 * Redesign (see PRD_V2.md's Recap redesign addendum): replaces the
 * previous headline sentence + up-to-seven-tile grid with a Strava/Year-
 * in-Sport-style layout -- three large hero stats (Applications sent,
 * Interviews, Rejection rate) stacked with dividers, then a simplified,
 * *non*-value-weighted Sankey (`weighted={false}`, see sankey-chart.tsx)
 * that shows which stages the flow passed through without competing with
 * the hero stats for visual weight, then a footer pairing the app's own
 * logo lockup (matching AppLayout's `Briefcase` + "jTracks") with the
 * period's date range. The three-stat/footer numbers still come straight
 * from the same `GET /dashboard/recap` payload as before -- nothing new
 * was added to the contract, this only changes which fields the card
 * surfaces and how.
 *
 * F28: this card's `SankeyChart` is passed `STATUS_LITERAL_COLORS`
 * (fixed hex), not the default theme-aware `STATUS_BREAKDOWN_COLORS` --
 * deliberately, so the export never depends on `.dark` state. See
 * status-breakdown-chart.tsx's doc comment on `STATUS_LITERAL_COLORS`
 * for the full reasoning (html-to-image's clone step resolves
 * `var(--status-*)` via `getComputedStyle` before serializing, which
 * would bake in whichever theme is active on `<html>` at export time --
 * not what a "looks the same regardless of your current theme" export
 * card wants).
 */
export const RecapCard = forwardRef<HTMLDivElement, RecapCardProps>(function RecapCard({ recap }, ref) {
  const stats = featuredStats(recap.highlights)

  return (
    <div
      ref={ref}
      className="flex w-[270px] flex-col gap-3 overflow-hidden rounded-[20px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-4 text-slate-50 shadow-xl ring-1 ring-white/10"
      style={{ aspectRatio: "9 / 16" }}
    >
      <span className="text-[10px] font-semibold tracking-wide text-slate-300 uppercase">
        {recap.period_label}
      </span>

      <div className="flex flex-1 flex-col justify-center gap-2.5">
        {stats.map((stat, index) => (
          <div key={stat.label} className={`text-center ${index > 0 ? "border-t border-white/10 pt-2.5" : ""}`}>
            <p className="text-3xl font-bold text-white">{stat.value}</p>
            <p className="text-[10px] font-medium tracking-wide text-slate-300 uppercase">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-center rounded-lg bg-white/5 py-1">
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
      </div>

      <div className="flex items-center justify-between border-t border-white/10 pt-2.5 text-[9px] text-slate-400">
        <span className="flex items-center gap-1 font-semibold text-slate-300">
          <Briefcase className="size-3" aria-hidden="true" />
          jTracks
        </span>
        <span>
          {recap.period_start} – {recap.period_end}
        </span>
      </div>
    </div>
  )
})
