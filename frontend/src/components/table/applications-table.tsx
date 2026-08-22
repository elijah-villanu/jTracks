import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Pencil } from "lucide-react"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { StatusBadge, STATUS_CELL_CLASSES } from "@/components/StatusBadge"
import { StatusSelect, statusSelectId } from "@/components/table/status-select"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { isStaleInterview, STALE_INTERVIEW_MESSAGE } from "@/lib/staleness"
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

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "title", label: "Job Title" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "date_applied", label: "Date Applied" },
]

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
  const columnCount = COLUMNS.length + 1

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
            {COLUMNS.map((column) => {
              const active = sortKey === column.key
              return (
                // A11y: `aria-sort` belongs on the columnheader (`<th>`),
                // not on the button inside it -- `role="button"` doesn't
                // support the property at all, so screen readers were
                // silently dropping it and no column ever reported as
                // sorted (WCAG 4.1.2 Name, Role, Value).
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
                <TableCell className="font-medium">{application.company}</TableCell>
                <TableCell>{application.title}</TableCell>
                <TableCell className={cn("transition-colors", STATUS_CELL_CLASSES[application.status])}>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={application.status} />
                    <StatusSelect
                      id={statusSelectId(application.id)}
                      status={application.status}
                      disabled={updatingId === application.id}
                      onChange={(status) => onStatusChange(application.id, status)}
                    />
                    {isStaleInterview(application) && (
                      // A11y: the warning was a bare focusable <span> --
                      // a tab stop with no role, which VoiceOver/NVDA
                      // announce as an unlabelled "group"/nothing at all.
                      // `role="img"` + `aria-label` gives it a real name
                      // and role, and the same text is duplicated in a
                      // visually-hidden span so the warning is still
                      // reachable when reading the row linearly (a
                      // tooltip that only opens on hover/focus is not).
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              tabIndex={0}
                              role="img"
                              className="inline-flex items-center rounded-sm text-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-amber-500"
                              aria-label={STALE_INTERVIEW_MESSAGE}
                            />
                          }
                        >
                          <AlertTriangle className="size-3.5" aria-hidden="true" />
                        </TooltipTrigger>
                        <TooltipContent>{STALE_INTERVIEW_MESSAGE}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell>{application.location ?? "—"}</TableCell>
                <TableCell>{application.date_applied ?? "—"}</TableCell>
                <TableCell>
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
