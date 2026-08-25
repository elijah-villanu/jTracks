import { forwardRef } from "react"
import { SankeyChart } from "@/components/dashboard/sankey-chart"
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
 *
 * F18: the status-breakdown color-dot list this card used to render
 * (F8) has been replaced by the F16 `SankeyChart`, which conveys the
 * same status-distribution information plus flow between statuses.
 *
 * Sizing note: docs/decisions/sankey-library.md's F15 section validated
 * `width={222} height={300} marginX={4} marginY={6} fontSize={7}` for
 * the Sankey *in isolation* inside a bare 270px-wide export container --
 * but that number doesn't fit once the Sankey has to coexist with the
 * rest of this card's real content (header, headline, all seven
 * highlight tiles, footer) inside the fixed 480px card height: measured
 * empirically (a real headless-Chrome render of this exact card, all 7
 * highlights populated), `height=300` overflows the card by ~250px and
 * gets silently clipped by `overflow-hidden`. The six highlight tiles
 * are kept completely unchanged (content, padding, font sizes) per
 * R5.1 -- only the header/headline/outer-padding/gap and the Sankey
 * itself were shrunk to fit the real remaining budget (~130-140px of
 * height for the Sankey box). At that height, `fontSize=7` also causes
 * the `interviewing_oa`/`offer` node labels to horizontally overlap
 * into unreadable text for topologies where both are populated (a
 * structural consequence of `interviewing_oa` centering itself between
 * its two children, `offer` and `failed`, in `d3-sankey`'s layout, not
 * a rare edge case) -- verified visually at the real 4x export
 * resolution. Dropping to `fontSize=5.5` (still legible at 4x/native
 * phone-screen resolution) resolves that specific overlap without
 * needing more vertical room. If you change the highlight tiles or the
 * headline/footer sizing here, re-verify this still fits (`cardRef.
 * scrollHeight === cardRef.getBoundingClientRect().height`, no
 * overflow) and re-check the `interviewing_oa`/`offer` label spacing at
 * 4x zoom -- both are easy to silently regress since `overflow-hidden`
 * hides the failure mode instead of erroring.
 */
export const RecapCard = forwardRef<HTMLDivElement, RecapCardProps>(function RecapCard({ recap }, ref) {
  return (
    <div
      ref={ref}
      className="flex w-[270px] flex-col justify-between gap-1.5 overflow-hidden rounded-[20px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-3 text-slate-50 shadow-xl ring-1 ring-white/10"
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

      <p className="text-[15px] leading-tight font-bold text-white">{recap.headline}</p>

      <div className="grid grid-cols-2 gap-2">
        {recap.highlights.map((highlight) => (
          <div key={highlight.label} className="rounded-lg bg-white/10 px-2.5 py-2">
            <p className="text-[9px] font-medium tracking-wide text-slate-300 uppercase">{highlight.label}</p>
            <p className="text-base font-semibold text-white">{highlight.value}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-center rounded-lg bg-white/5 py-1">
        <SankeyChart data={recap.sankey} width={230} height={132} marginX={4} marginY={5} fontSize={5.5} />
      </div>

      <div className="flex items-center justify-between text-[9px] text-slate-400">
        <span>
          {recap.period_start} – {recap.period_end}
        </span>
        <span className="font-semibold text-slate-300">jtracks.app</span>
      </div>
    </div>
  )
})
