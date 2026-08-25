import { Card, CardContent } from "@/components/ui/card"

interface StatTileProps {
  label: string
  value: string
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
 * <dt>/<dd> children.
 */
export function StatTile({ label, value }: StatTileProps) {
  return (
    <Card>
      <CardContent>
        <dl className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="m-0 text-2xl font-semibold text-foreground tabular-nums">{value}</dd>
        </dl>
      </CardContent>
    </Card>
  )
}
