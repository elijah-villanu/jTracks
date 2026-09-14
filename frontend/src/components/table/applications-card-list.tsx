import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { STATUS_CELL_CLASSES } from "@/components/StatusBadge"
import { COLUMN_LABEL, type SortDirection, type SortKey } from "@/components/table/columns"
import { SortSelect } from "@/components/table/sort-select"
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

      <SortSelect
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        className="mt-3"
      />

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
