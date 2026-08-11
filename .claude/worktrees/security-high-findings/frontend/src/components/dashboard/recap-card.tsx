import { forwardRef } from "react"
import { STATUS_LABEL } from "@/components/StatusBadge"
import { STATUS_BREAKDOWN_COLORS } from "@/components/dashboard/status-breakdown-chart"
import type { DashboardRecap } from "@/types/api"

interface RecapCardProps {
  recap: DashboardRecap
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
 */
export const RecapCard = forwardRef<HTMLDivElement, RecapCardProps>(function RecapCard({ recap }, ref) {
  const nonZeroBreakdown = recap.status_breakdown.filter((entry) => entry.count > 0)

  return (
    <div
      ref={ref}
      className="flex w-[270px] flex-col justify-between gap-3 overflow-hidden rounded-[20px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-5 text-slate-50 shadow-xl ring-1 ring-white/10"
      style={{ aspectRatio: "9 / 16" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-wide text-slate-300 uppercase">
          {recap.period_label}
        </span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-slate-200 uppercase">
          jTracks
        </span>
      </div>

      <p className="text-[22px] leading-tight font-bold text-white">{recap.headline}</p>

      <div className="grid grid-cols-2 gap-2">
        {recap.highlights.map((highlight) => (
          <div key={highlight.label} className="rounded-lg bg-white/10 px-2.5 py-2">
            <p className="text-[9px] font-medium tracking-wide text-slate-300 uppercase">{highlight.label}</p>
            <p className="text-base font-semibold text-white">{highlight.value}</p>
          </div>
        ))}
      </div>

      {nonZeroBreakdown.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-white/5 px-2.5 py-2">
          {nonZeroBreakdown.map((entry) => (
            <div key={entry.status} className="flex items-center gap-1.5 text-[10px] text-slate-200">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_BREAKDOWN_COLORS[entry.status] }}
              />
              <span className="flex-1">{STATUS_LABEL[entry.status]}</span>
              <span className="font-medium text-white">{entry.count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[9px] text-slate-400">
        <span>
          {recap.period_start} – {recap.period_end}
        </span>
        <span className="font-semibold text-slate-300">jtracks.app</span>
      </div>
    </div>
  )
})
