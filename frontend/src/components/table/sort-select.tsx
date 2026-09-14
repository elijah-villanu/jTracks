import { useId } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { COLUMN_LABEL, type SortDirection, type SortKey } from "@/components/table/columns"

/** Every field/direction combination, in the same order as `COLUMNS`. */
const SORT_OPTIONS: { value: string; key: SortKey; direction: SortDirection }[] = (
  Object.keys(COLUMN_LABEL) as SortKey[]
).flatMap((key) => [
  { value: `${key}-asc`, key, direction: "asc" as const },
  { value: `${key}-desc`, key, direction: "desc" as const },
])

function sortOptionLabel(key: SortKey, direction: SortDirection): string {
  return `${COLUMN_LABEL[key]}, ${direction === "asc" ? "ascending" : "descending"}`
}

interface SortSelectProps {
  sortKey: SortKey | null
  sortDirection: SortDirection
  onSortChange: (key: SortKey, direction: SortDirection) => void
  className?: string
}

/**
 * A single combobox covering every sortable field in both directions.
 *
 * **R13.5's hard part, for the card rendering.** `applications-table.tsx`'s
 * `SortButton` pattern works because sort state lives on the parent
 * `<th aria-sort>` and the button's accessible name stays just the column
 * name -- there is no `<th>` in a card list for that state to live on.
 * Instead this control's own current *value* carries it: each option spells
 * out both the field and the direction ("Company, ascending"), so the
 * combobox's accessible value announces the complete sort state by itself,
 * with no separate live region for the control (ApplicationsPage's
 * `tableStatus` region still separately announces the *result* of a
 * sort/filter change, exactly as it does for the table).
 *
 * **R13.6, for the table.** F31 hides Location below `lg` and Date Applied
 * below `md` -- and hiding a column removes its `<th>`, which is the only
 * place that column's sort control and its `aria-sort` state ever existed.
 * A viewer between 640px and 1023px therefore lost the ability to sort by
 * Location at all, and an already-active sort on a hidden column stopped
 * being reported anywhere. R13.6 says sorting behaviour is unchanged by
 * V2.1 -- it is a layout requirement, not a data one -- so the table mounts
 * this control whenever it is hiding a column, restoring both the missing
 * keys and a programmatic statement of the current sort. Sharing the one
 * component with the card list (rather than the table growing its own)
 * keeps the option wording identical across the two renderings, the same
 * reason `COLUMN_LABEL` is shared.
 *
 * Lives in its own module rather than in `applications-card-list.tsx` so
 * `applications-table.tsx` can import it without the two files forming an
 * import cycle (the card list already imports `COLUMN_LABEL` from the
 * table).
 */
export function SortSelect({ sortKey, sortDirection, onSortChange, className }: SortSelectProps) {
  // `useId` rather than a fixed string: the table and the card list never
  // mount together today, but a hardcoded id is one refactor away from
  // being duplicated, and a duplicate id silently breaks the <label>'s
  // association for whichever control loses the race.
  const selectId = useId()
  const currentValue = sortKey ? `${sortKey}-${sortDirection}` : null

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Label htmlFor={selectId} className="font-normal text-muted-foreground">
        Sort applications by
      </Label>
      <Select
        value={currentValue}
        onValueChange={(value) => {
          const option = SORT_OPTIONS.find((candidate) => candidate.value === value)
          if (option) {
            onSortChange(option.key, option.direction)
          }
        }}
      >
        <SelectTrigger id={selectId} size="sm">
          <SelectValue placeholder="Unsorted">
            {(value: string | null) => {
              const option = SORT_OPTIONS.find((candidate) => candidate.value === value)
              return option ? sortOptionLabel(option.key, option.direction) : "Unsorted"
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {sortOptionLabel(option.key, option.direction)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
