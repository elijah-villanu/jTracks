import { featuredStats } from "@/components/dashboard/recap-skins/shared"
import type { DashboardRecap, Sankey } from "@/types/api"

/**
 * Plain-text summaries of the dashboard's visual data, shared so every
 * text alternative for the same data says the same thing in the same
 * words. Lives in a `.ts` module, not beside the components that use it,
 * so the helpers don't add `only-export-components` lint warnings.
 */

/**
 * "Applied 128, Interviewing / OA 18, ..." -- every pipeline stage and its
 * total, in payload order. The wording `SankeyChart`'s `ChartDataTable`
 * summary has always used; extracted so the recap's text alternative
 * below reuses it verbatim rather than inventing a second format.
 */
export function sankeyStageTotals(sankey: Sankey): string {
  return sankey.nodes.map((node) => `${node.label} ${node.value}`).join(", ")
}

/**
 * A11y (WCAG 1.1.1 Non-text Content): the text alternative for a recap
 * card. The recap exists to become an image -- a PNG downloaded or handed
 * to the Web Share API -- and a picture of text reaches nobody who can't
 * see it. This is used in two places, so both say exactly the same thing:
 *
 * - `role="img"` + `aria-label` on the on-screen preview (recap-dialog.tsx
 *   and the landing page), which is presented as the image being exported;
 * - the `text` field of `navigator.share()`, so whoever receives the file
 *   also receives a readable version of it.
 *
 * Covers everything a skin can show: period, the headline, the three
 * featured stats every skin draws (`featuredStats`, the same projection
 * the skins use) and the pipeline stage totals behind the Strava skin's
 * flow and the Beli skin's ranked list. Skin-independent on purpose --
 * the three designs arrange the same numbers differently, and the
 * alternative describes the numbers, not the arrangement.
 */
export function recapTextSummary(recap: DashboardRecap): string {
  const stats = featuredStats(recap.highlights)
    .map((stat) => `${stat.label}: ${stat.value}`)
    .join(", ")

  return [
    `JourneyJob recap for ${recap.period_label.toLowerCase()} (${recap.period_start} to ${recap.period_end}).`,
    recap.headline,
    `${stats}.`,
    `Stage totals: ${sankeyStageTotals(recap.sankey)}.`,
  ].join(" ")
}
