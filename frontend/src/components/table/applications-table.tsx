import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { STATUS_CELL_CLASSES } from "@/components/StatusBadge"
import { StatusControl } from "@/components/table/status-control"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { cn } from "@/lib/utils"
import type { Application, ApplicationStatus } from "@/types/api"

export type SortKey = "title" | "company" | "status" | "location" | "date_applied"
export type SortDirection = "asc" | "desc"

interface ApplicationsTableProps {
  applications: Application[]
  totalCount: number
  sortKey: SortKey | null
  sortDirection: SortDirection
  onSort: (key: SortKey) => void
  onStatusChange: (id: string, status: ApplicationStatus) => void
  updatingId: string | null
}

/**
 * All five sortable columns, in display order. This is the single source
 * of truth for column labels -- ApplicationsPage's sort-state
 * announcement and the card rendering's own sort control (F32) both
 * import `COLUMN_LABEL` below rather than hard-coding the strings a
 * second time, so the wording can't drift between the three surfaces.
 */
export const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "title", label: "Job Title" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "date_applied", label: "Date Applied" },
]

export const COLUMN_LABEL: Record<SortKey, string> = COLUMNS.reduce(
  (labels, column) => ({ ...labels, [column.key]: column.label }),
  {} as Record<SortKey, string>
)

/**
 * F31 breakpoints (R13.2 option A, R13 milestone). Chosen to line up
 * with Tailwind's default `md`/`lg` boundaries -- already the pattern
 * this app uses elsewhere (e.g. applications-toolbar.tsx switches layout
 * at `sm`) -- rather than inventing new values:
 * - Below `lg` (1024px) there isn't room for all six columns plus sane
 *   wrap widths on Company/Job Title, so Location drops first. Its
 *   value is folded into the Company cell as a secondary line so it's
 *   still genuinely present on screen (R13.4) -- not just in the edit
 *   dialog.
 * - Below `md` (768px) Date Applied drops too, folded into the Job
 *   Title cell the same way.
 * - Below `sm` (640px) ApplicationsPage swaps this component out
 *   entirely for the card rendering (F32/R13.2 option B) -- this table
 *   is simply not mounted at that point, so it never has to handle
 *   anything narrower than `sm`.
 */
const HIDE_LOCATION_QUERY = "(max-width: 1023px)"
const HIDE_DATE_APPLIED_QUERY = "(max-width: 767px)"

/**
 * The Job Table from UXPLAN.md's Dashboard Page Structure: Job Title,
 * Company, Status, Date Applied (plus Location, which the shared
 * contract has and the wireframe's header list omits). Sorting is
 * client-side only -- `applications` is expected to already be
 * filtered/sorted by the caller (see ApplicationsPage).
 */
export function ApplicationsTable({
  applications,
  totalCount,
  sortKey,
  sortDirection,
  onSort,
  onStatusChange,
  updatingId,
}: ApplicationsTableProps) {
  const { openEditForm } = useApplicationsContext()

  // R13.3: `table.tsx` puts a blanket `whitespace-nowrap` on every
  // TableHead/TableCell, which combined with the container's
  // `overflow-x-auto` is exactly what produced the horizontal scrollbar
  // R13.1 forbids. Fixed at this call site (per-column classes below)
  // rather than in the shadcn primitive, which would silently change
  // every future table.
  const hideLocation = useMediaQuery(HIDE_LOCATION_QUERY)
  const hideDateApplied = useMediaQuery(HIDE_DATE_APPLIED_QUERY)

  const visibleColumns = COLUMNS.filter((column) => {
    if (column.key === "location") {
      return !hideLocation
    }
    if (column.key === "date_applied") {
      return !hideDateApplied
    }
    return true
  })
  // +1 for the trailing icon-only Edit column, which never hides.
  const columnCount = visibleColumns.length + 1

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <Table>
        <TableCaption>
          {applications.length === totalCount
            ? `${totalCount} tracked applications.`
            : `Showing ${applications.length} of ${totalCount} tracked applications.`}
        </TableCaption>
        <TableHeader>
          <TableRow>
            {visibleColumns.map((column) => {
              const active = sortKey === column.key
              return (
                // A11y: `aria-sort` belongs on the columnheader (`<th>`),
                // not on the button inside it -- `role="button"` doesn't
                // support the property at all, so screen readers were
                // silently dropping it and no column ever reported as
                // sorted (WCAG 4.1.2 Name, Role, Value).
                //
                // Sort state (`sortKey`/`sortDirection`) lives one level
                // up in ApplicationsPage and is completely independent of
                // which columns are currently rendered here -- a column
                // hidden at this width just stops rendering its `<th>`
                // and `SortButton`, but sorting by it (if still active)
                // keeps applying to `applications` exactly as before.
                <TableHead
                  key={column.key}
                  aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <SortButton
                    label={column.label}
                    active={active}
                    direction={sortDirection}
                    onClick={() => onSort(column.key)}
                  />
                </TableHead>
              )
            })}
            <TableHead className="w-9">
              <span className="sr-only">Edit</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                No applications match your filters.
              </TableCell>
            </TableRow>
          ) : (
            applications.map((application) => (
              <TableRow key={application.id}>
                <TableCell className="min-w-36 max-w-64 align-top font-medium whitespace-normal break-words">
                  {application.company}
                  {hideLocation && (
                    // R13.4: Location's own column is hidden below `lg` --
                    // its value has to stay genuinely present on this same
                    // screen, not just in the edit dialog, so it's folded
                    // in here as a secondary line rather than dropped.
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      <span className="sr-only">Location: </span>
                      {application.location ?? "—"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="min-w-40 max-w-72 align-top whitespace-normal break-words">
                  {application.title}
                  {hideDateApplied && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      <span className="sr-only">Date Applied: </span>
                      {application.date_applied ?? "—"}
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "align-top whitespace-normal transition-colors",
                    STATUS_CELL_CLASSES[application.status]
                  )}
                >
                  <StatusControl
                    application={application}
                    updatingId={updatingId}
                    onStatusChange={onStatusChange}
                  />
                </TableCell>
                {!hideLocation && (
                  <TableCell className="align-top whitespace-normal break-words">
                    {application.location ?? "—"}
                  </TableCell>
                )}
                {!hideDateApplied && (
                  <TableCell className="align-top">{application.date_applied ?? "—"}</TableCell>
                )}
                <TableCell className="align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${application.company} — ${application.title}`}
                    onClick={() => openEditForm(application)}
                  >
                    <Pencil />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * A11y notes:
 * - Follows the ARIA APG sortable-table pattern: the button's accessible
 *   name is *just* the column name, and sort state is carried solely by
 *   `aria-sort` on the parent `<th>` (see above). Screen readers read a
 *   column header's text on every data cell in that column, so spelling
 *   the state out in visually-hidden text inside the button would make
 *   every single cell announce "Company sorted ascending activate to
 *   sort descending, Acme Corp".
 * - The arrow icon is decorative (`aria-hidden`) -- it duplicates
 *   `aria-sort`.
 * - Explicit `focus-visible` ring: this is a bare `<button>`, not the
 *   themed `Button` primitive, so it otherwise fell back to the UA
 *   default outline, which the global `outline-ring/50` base rule
 *   washes out against the header background (WCAG 2.4.7 Focus Visible).
 */
function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: SortDirection
  onClick: () => void
}) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-sm font-medium text-foreground hover:text-foreground/80",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active && "text-foreground"
      )}
    >
      {label}
      <Icon className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground")} aria-hidden="true" />
    </button>
  )
}
