import { forwardRef } from "react"
import { STATUS_LABEL } from "@/components/StatusBadge"
import {
  RECAP_CARD_STYLE,
  RECAP_LITERAL_COLORS,
  RecapFooter,
  featuredStats,
} from "@/components/dashboard/recap-skins/shared"
import type { RecapSkinProps } from "@/components/dashboard/recap-skins/types"

/** How many ranked outcome rows fit the card without crowding the stat columns. */
const MAX_RANKED_ROWS = 5

/**
 * F50's "Beli" skin, informed by the referenced monthly-recap card
 * (https://mobbin.com/screens/7fe2981e-cefd-4a7a-8e57-61ab97fb8e7f): a
 * warm paper card carrying a heavy display headline, a pair of
 * label-above-number stat columns, and -- the piece that gives this skin
 * its reason to exist -- a numbered "ranked" list rather than another
 * arrangement of the same three hero figures.
 *
 * The ranking comes from `status_breakdown`, which is already on the
 * `GET /dashboard/recap` payload (see `DashboardRecap` in types/api.ts).
 * That matters for F50's "no skin-specific data fetching" acceptance:
 * this skin surfaces a *different projection of the same response*, not a
 * second request. Statuses with a zero count are dropped -- an outcome
 * nobody reached should not occupy a rank -- and the rest are ordered by
 * count, which is what makes it a ranking rather than a list.
 *
 * Deliberately the light one of the three skins. Two dark cards and a
 * light one gives the selector a real choice at a glance, and it also
 * proves the export is genuinely theme-independent: this card stays
 * paper-colored while the app is in dark mode.
 *
 * Contrast on the fixed `beliBackground` (#fdf4e9): the headline
 * (#c2381c) lands at ~4.9:1, the stat numbers and ranked rows (#14425a)
 * at ~9.8:1, and the muted labels (#4a5b66) at ~6.5:1 -- all past WCAG AA
 * for normal text, checked against this skin's own background rather than
 * assumed, because a fixed-palette export can be verified once and stay
 * verified.
 *
 * **F35 standing rule applies here too**: this component renders inside
 * the subtree `recap-dialog.tsx` hands to `toBlob`, so no Motion or
 * MagicUI component may be added anywhere in it, and any change must be
 * re-verified with a real export against
 * `frontend/reference/recap-baseline-beli.png`.
 */
export const BeliSkin = forwardRef<HTMLDivElement, RecapSkinProps>(function BeliSkin(
  { recap },
  ref
) {
  const [applications, interviews] = featuredStats(recap.highlights)

  const rankedOutcomes = [...recap.status_breakdown]
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_RANKED_ROWS)

  return (
    <div
      ref={ref}
      className="flex flex-col gap-3 overflow-hidden rounded-[20px] p-4"
      style={{
        ...RECAP_CARD_STYLE,
        backgroundColor: RECAP_LITERAL_COLORS.beliBackground,
        color: RECAP_LITERAL_COLORS.beliInk,
      }}
    >
      {/*
        F59/R17.1: this is a headline, not a stat, and R17.1's table doesn't
        name it -- treated as Display (Hedvig 400, the only real weight)
        rather than Text 700, compensating for the lost font-black (900,
        unsourced -- would synthesize a fake bold that serializes into the
        PNG export) with the size/tracking already in place here.
      */}
      <p
        className="font-display text-[26px] leading-[1.05] font-normal tracking-tight uppercase"
        style={{ color: RECAP_LITERAL_COLORS.beliHeadline }}
      >
        {recap.period_label}
        <br />
        in applications
      </p>

      <div className="grid grid-cols-2 gap-2">
        {[applications, interviews].map((stat) => (
          <div key={stat.label}>
            <p
              className="text-[9px] font-semibold tracking-wide uppercase"
              style={{ color: RECAP_LITERAL_COLORS.beliMuted }}
            >
              {stat.label}
            </p>
            <p className="text-[36px] leading-none font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <p
          className="text-[9px] font-semibold tracking-wide uppercase"
          style={{ color: RECAP_LITERAL_COLORS.beliMuted }}
        >
          Top outcomes
        </p>

        {rankedOutcomes.length > 0 ? (
          /*
            The list fills the card rather than bunching under the stat
            columns -- at five rows in a 9:16 frame, a fixed row gap left
            the bottom third of the card empty, and the reference's list
            fills its card.
            Each row is an equal-height band (`flex-1`) with its text
            vertically centered and a hairline rule on the bottom edge.
            Spreading the rows with `justify-between` instead leaves each
            rule tucked under its own row with a void beneath it, so the
            rules read as underlines rather than separators; equal bands
            put them at even intervals, which is what makes a sparse list
            still read as a list.
          */
          <ol className="m-0 flex flex-1 list-none flex-col p-0 text-[13px]">
            {rankedOutcomes.map((entry, index) => (
              <li
                key={entry.status}
                className="flex flex-1 items-center gap-2"
                style={
                  index < rankedOutcomes.length - 1
                    ? { borderBottom: `1px solid ${RECAP_LITERAL_COLORS.beliRule}` }
                    : undefined
                }
              >
                <span
                  className="w-3.5 shrink-0 font-semibold"
                  style={{ color: RECAP_LITERAL_COLORS.beliMuted }}
                >
                  {index + 1}
                </span>
                <span className="flex-1 truncate">{STATUS_LABEL[entry.status]}</span>
                <span className="font-semibold">{entry.count}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[11px]" style={{ color: RECAP_LITERAL_COLORS.beliMuted }}>
            No outcomes recorded in this range yet.
          </p>
        )}
      </div>

      <RecapFooter
        recap={recap}
        color={RECAP_LITERAL_COLORS.beliInk}
        mutedColor={RECAP_LITERAL_COLORS.beliMuted}
        className="border-t pt-2.5"
        style={{ borderColor: RECAP_LITERAL_COLORS.beliRule }}
      />
    </div>
  )
})
