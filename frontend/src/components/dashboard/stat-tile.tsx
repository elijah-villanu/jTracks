import { Card, CardContent } from "@/components/ui/card"
import { NumberTicker } from "@/components/ui/number-ticker"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"

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
 * `<dd>`). Under reduced motion the tile skips `NumberTicker` and renders
 * `value` directly -- see the note in the body.
 */
export function StatTile({ label, value, numericValue, suffix, decimalPlaces }: StatTileProps) {
  // A11y (WCAG 2.3.3): `MotionConfig` doesn't stop `NumberTicker`'s
  // count-up -- see hooks/usePrefersReducedMotion.ts. Under reduced motion
  // the tile renders the final `value` as plain text instead.
  const prefersReducedMotion = usePrefersReducedMotion()
  const isAnimated =
    !prefersReducedMotion && typeof numericValue === "number" && Number.isFinite(numericValue)

  return (
    // F54 (R16.4): card-shell styling only, nudged toward the Monarch
    // stat-card reference -- roomier padding (`--card-spacing` 4 -> 5,
    // i.e. 16px -> 20px) and the reference's quieter, uppercase,
    // letter-spaced caption sitting *under* the figure. (The `accent` prop
    // and the BorderBeam it added were removed 2026-09-15 -- WCAG 2.2.2.)
    <Card className="[--card-spacing:--spacing(5)]">
      <CardContent>
        {/*
          `flex-col-reverse` flips only the *visual* order so the number
          reads first, the way the reference's cards do. The DOM keeps
          the required <dt>-then-<dd> sequence, so a screen reader still
          hears "Total Applications, 128" rather than a bare number, and
          nothing here is focusable, so no tab order is affected.
        */}
        <dl className="flex flex-col-reverse gap-1.5">
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </dt>
          {/* F59/R17.1: "big number" role moved from Display (which can't carry 700) to Text (Roboto) at 700 -- stays on the Text family, no font-display here. NumberTicker's own child <span> inherits family/weight from this <dd>. */}
          <dd className="m-0 text-2xl leading-none font-bold tracking-tight text-foreground tabular-nums">
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
