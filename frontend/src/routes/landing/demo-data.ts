import type { FunnelCounts } from "@/lib/sankey-data"

/**
 * The landing page's sample numbers. Literals compiled into the landing
 * chunk: the route is public, so nothing here is ever fetched (PRODUCT.md:
 * hard-coded demo data, no authenticated requests).
 *
 * Each range is written as per-status counts, and every figure the page
 * shows (cards, funnel, range buttons) is derived from them with the same
 * definitions the product's metrics use. So the sums always add up, and
 * the hero cards, the funnel and the "This month" range can never disagree.
 */

export type RangeKey = "week" | "month" | "year" | "all"

export interface DemoRecap {
  title: string
  dates: string
  applications: number
  /** Everything that reached an interview: still interviewing, offers and failed interviews/OAs (R4.5). */
  interviews: number
  offers: number
  rejected: number
  ghosted: number
  /** Still Applied, with no outcome yet. */
  waiting: number
  stillInterviewing: number
  failed: number
  responseRate: string
  ghostRate: string
  rejectionFailRate: string
}

const percent = (part: number, total: number) =>
  total === 0 ? "0%" : `${Math.round((part / total) * 100)}%`

function recap(title: string, dates: string, c: FunnelCounts): DemoRecap {
  return {
    title,
    dates,
    applications: c.total,
    interviews: c.interviewingOa + c.offer + c.failed,
    offers: c.offer,
    rejected: c.rejected,
    ghosted: c.ghosted,
    waiting: c.total - c.interviewingOa - c.offer - c.rejected - c.ghosted - c.failed,
    stillInterviewing: c.interviewingOa,
    failed: c.failed,
    // A rejection counts as a response, the same as the shipped metric.
    responseRate: percent(c.interviewingOa + c.offer + c.rejected + c.failed, c.total),
    ghostRate: percent(c.ghosted, c.total),
    rejectionFailRate: percent(c.rejected + c.failed, c.total),
  }
}

export const DEMO_RANGES: Record<RangeKey, DemoRecap> = {
  week: recap("This week", "Aug 25 – 31", { total: 9, interviewingOa: 2, offer: 0, rejected: 3, ghosted: 1, failed: 0 }),
  month: recap("This month", "Aug 2026", { total: 34, interviewingOa: 4, offer: 1, rejected: 11, ghosted: 6, failed: 2 }),
  year: recap("This year", "2026", { total: 96, interviewingOa: 8, offer: 2, rejected: 31, ghosted: 21, failed: 4 }),
  all: recap("All time", "Since Oct 2025", { total: 128, interviewingOa: 9, offer: 3, rejected: 41, ghosted: 27, failed: 6 }),
}

/** The month the hero cards and the funnel show. */
export const DEMO_MONTH = DEMO_RANGES.month

/** The ghosting table: applications still waiting, and how long each has been quiet. */
export const DEMO_GHOST_ROWS = [
  { company: "Northwind", role: "Software Engineer, New Grad", days: 31 },
  { company: "Halcyon Labs", role: "Frontend Engineer", days: 22 },
  { company: "Brightline", role: "Platform Engineer I", days: 17 },
  { company: "Kestrel", role: "Data Engineer, New Grad", days: 15 },
  { company: "Fieldnote", role: "Software Engineer", days: 12 },
  { company: "Copperleaf", role: "Mobile Engineer", days: 9 },
  { company: "Juniper Health", role: "Backend Engineer", days: 5 },
  { company: "Tidewater", role: "Full-Stack Engineer", days: 2 },
] as const

// Dev-only: an edit whose outcomes outnumber the applications would draw a negative bar.
if (import.meta.env.DEV) {
  for (const [key, r] of Object.entries(DEMO_RANGES)) {
    if (r.waiting < 0) throw new Error(`demo-data ${key}: outcomes add up to more than ${r.applications} applications`)
  }
}
