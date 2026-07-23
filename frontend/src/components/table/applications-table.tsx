import type { ReactNode } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge, STATUS_CELL_CLASSES } from "@/components/StatusBadge"
import { StatusSelect } from "@/components/table/status-select"
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
            {COLUMNS.map((column) => (
              <TableHead key={column.key}>
                <SortButton
                  active={sortKey === column.key}
                  direction={sortDirection}
                  onClick={() => onSort(column.key)}
                >
                  {column.label}
                </SortButton>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="h-24 text-center text-muted-foreground">
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
                      status={application.status}
                      disabled={updatingId === application.id}
                      onChange={(status) => onStatusChange(application.id, status)}
                    />
                  </div>
                </TableCell>
                <TableCell>{application.location ?? "—"}</TableCell>
                <TableCell>{application.date_applied ?? "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function SortButton({
  active,
  direction,
  onClick,
  children,
}: {
  active: boolean
  direction: SortDirection
  onClick: () => void
  children: ReactNode
}) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 font-medium text-foreground hover:text-foreground/80",
        active && "text-foreground"
      )}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      {children}
      <Icon className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground")} aria-hidden="true" />
    </button>
  )
}
