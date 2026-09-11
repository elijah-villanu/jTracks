import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { STATUS_CELL_CLASSES } from "@/components/StatusBadge"
import { COLUMN_LABEL, type SortDirection, type SortKey } from "@/components/table/applications-table"
import { StatusControl } from "@/components/table/status-control"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { cn } from "@/lib/utils"
import type { Application, ApplicationStatus } from "@/types/api"

interface ApplicationsCardListProps {
  applications: Application[]
  totalCount: number
  sortKey: SortKey | null
  sortDirection: SortDirection
  onSortChange: (key: SortKey, direction: SortDirection) => void
  onStatusChange: (id: string, status: ApplicationStatus) => void
  updatingId: string | null
}

const SUMMARY_ID = "applications-card-summary"

/**
 * F32 (R13.2 option B): below the narrow breakpoint (see
 * ApplicationsPage's `(max-width: 639px)` query), this replaces
 * `ApplicationsTable` entirely rather than hiding columns further --
 * there's no amount of column-dropping that keeps a six-column table
 * usable at 375px. One card per application, carrying all five data
 * fields plus the same status control, staleness warning and edit
 * button as the table row.
 *
 * Driven off the exact same `applications` prop, `COLUMN_LABEL` (from
 * applications-table.tsx) and `StatusControl`/`onStatusChange` path as
 * the table, so the two renderings can't drift from each other.
 */
export function ApplicationsCardList({
  applications,
  totalCount,
  sortKey,
  sortDirection,
  onSortChange,
  onStatusChange,
  updatingId,
}: ApplicationsCardListProps) {
  const { openEditForm } = useApplicationsContext()

  return (
    <div>
      {/*
        R13.5: a <div> list has no `TableCaption` -- this is that
        caption's "Showing N of M tracked applications." sentence,
        reusing the exact same copy/conditional as the table so the two
        renderings never say something different about the same data.
      */}
      <p id={SUMMARY_ID} className="text-sm text-muted-foreground">
        {applications.length === totalCount
          ? `${totalCount} tracked applications.`
          : `Showing ${applications.length} of ${totalCount} tracked applications.`}
      </p>

      <CardSortControl sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />

      {applications.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No applications match your filters.
        </p>
      ) : (
        <ul aria-describedby={SUMMARY_ID} className="mt-3 flex flex-col gap-3">
          {applications.map((application) => (
            <li key={application.id}>
              <Card size="sm">
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium break-words text-foreground">{application.company}</p>
                      <p className="text-sm break-words text-muted-foreground">{application.title}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${application.company} — ${application.title}`}
                      onClick={() => openEditForm(application)}
                    >
                      <Pencil />
                    </Button>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{COLUMN_LABEL.location}</dt>
                      <dd className="break-words">{application.location ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{COLUMN_LABEL.date_applied}</dt>
                      <dd>{application.date_applied ?? "—"}</dd>
                    </div>
                  </dl>

                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                      STATUS_CELL_CLASSES[application.status]
                    )}
                  >
                    <StatusControl
                      application={application}
                      updatingId={updatingId}
                      onStatusChange={onStatusChange}
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

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

/**
 * R13.5's hard part: `applications-table.tsx`'s `SortButton` pattern
 * works because sort state lives on the parent `<th aria-sort>` and the
 * button's accessible name stays just the column name -- there's no
 * `<th>` here for state to live on. Instead this control's own current
 * *value* carries the state: each option spells out both the field and
 * the direction ("Company, ascending"), so the combobox's accessible
 * value announces the complete sort state by itself, with no separate
 * live region needed for the control itself (ApplicationsPage's
 * `tableStatus` live region still separately announces the *result* of
 * a sort/filter change, same as it does for the table).
 */
function CardSortControl({
  sortKey,
  sortDirection,
  onSortChange,
}: {
  sortKey: SortKey | null
  sortDirection: SortDirection
  onSortChange: (key: SortKey, direction: SortDirection) => void
}) {
  const currentValue = sortKey ? `${sortKey}-${sortDirection}` : null

  return (
    <div className="mt-3 flex items-center gap-2">
      <Label htmlFor="card-sort-select" className="font-normal text-muted-foreground">
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
        <SelectTrigger id="card-sort-select" size="sm">
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
