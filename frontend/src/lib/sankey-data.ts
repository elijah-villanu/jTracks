import { STATUS_LABEL } from "@/components/StatusBadge"
import type { Sankey, SankeyLink, SankeyNode } from "@/types/api"

/**
 * How many applications of a submitted cohort sit in each status. `total`
 * is the whole cohort -- *not* the sum of the other five, because rows
 * still sitting in `applied` belong to no outcome (the chart's "N in
 * flight").
 */
export interface FunnelCounts {
  total: number
  interviewingOa: number
  offer: number
  rejected: number
  ghosted: number
  failed: number
}

/**
 * Builds the `sankey` payload exactly as `backend/app/services/
 * dashboard_service.py`'s `build_sankey` does. The one copy, shared by the
 * dev mocks and the landing page's demo data -- it lives in `lib/`, not
 * `mocks/`, because the landing bundle must never pull in MSW.
 *
 * A node's `value` is its **inflow**: every row in `offer` or `failed`
 * passed through `interviewing_oa`, so that node is worth
 * `interviewingOa + offer + failed` -- the same value as the link feeding
 * it (PRD_V2.md R5.5). Using the current count instead (F63) drew the node
 * at half the height of its own incoming ribbon and hid its "N in flight"
 * label. All six nodes are always present; zero-value links are omitted,
 * so an empty cohort is six zero nodes and no links (R5.6).
 */
export function buildSankey(counts: FunnelCounts): Sankey {
  const appliedToInterviewingOa = counts.interviewingOa + counts.offer + counts.failed

  const nodes: SankeyNode[] = [
    { key: "applied", label: STATUS_LABEL.applied, value: counts.total },
    { key: "interviewing_oa", label: STATUS_LABEL.interviewing_oa, value: appliedToInterviewingOa },
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
