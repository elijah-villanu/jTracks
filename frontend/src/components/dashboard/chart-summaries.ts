import { funnelOf } from "@/lib/analytics"
import { dayOf, shortDate, yearOf } from "@/lib/days"
import type { DashboardRange, DashboardRecap } from "@/types/api"

export type RecapDesign = "ink" | "field" | "paper"

/** The three recap designs, in order. The landing page shows the same three (routes/LandingPage.tsx). */
export const RECAP_DESIGNS: { id: RecapDesign; label: string }[] = [
  { id: "ink", label: "Dark" },
  { id: "field", label: "Headline" },
  { id: "paper", label: "Ranked" },
]

export const isRecapDesign = (value: unknown): value is RecapDesign => RECAP_DESIGNS.some((d) => d.id === value)

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

export interface RecapFigures {
  title: string
  dates: string
  total: number
  interviews: number
  offers: number
  rejected: number
  ghosted: number
  /** Still Applied: no reply yet, not ghosted yet. */
  waiting: number
  responseRate: number
  ghostRate: number
  rejectionFailRate: number
  offerWord: "Offer" | "Offers"
}

/** "Oct 12 – Nov 10, 2026" (both years spelled out when the range crosses one). */
function datesOf(startIso: string, endIso: string): string {
  const a = dayOf(startIso)
  const b = dayOf(endIso)
  return yearOf(a) === yearOf(b)
    ? `${shortDate(a)} – ${shortDate(b)}, ${yearOf(b)}`
    : `${shortDate(a)}, ${yearOf(a)} – ${shortDate(b)}, ${yearOf(b)}`
}

/** Everything the three recap designs draw, from one `GET /dashboard/recap` response. */
export function recapFigures(recap: DashboardRecap, range: DashboardRange): RecapFigures {
  const f = funnelOf(recap.status_breakdown, recap.total_applications)
  return {
    title: range === "custom" ? "Custom range" : recap.period_label,
    dates: datesOf(recap.period_start, recap.period_end),
    total: f.total,
    interviews: f.interviews,
    offers: f.offer,
    rejected: f.rejected,
    ghosted: f.ghosted,
    waiting: f.applied,
    responseRate: pct(f.responded, f.total),
    ghostRate: pct(f.ghosted, f.total),
    rejectionFailRate: pct(f.rejected + f.failed, f.total),
    offerWord: f.offer === 1 ? "Offer" : "Offers",
  }
}

/**
 * The text alternative for a recap card (WCAG 1.1.1), used for the on-screen
 * preview and sent as the `text` of a Web Share, so whoever gets the image also
 * gets a readable version. It describes the numbers, not one design's layout.
 */
export function recapTextSummary(recap: DashboardRecap, range: DashboardRange): string {
  const r = recapFigures(recap, range)
  return (
    `JourneyJob recap, ${r.title.toLowerCase()} (${r.dates}): ${r.total} applications, ${r.interviews} interviews, ` +
    `${r.offers} ${r.offerWord.toLowerCase()}, ${r.responseRate}% response rate, ${r.ghostRate}% ghost rate, ` +
    `${r.rejectionFailRate}% rejection or fail rate.`
  )
}
