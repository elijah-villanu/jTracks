import { BorderBeam } from "@/components/ui/border-beam"
import { Card, CardContent } from "@/components/ui/card"
import { NumberTicker } from "@/components/ui/number-ticker"

interface StatTileProps {
  label: string
  value: string
  /**
   * When present (and finite), the tile counts up to this number on mount
   * via MagicUI's `NumberTicker` instead of rendering `value` as static
   * text -- see docs/decisions/magicui-conventions.md. `value` is still
   * required and still used verbatim whenever this is omitted/non-finite
   * (e.g. avg-response-time's "—" null case), so every existing caller
   * keeps working unchanged.
   */
  numericValue?: number | null
  /** Appended after the animated number, e.g. "%" or " days" -- not passed through NumberTicker itself, which only formats the number. */
  suffix?: string
  /** Decimal places the animated number counts to; ignored when `numericValue` is omitted. */
  decimalPlaces?: number
  /**
   * Adds a single, slow MagicUI `BorderBeam` accent -- reserve this for
   * the *one* headline stat on a given page (see docs/decisions/
   * magicui-conventions.md's "one accent per view" rule); every tile
   * glowing at once reads as noise, not emphasis.
   */
  accent?: boolean
}

/**
 * A single KPI tile for AnalyticsPage's stat row (F7) -- label + big
 * number, Card-based to match this project's existing card usage (see
 * SettingsPage.tsx).
 *
 * A11y: the label/value pair is a self-contained <dl>/<dt>/<dd> rather
 * than two unrelated sibling <span>s, so the number is programmatically
 * tied to the metric it describes instead of only being visually adjacent
 * to it (WCAG 1.3.1). Kept inside the tile so the markup stays valid --
 * a <dl> may not have arbitrary nested wrappers between it and its
 * <dt>/<dd> children. The animated variant still renders real text (via
 * `NumberTicker`'s `textContent` writes onto its own `<span>` inside the
 * `<dd>`), and the app-wide `MotionConfig reducedMotion="user"` (main.tsx)
 * makes it jump straight to the final value for users with reduced-motion
 * enabled instead of animating.
 */
export function StatTile({ label, value, numericValue, suffix, decimalPlaces, accent }: StatTileProps) {
  const isAnimated = typeof numericValue === "number" && Number.isFinite(numericValue)

  return (
    <Card className={accent ? "relative" : undefined}>
      {accent && <BorderBeam duration={8} colorFrom="var(--foreground)" colorTo="var(--muted-foreground)" />}
      <CardContent>
        <dl className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="m-0 text-2xl font-semibold text-foreground tabular-nums">
            {isAnimated ? (
              <>
                <NumberTicker
                  value={numericValue}
                  decimalPlaces={decimalPlaces ?? 0}
                  className="text-foreground dark:text-foreground"
                />
                {suffix}
              </>
            ) : (
              value
            )}
          </dd>
        </dl>
      </CardContent>
    </Card>
  )
}
