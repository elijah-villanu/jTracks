import { Columns3, Rows3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ViewMode } from "@/hooks/useViewMode"

interface ViewModeToggleProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

const VIEW_OPTIONS: { value: ViewMode; label: string; Icon: typeof Rows3 }[] = [
  { value: "table", label: "Table", Icon: Rows3 },
  { value: "board", label: "Board", Icon: Columns3 },
]

/**
 * F51 (R16.1): the Table/Board switch.
 *
 * Structurally identical to the segmented-control precedent
 * `dashboard/date-range-control.tsx` already sets, on purpose: a
 * `role="group"` with a real accessible name, wrapping plain `Button`s
 * that carry `aria-pressed`, with the selected one rendered
 * `variant="default"` and the rest `variant="outline"`. Each control
 * therefore announces as "Table, toggle button, pressed" -- the same
 * shape a user already met on the Analytics range control.
 *
 * Two shadcn alternatives were fetched and rejected rather than
 * assumed. `toggle-group` would have introduced a second,
 * differently-announced segmented-control pattern (radio semantics)
 * into an app that already has one, for no accessibility gain.
 * `button-group` (installed via the CLI to evaluate it, then removed)
 * is only the joined-edges container around this exact same markup, and
 * it exports a `cva` variants object, which trips this repo's oxlint
 * `only-export-components` rule -- a new lint warning in vendored code
 * for a purely cosmetic border-radius change.
 *
 * Rendered outside `ApplicationsPage`'s `isLoading` branch and with no
 * breakpoint conditions, so R16.1's "available at every width,
 * including 375px" holds -- it wraps under the page description rather
 * than disappearing.
 */
export function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Application view">
      {VIEW_OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={viewMode === value ? "default" : "outline"}
          aria-pressed={viewMode === value}
          onClick={() => onViewModeChange(value)}
        >
          <Icon aria-hidden="true" />
          {label}
        </Button>
      ))}
    </div>
  )
}
