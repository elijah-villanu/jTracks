import { STATUS_LABEL } from "@/components/StatusBadge"
import type {
  ApplicationStatus,
  DashboardRecap,
  RecapHighlight,
  Sankey,
  SankeyLink,
  SankeyNode,
  StatusBreakdownEntry,
} from "@/types/api"

/**
 * F42 (R10.2 + R10.4): the landing page's demo payloads.
 *
 * Three rules govern this file, and all three are acceptance criteria:
 *
 * 1. **Never a fetch.** The landing route is public and does no
 *    authenticated work (F41), so the numbers below are literals compiled
 *    into the landing chunk -- there is no request behind them.
 * 2. **Never `src/mocks/`.** MSW is dev-only and does not run in a
 *    production build, so importing a handler or fixture would render an
 *    empty chart for every real visitor. The derivations below deliberately
 *    re-implement the same rules `mocks/handlers/recap.ts` uses rather than
 *    importing them. `STATUS_LABEL` *is* imported, from the real
 *    `components/StatusBadge` -- that is the product's own canonical label
 *    map (and what the backend contract's `label` field carries), so the
 *    demo can never show a status name the app doesn't use, and
 *    "Failed Interview/OA" can never drift to "Failed" here.
 * 3. **Same invariants as the real payload.** The V2 shared contract
 *    (FRONTEND_TASKS.md) fixes three things about `sankey`, and a violation
 *    would make the landing page render a chart the product never could:
 *      - all six non-`saved` nodes are present, including zero-value ones;
 *      - links with `value: 0` are omitted entirely;
 *      - node values are *inflows*, so `applied -> interviewing_oa` equals
 *        the `interviewing_oa` node's own value, and no node emits more
 *        than it took in.
 *    `buildDemoSankey` below enforces all three *by construction* -- the
 *    hand-authored numbers are per-status counts, and every node value and
 *    link value is derived from them. Editing a count changes the chart;
 *    it cannot desynchronise the contract. `assertDemoContract` re-checks
 *    them at module load in dev builds anyway, because a future edit could
 *    still get the derivation itself wrong.
 */

/**
 * The hand-authored half: how many applications sit in each status.
 * `total` is the whole submitted cohort (every row ever applied to,
 * whatever became of it) -- it is *not* the sum of the five outcome
 * counts, because rows still sitting in `applied` with nothing decided yet
 * belong to no outcome. That difference is what the chart renders as
 * "N in flight" (F37).
 */
interface DemoFunnelCounts {
  /** Total submitted in the period; becomes the `applied` node's value. */
  total: number
  interviewingOa: number
  offer: number
  rejected: number
  ghosted: number
  failed: number
}

/** All-time funnel behind the landing page's product visual. */
const ALL_TIME_COUNTS: DemoFunnelCounts = {
  total: 128,
  interviewingOa: 9,
  offer: 3,
  rejected: 41,
  ghosted: 27,
  failed: 6,
}

/**
 * A single month's funnel, behind the recap card. Deliberately a smaller,
 * separate cohort rather than a reuse of the all-time numbers -- the card
 * is labelled "This month", so showing all-time totals under that heading
 * would be the landing page telling a story the product wouldn't.
 */
const MONTH_COUNTS: DemoFunnelCounts = {
  total: 34,
  interviewingOa: 4,
  offer: 1,
  rejected: 11,
  ghosted: 6,
  failed: 2,
}

/** Rows still sitting in `applied` with no outcome yet -- the `applied` node's shortfall. */
function stillApplied(counts: DemoFunnelCounts): number {
  return (
    counts.total -
    counts.interviewingOa -
    counts.offer -
    counts.rejected -
    counts.ghosted -
    counts.failed
  )
}

/**
 * Derives the `sankey` object exactly as the shared contract specifies:
 * `applied -> interviewing_oa` carries everyone who reached the interview
 * stage *including* those who have since moved on to an offer or a failed
 * interview/OA, and every zero-valued link is dropped.
 */
function buildDemoSankey(counts: DemoFunnelCounts): Sankey {
  const appliedToInterviewingOa = counts.interviewingOa + counts.offer + counts.failed

  // A node's `value` is its **inflow**, matching the backend
  // (`dashboard_service.build_sankey`) and PRD_V2.md R5.5's example
  // payload: `interviewing_oa` is worth everyone who ever reached the
  // interview stage, which is exactly the link feeding it. It is *not*
  // `counts.interviewingOa`, the number currently sitting there -- that is
  // the node's shortfall (inflow minus outflow), which is what F37 draws
  // as "N in flight" and what `status_breakdown` reports.
  const nodes: SankeyNode[] = [
    { key: "applied", label: STATUS_LABEL.applied, value: counts.total },
    {
      key: "interviewing_oa",
      label: STATUS_LABEL.interviewing_oa,
      value: appliedToInterviewingOa,
    },
    { key: "rejected", label: STATUS_LABEL.rejected, value: counts.rejected },
    { key: "ghosted", label: STATUS_LABEL.ghosted, value: counts.ghosted },
    { key: "offer", label: STATUS_LABEL.offer, value: counts.offer },
    { key: "failed", label: STATUS_LABEL.failed, value: counts.failed },
  ]

  const allLinks: SankeyLink[] = [
    { source: "applied", target: "interviewing_oa", value: appliedToInterviewingOa },
    { source: "applied", target: "rejected", value: counts.rejected },
    { source: "applied", target: "ghosted", value: counts.ghosted },
    { source: "interviewing_oa", target: "offer", value: counts.offer },
    { source: "interviewing_oa", target: "failed", value: counts.failed },
  ]

  return { nodes, links: allLinks.filter((link) => link.value > 0) }
}

/** A `count` for every one of the six non-`saved` statuses, zero counts included, with 1-decimal percentages. */
function buildDemoStatusBreakdown(counts: DemoFunnelCounts): StatusBreakdownEntry[] {
  const byStatus: [ApplicationStatus, number][] = [
    ["applied", stillApplied(counts)],
    ["interviewing_oa", counts.interviewingOa],
    ["offer", counts.offer],
    ["rejected", counts.rejected],
    ["failed", counts.failed],
    ["ghosted", counts.ghosted],
  ]

  return byStatus.map(([status, count]) => ({
    status,
    count,
    percentage: counts.total === 0 ? 0 : Number(((count / counts.total) * 100).toFixed(1)),
  }))
}

/** Whole-percent string, matching how the recap payload formats its rate highlights. */
function ratePercent(part: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((part / total) * 100)}%`
}

/**
 * The recap `highlights` list, in the contract's order and with the exact
 * `label` strings `recap-skins/shared.tsx`'s `featuredStats` matches on --
 * "Applications", "Interviews" and "Rejection/fail rate". Rename one and
 * the card silently renders an em dash instead of a number.
 *
 * `Interviews` counts offers and failed interviews/OAs too (R4.5: both
 * necessarily passed through the interview stage), and `Response rate`
 * counts a rejection as a response -- the same definitions the shipped
 * metrics use, so the demo card can't advertise a number the product
 * computes differently.
 */
function buildDemoHighlights(counts: DemoFunnelCounts): RecapHighlight[] {
  const interviews = counts.interviewingOa + counts.offer + counts.failed
  const responded = counts.interviewingOa + counts.offer + counts.rejected + counts.failed

  return [
    { label: "Applications", value: String(counts.total) },
    { label: "Interviews", value: String(interviews) },
    { label: "Offers", value: String(counts.offer) },
    { label: "Response rate", value: ratePercent(responded, counts.total) },
    { label: "Ghost rate", value: ratePercent(counts.ghosted, counts.total) },
    {
      label: "Rejection/fail rate",
      value: ratePercent(counts.rejected + counts.failed, counts.total),
    },
  ]
}

/** The product visual's funnel: a whole search, all time. */
export const DEMO_SANKEY: Sankey = buildDemoSankey(ALL_TIME_COUNTS)

/**
 * The recap card's payload. Dates are fixed literals rather than derived
 * from `new Date()` so the landing page renders identically on every visit
 * and in every timezone -- a demo that quietly changes at midnight is a
 * worse demo, not a better one. `range: "month"` and
 * `period_label: "This month"` are the pair the real payload produces
 * together, so the card's own eyebrow and footer stay self-consistent.
 */
export const DEMO_RECAP: DashboardRecap = {
  range: "month",
  period_label: "This month",
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  total_applications: MONTH_COUNTS.total,
  headline: `${MONTH_COUNTS.total} applications, ${MONTH_COUNTS.offer} offer${
    MONTH_COUNTS.offer === 1 ? "" : "s"
  }!`,
  highlights: buildDemoHighlights(MONTH_COUNTS),
  status_breakdown: buildDemoStatusBreakdown(MONTH_COUNTS),
  sankey: buildDemoSankey(MONTH_COUNTS),
}

/**
 * Dev-only contract check. `buildDemoSankey` already makes a violation
 * impossible from the *data* side; this guards the remaining risk, which is
 * a future edit to the derivation itself. Throws loudly in `npm run dev`
 * and is stripped from production builds by `import.meta.env.DEV`.
 */
function assertDemoContract(label: string, sankey: Sankey): void {
  const nodeValue = (key: ApplicationStatus) =>
    sankey.nodes.find((node) => node.key === key)?.value ?? 0
  const linkValue = (source: ApplicationStatus, target: ApplicationStatus) =>
    sankey.links.find((link) => link.source === source && link.target === target)?.value ?? 0

  if (sankey.nodes.length !== 6) {
    throw new Error(
      `${label}: all six non-saved nodes must be present, got ${sankey.nodes.length}.`
    )
  }
  if (sankey.links.some((link) => link.value === 0)) {
    throw new Error(`${label}: links with value 0 must be omitted.`)
  }
  // Node values are inflows, so the `applied -> interviewing_oa` link and the
  // `interviewing_oa` node it feeds must carry the same number. (This
  // previously asserted `link === node + offer + failed`, which only held
  // while the node wrongly carried the *current* interviewing_oa count --
  // i.e. the assertion was locking in the bug rather than catching it.)
  if (linkValue("applied", "interviewing_oa") !== nodeValue("interviewing_oa")) {
    throw new Error(
      `${label}: the applied->interviewing_oa link (${linkValue(
        "applied",
        "interviewing_oa"
      )}) must equal the interviewing_oa node's value (${nodeValue("interviewing_oa")}).`
    )
  }
  // No node may emit more than it took in -- a node whose outgoing links
  // outweigh its own value renders as a rect shorter than the ribbons
  // leaving it, and makes F37's shortfall go negative.
  for (const node of sankey.nodes) {
    const outgoing = sankey.links
      .filter((link) => link.source === node.key)
      .reduce((sum, link) => sum + link.value, 0)
    if (outgoing > node.value) {
      throw new Error(
        `${label}: ${node.key} emits ${outgoing} but is only worth ${node.value}.`
      )
    }
  }
}

if (import.meta.env.DEV) {
  assertDemoContract("DEMO_SANKEY", DEMO_SANKEY)
  assertDemoContract("DEMO_RECAP.sankey", DEMO_RECAP.sankey)
}
