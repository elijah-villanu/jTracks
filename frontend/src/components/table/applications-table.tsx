import { useState } from "react"
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react"
import { StatusMenu } from "@/components/board/status-menu"
import { StatusDot } from "@/components/layout/app-ui"
import { STATUS_LABEL } from "@/components/StatusBadge"
import { dayOf, plural, shortDate } from "@/lib/days"
import {
  daysUntilGhosted,
  initialOf,
  sortRows,
  statusTriggerId,
  updatedAgo,
  type TableSort,
  type TableSortKey,
} from "@/lib/tracker"
import type { Application, ApplicationStatus } from "@/types/api"

const PAGE = 50

/**
 * The Table view: the same list as the board, 50 rows at a time. Headers sort
 * (sort state lives in ApplicationsPage, so it survives a switch to Board and
 * back). On phones each row becomes two lines: role, company and status, then
 * the applied date.
 */
export function ApplicationsTable({
  applications,
  search,
  sort,
  onSort,
  ghostDays,
  today,
  updatingId,
  onStatusChange,
  onEdit,
}: {
  applications: Application[]
  search: string
  sort: TableSort
  onSort: (key: TableSortKey) => void
  ghostDays: number | null
  today: number
  updatingId: string | null
  onStatusChange: (id: string, status: ApplicationStatus) => void
  onEdit: (application: Application) => void
}) {
  const [limit, setLimit] = useState(PAGE)
  const sorted = sortRows(applications, sort)
  const rows = sorted.slice(0, limit)

  const th = (key: TableSortKey, label: string, className?: string) => {
    const active = sort.key === key
    const Icon = active && sort.dir === 1 ? ArrowUp : ArrowDown
    return (
      <th scope="col" className={className} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => onSort(key)}>
          {label}
          <Icon className="i i-sm" aria-hidden="true" />
        </button>
      </th>
    )
  }

  return (
    <div className="table-wrap">
      <table className="tbl">
        <caption className="sr-only">
          {rows.length === sorted.length ? plural(sorted.length, "application") : `${rows.length} of ${sorted.length} applications`}
        </caption>
        <thead>
          <tr>
            {th("company", "Role and company")}
            {th("status", "Status")}
            <th scope="col">Location</th>
            {th("applied", "Applied")}
            {th("updated", "Last update", "r")}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((a) => {
              const busy = updatingId === a.id
              const left = ghostDays === null ? null : daysUntilGhosted(a, ghostDays, today)
              return (
                <tr key={a.id}>
                  {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the edit button inside has an aria-label; the rule only looks two levels down */}
                  <td>
                    <div className="who">
                      <span className="mono" aria-hidden="true">{initialOf(a.company)}</span>
                      <div>
                        <button type="button" aria-label={`${a.title} at ${a.company}, edit`} onClick={() => onEdit(a)}>
                          <b>{a.title}</b>
                        </button>
                        <span>{a.company}</span>
                      </div>
                    </div>
                  </td>
                  <td className="c-st">
                    <StatusMenu
                      application={a}
                      busy={busy}
                      onStatusChange={onStatusChange}
                      trigger={
                        <button
                          id={statusTriggerId(a.id)}
                          className="st"
                          type="button"
                          aria-busy={busy || undefined}
                          aria-label={busy ? `Updating ${a.company}` : `Change status, currently ${STATUS_LABEL[a.status]}`}
                        >
                          <StatusDot status={a.status} />
                          {STATUS_LABEL[a.status]}
                          <ChevronDown className="i i-sm" aria-hidden="true" />
                        </button>
                      }
                    />
                  </td>
                  <td className="c-loc muted">{a.location ?? "—"}</td>
                  <td className="c-app" data-pre={a.date_applied ? "Applied " : ""}>
                    {a.date_applied ? shortDate(dayOf(a.date_applied)) : <span className="muted">—</span>}
                    {left !== null && left <= 3 && (
                      <span className="quiet-near"> · {left > 0 ? `ghosts in ${plural(left, "day")}` : "ghosts today"}</span>
                    )}
                  </td>
                  <td className="c-upd r muted">{updatedAgo(a, today)}</td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan={5} className="table-empty">
                {search.trim() ? `No applications match “${search.trim()}”.` : "No applications with these statuses."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {sorted.length > rows.length ? (
        <div className="pager">
          <span className="muted">
            1–{rows.length} of {sorted.length}
          </span>
          <button className="btn btn-line" type="button" onClick={() => setLimit((n) => n + PAGE)}>
            Show {Math.min(PAGE, sorted.length - rows.length)} more
          </button>
        </div>
      ) : (
        sorted.length > PAGE && (
          <div className="pager">
            <span className="muted">All {sorted.length} shown</span>
          </div>
        )
      )}
    </div>
  )
}
