import { Card, CardContent } from "@/components/ui/card"

interface StatTileProps {
  label: string
  value: string
}

/**
 * A single KPI tile for AnalyticsPage's stat row (F7) -- label + big
 * number, Card-based to match this project's existing card usage (see
 * SettingsPage.tsx).
 */
export function StatTile({ label, value }: StatTileProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold text-foreground tabular-nums">{value}</span>
      </CardContent>
    </Card>
  )
}
