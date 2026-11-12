import { Check, Columns3, ListFilter, Rows3, Search } from "lucide-react"
import { MenuContent, StatusDot } from "@/components/layout/app-ui"
import { ALL_STATUSES, STATUS_LABEL } from "@/components/StatusBadge"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ViewMode } from "@/hooks/useViewMode"
import type { ApplicationStatus } from "@/types/api"

/** The filter button's id: focus lands here when a status change hides the row you were on. */
export const FILTER_BUTTON_ID = "tracker-filter"

const VIEWS: { value: ViewMode; label: string; Icon: typeof Rows3 }[] = [
  { value: "board", label: "Board", Icon: Columns3 },
  { value: "table", label: "Table", Icon: Rows3 },
]

/**
 * The Tracker's one row of controls: title and count, search, the status
 * filter shared by Board and Table, and the Board/Table switch (icons only on
 * phones; the labels stay for screen readers).
 */
export function ApplicationsToolbar({
  shownCount,
  totalCount,
  search,
  onSearchChange,
  statuses,
  statusCounts,
  onToggleStatus,
  onShowAll,
  viewMode,
  onViewModeChange,
}: {
  shownCount: number
  totalCount: number
  search: string
  onSearchChange: (value: string) => void
  statuses: ReadonlySet<ApplicationStatus>
  /** Per status, how many applications match the search. */
  statusCounts: Record<ApplicationStatus, number>
  onToggleStatus: (status: ApplicationStatus) => void
  onShowAll: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}) {
  const on = statuses.size
  const all = on === ALL_STATUSES.length

  return (
    <div className="bar">
      <h1 id="tracker-title">
        Tracker <span>{shownCount === totalCount ? totalCount : `${shownCount} of ${totalCount}`}</span>
      </h1>
      <label className="search">
        <span className="sr-only">Search applications</span>
        <Search className="i" aria-hidden="true" />
        <input
          className="field"
          type="search"
          placeholder="Search company or role"
          autoComplete="off"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <div className="bar-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                id={FILTER_BUTTON_ID}
                className="btn btn-line filter-btn"
                type="button"
                title="Filter statuses"
                aria-label={all ? "Statuses, all shown" : `Statuses, ${on} of ${ALL_STATUSES.length} shown`}
              />
            }
          >
            <ListFilter className="i" aria-hidden="true" />
            {!all && <span className="badge" aria-hidden="true">{`${on}/${ALL_STATUSES.length}`}</span>}
          </DropdownMenuTrigger>
          <MenuContent aria-label="Show statuses">
            <div className="menu-title" aria-hidden="true">Show statuses</div>
            {ALL_STATUSES.map((status) => (
              // Checkbox items keep the menu open, so several can be toggled in one go.
              <DropdownMenuCheckboxItem
                key={status}
                checked={statuses.has(status)}
                onCheckedChange={() => onToggleStatus(status)}
              >
                <span className="cb" aria-hidden="true">
                  <Check className="i" />
                </span>
                <StatusDot status={status} />
                {STATUS_LABEL[status]}
                <span className="n">{statusCounts[status]}</span>
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem closeOnClick={false} onClick={onShowAll}>
              Show all statuses
            </DropdownMenuItem>
          </MenuContent>
        </DropdownMenu>
        <div className="seg" role="group" aria-label="View">
          {VIEWS.map(({ value, label, Icon }) => (
            <button key={value} type="button" aria-pressed={viewMode === value} onClick={() => onViewModeChange(value)}>
              <Icon className="i" aria-hidden="true" />
              <span className="lbl">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
