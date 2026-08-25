import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ALL_STATUSES, STATUS_LABEL } from "@/components/StatusBadge"
import type { ApplicationStatus } from "@/types/api"

export type StatusFilter = ApplicationStatus | "all"

interface ApplicationsToolbarProps {
  statusFilter: StatusFilter
  onStatusFilterChange: (status: StatusFilter) => void
  search: string
  onSearchChange: (search: string) => void
}

/**
 * Spreadsheet toolbar (UXPLAN.md's "Filter by Status, Search Bar,
 * Sort"). Sort lives on the column headers themselves (see
 * applications-table.tsx); this only owns the status filter and the
 * company/title search box. Both filter the already-fetched list
 * client-side in ApplicationsPage -- no new endpoint.
 */
export function ApplicationsToolbar({
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
}: ApplicationsToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search by company or title..."
          aria-label="Search applications"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="pl-8"
        />
      </div>

      <Select
        value={statusFilter}
        onValueChange={(value) => onStatusFilterChange((value as StatusFilter) ?? "all")}
      >
        <SelectTrigger className="w-[180px]" aria-label="Filter by status">
          {/*
            A11y (WCAG 4.1.2 Name, Role, Value): a bare `<SelectValue />`
            renders Base UI's raw *value*, not the chosen item's label --
            so picking "Interviewing / OA" left the trigger reading
            `interviewing_oa`, and a screen reader announced the filter as
            "Filter by status, combo box, interviewing_oa". Format the
            value through the same STATUS_LABEL map the options use.
          */}
          <SelectValue placeholder="Filter by status">
            {(value: StatusFilter | null) =>
              !value || value === "all" ? "All statuses" : STATUS_LABEL[value]
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {ALL_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_LABEL[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
