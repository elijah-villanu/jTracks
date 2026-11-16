import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowDownZA,
  ArrowUpNarrowWide,
  Check,
  ChevronsUpDown,
  MapPin,
} from "lucide-react"
import { MenuContent, Note, StatusDot } from "@/components/layout/app-ui"
import { StatusMenu } from "@/components/board/status-menu"
import { STATUS_LABEL } from "@/components/StatusBadge"
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { dayOf, shortDate } from "@/lib/days"
import {
  COLUMN_COMPARE,
  COLUMN_SORTS,
  ghostRing,
  initialOf,
  statusTriggerId,
  type ColumnSort,
  type GhostRing,
} from "@/lib/tracker"
import type { Application, ApplicationStatus } from "@/types/api"

/**
 * How many cards a column draws before "Show N more". A plain slice, not
 * virtualization: seven capped columns keep the DOM about the size of the table.
 */
export const BOARD_INITIAL_CARD_LIMIT = 12

const SORT_ICON: Record<ColumnSort, typeof ArrowDownAZ> = {
  new: ArrowDownWideNarrow,
  old: ArrowUpNarrowWide,
  az: ArrowDownAZ,
  za: ArrowDownZA,
}

const EMPTY: Record<ApplicationStatus, string> = {
  saved: "Nothing saved. Jobs you want to come back to land here.",
  applied: "No applications waiting on a reply.",
  interviewing_oa: "No interviews in progress right now.",
  offer: "No offers yet.",
  rejected: "No rejections.",
  failed: "No interviews lost.",
  ghosted: "Nothing has gone quiet.",
}

export interface BoardProps {
  /** Already searched and status-filtered. */
  applications: Application[]
  /** The statuses picked in the filter, in pipeline order: one column each. */
  columns: ApplicationStatus[]
  searching: boolean
  columnSorts: Partial<Record<ApplicationStatus, ColumnSort>>
  onColumnSort: (status: ApplicationStatus, sort: ColumnSort) => void
  ghostDays: number | null
  today: number
  updatingId: string | null
  onStatusChange: (id: string, status: ApplicationStatus) => void
  onEdit: (application: Application) => void
  onShowAll: () => void
}

/**
 * The status board: one 300px column per status, each scrolling on its own,
 * and one horizontal scrollbar for the whole board on the window's bottom edge.
 * No drag and drop: the Move menu is the way to change a status, so the board
 * works the same with a keyboard.
 */
export function ApplicationsBoard(props: BoardProps) {
  const { columns, onShowAll } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<ApplicationStatus>>(new Set())

  // The fades: hidden at whichever end the board is scrolled to, and lifted above the scrollbar.
  const updateFade = useCallback(() => {
    const wrap = wrapRef.current
    const board = boardRef.current
    if (!wrap || !board) return
    wrap.style.setProperty("--sb", `${board.offsetHeight - board.clientHeight}px`)
    wrap.classList.toggle("at-end", board.scrollLeft + board.clientWidth >= board.scrollWidth - 2)
    wrap.classList.toggle("at-start", board.scrollLeft <= 2)
  }, [])
  useLayoutEffect(updateFade)
  useEffect(() => {
    window.addEventListener("resize", updateFade)
    return () => window.removeEventListener("resize", updateFade)
  }, [updateFade])

  const toggle = (status: ApplicationStatus) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })

  return (
    <div className="board-wrap" ref={wrapRef}>
      <div
        className="board"
        ref={boardRef}
        role="region"
        aria-label="Board, scrolls sideways"
        tabIndex={0}
        onScroll={updateFade}
      >
        {columns.length ? (
          columns.map((status) => (
            <Column
              key={status}
              {...props}
              status={status}
              open={expanded.has(status)}
              onToggle={() => toggle(status)}
            />
          ))
        ) : (
          <div className="board-empty">
            <p>No statuses selected.</p>
            <button className="btn btn-line" type="button" onClick={onShowAll}>
              Show all statuses
            </button>
          </div>
        )}
      </div>
      <div className="board-fade board-fade-l" aria-hidden="true" />
      <div className="board-fade" aria-hidden="true" />
    </div>
  )
}

function Column({
  status,
  open,
  onToggle,
  applications,
  searching,
  columnSorts,
  onColumnSort,
  ...cardProps
}: BoardProps & { status: ApplicationStatus; open: boolean; onToggle: () => void }) {
  const sort = columnSorts[status] ?? "new"
  const sortLabel = COLUMN_SORTS.find((s) => s.value === sort)!.label
  const SortIcon = SORT_ICON[sort]
  const rows = applications.filter((a) => a.status === status).sort(COLUMN_COMPARE[sort])
  const shown = open ? rows : rows.slice(0, BOARD_INITIAL_CARD_LIMIT)
  const hidden = rows.length - BOARD_INITIAL_CARD_LIMIT
  const label = STATUS_LABEL[status]
  const headingId = `col-${status}`

  return (
    <section className="col" aria-labelledby={headingId}>
      <div className="col-head">
        <StatusDot status={status} />
        <h2 id={headingId}>
          {label} <span className="count">{rows.length}</span>
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="btn col-sort"
                type="button"
                aria-label={`Sort ${label}, ${sortLabel.toLowerCase()}`}
                title={sortLabel}
              />
            }
          >
            <SortIcon className="i" aria-hidden="true" />
          </DropdownMenuTrigger>
          <MenuContent aria-label={`Sort ${label}`}>
            <div className="menu-title" aria-hidden="true">Sort {label}</div>
            <DropdownMenuRadioGroup value={sort} onValueChange={(value: ColumnSort) => onColumnSort(status, value)}>
              {COLUMN_SORTS.map(({ value, label: optionLabel }) => {
                const Icon = SORT_ICON[value]
                return (
                  <DropdownMenuRadioItem key={value} value={value} closeOnClick>
                    <Icon className="i" aria-hidden="true" />
                    {optionLabel}
                    <Check className="i check" aria-hidden="true" />
                  </DropdownMenuRadioItem>
                )
              })}
            </DropdownMenuRadioGroup>
          </MenuContent>
        </DropdownMenu>
      </div>
      <div className="col-list">
        {rows.length ? (
          shown.map((a) => <JobCard key={a.id} application={a} {...cardProps} />)
        ) : (
          <p className="col-empty">{searching ? "No matches in this column." : EMPTY[status]}</p>
        )}
        {hidden > 0 && (
          // Stays mounted as a toggle, so focus is not lost when it's pressed.
          <button
            className="btn btn-ghost more"
            type="button"
            aria-expanded={open}
            aria-label={open ? `Show fewer ${label} applications` : `Show ${hidden} more ${label} applications`}
            onClick={onToggle}
          >
            {open ? "Show fewer" : `Show ${hidden} more`}
          </button>
        )}
      </div>
    </section>
  )
}

function JobCard({
  application: a,
  ghostDays,
  today,
  updatingId,
  onStatusChange,
  onEdit,
}: Pick<BoardProps, "ghostDays" | "today" | "updatingId" | "onStatusChange" | "onEdit"> & {
  application: Application
}) {
  const ring = ghostDays === null ? null : ghostRing(a, ghostDays, today)
  const dateIso = a.status === "saved" ? (a.date_saved ?? a.created_at.slice(0, 10)) : a.date_applied
  const busy = updatingId === a.id

  return (
    <article className="job" aria-label={`${a.title} at ${a.company}`}>
      <div className="job-main">
        <div className="job-top">
          <span className="mono" aria-hidden="true">{initialOf(a.company)}</span>
          <span className="job-co">{a.company}</span>
        </div>
        <h3 className="job-title">
          <button className="job-open" type="button" aria-label={`${a.title} at ${a.company}, edit`} onClick={() => onEdit(a)}>
            {a.title}
          </button>
        </h3>
        {a.location && (
          <p className="job-meta">
            <MapPin className="i i-sm" aria-hidden="true" />
            <span>{a.location}</span>
          </p>
        )}
      </div>
      {ring && <Ring ring={ring} />}
      <div className="job-foot">
        <span>{dateIso ? `${a.status === "saved" ? "Saved" : "Applied"} ${shortDate(dayOf(dateIso))}` : "No date"}</span>
        <StatusMenu
          application={a}
          busy={busy}
          onStatusChange={onStatusChange}
          trigger={
            <button
              id={statusTriggerId(a.id)}
              className="btn move"
              type="button"
              title="Change status"
              aria-busy={busy || undefined}
              aria-label={busy ? `Updating ${a.company}` : `Move ${a.company}, currently ${STATUS_LABEL[a.status]}`}
            >
              <ChevronsUpDown className="i" aria-hidden="true" />
            </button>
          }
        />
      </div>
    </article>
  )
}

/** The ghost countdown, drawn in the card's free right-hand space. */
export function Ring({ ring }: { ring: GhostRing }) {
  const C = 2 * Math.PI * 15
  return (
    <Note body={ring.note} native={false}>
      <span className={`gring ${ring.tone}`} role="img" aria-label={ring.label}>
        <svg viewBox="1.25 1.25 33.5 33.5" aria-hidden="true">
          <circle cx="18" cy="18" r="15" className="gring-track" />
          <circle cx="18" cy="18" r="15" className="gring-arc" strokeDasharray={`${(ring.fill * C).toFixed(1)} ${C.toFixed(1)}`} />
        </svg>
        <span aria-hidden="true">{ring.text}</span>
      </span>
    </Note>
  )
}
