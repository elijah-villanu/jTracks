import { useEffect, useMemo, useRef, useState } from "react"
import { ConfirmAppliedDialog } from "@/components/applications/confirm-applied-dialog"
import { ApplicationsBoard } from "@/components/board/applications-board"
import { ALL_STATUSES, STATUS_LABEL } from "@/components/StatusBadge"
import { ApplicationsTable } from "@/components/table/applications-table"
import { ApplicationsToolbar, FILTER_BUTTON_ID } from "@/components/table/applications-toolbar"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { useAuth } from "@/hooks/useAuth"
import { useDocumentTitle } from "@/hooks/useDocumentMetadata"
import { useViewMode } from "@/hooks/useViewMode"
import { ApiError, apiErrorMessage } from "@/lib/api-client"
import { todayDay } from "@/lib/days"
import { statusTriggerId, type ColumnSort, type TableSort, type TableSortKey } from "@/lib/tracker"
import type { Application, ApplicationStatus } from "@/types/api"

/**
 * Where focus belongs after an application's status changed: its own status
 * button, found again by id because the board remounts a card in its new
 * column, or the status filter when the card is no longer shown.
 */
function resolveStatusFocusTarget(applicationId: string): HTMLElement | null {
  return document.getElementById(statusTriggerId(applicationId)) ?? document.getElementById(FILTER_BUTTON_ID)
}

/**
 * The Tracker: every application as a status board or a table, with one search
 * box and one status filter shared by both views.
 */
export function ApplicationsPage() {
  useDocumentTitle("Tracker")
  const { user } = useAuth()
  const { applications, isLoading, error, updateApplication, openEditForm } = useApplicationsContext()
  const [viewMode, setViewMode] = useViewMode()

  const [search, setSearch] = useState("")
  const [statuses, setStatuses] = useState<ReadonlySet<ApplicationStatus>>(() => new Set(ALL_STATUSES))
  const [columnSorts, setColumnSorts] = useState<Partial<Record<ApplicationStatus, ColumnSort>>>({})
  const [tableSort, setTableSort] = useState<TableSort>({ key: "updated", dir: -1 })

  const [actionError, setActionError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  // Two polite regions, so a move's result and a filter's result can't talk over each other.
  const [actionStatus, setActionStatus] = useState("")
  const [listStatus, setListStatus] = useState("")

  // Saved -> Applied is the one move that asks first: it sets date_applied, which starts the ghosting clock.
  const [confirmApplied, setConfirmApplied] = useState<{ id: string; company: string } | null>(null)
  const [confirmAppliedError, setConfirmAppliedError] = useState<string | null>(null)
  const [isConfirmingApplied, setIsConfirmingApplied] = useState(false)
  // Only the id is kept; the node is looked up when the dialog closes, since the move remounts it.
  const confirmFocusIdRef = useRef<string | null>(null)

  const today = todayDay()
  const ghostDays = user?.ghost_days_default ?? null

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query
      ? applications.filter((a) => a.company.toLowerCase().includes(query) || a.title.toLowerCase().includes(query))
      : applications
  }, [applications, search])
  const visible = useMemo(() => matches.filter((a) => statuses.has(a.status)), [matches, statuses])
  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>
    for (const a of matches) counts[a.status] += 1
    return counts
  }, [matches])

  // Announce the result of a search or filter change, not each keystroke's re-render.
  const isFirstResult = useRef(true)
  useEffect(() => {
    if (isFirstResult.current) {
      isFirstResult.current = false
      return
    }
    setListStatus(`${visible.length} of ${applications.length} applications shown.`)
  }, [visible.length, applications.length])

  /**
   * Put focus back only if the move lost it (never take it from wherever the
   * user has gone since). Two frames: one for React to commit, one for the
   * menu to finish returning focus to a trigger that may no longer exist.
   */
  function restoreStatusFocus(applicationId: string) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (active && active !== document.body) return
        resolveStatusFocusTarget(applicationId)?.focus()
      })
    )
  }

  const hiddenByFilter = (status: ApplicationStatus) =>
    statuses.has(status) ? "" : " It no longer matches the status filter, so it's hidden."

  async function applyStatusChange(id: string, patch: Partial<Application>) {
    const company = applications.find((a) => a.id === id)?.company ?? "Application"
    setActionError(null)
    setActionStatus(`Updating ${company}...`)
    setUpdatingId(id)
    try {
      await updateApplication(id, patch)
      setActionStatus(
        patch.status ? `${company} moved to ${STATUS_LABEL[patch.status]}.${hiddenByFilter(patch.status)}` : `${company} updated.`
      )
      restoreStatusFocus(id)
    } catch (err) {
      setActionStatus("")
      setActionError(
        err instanceof ApiError ? apiErrorMessage(err, "Failed to update status.") : "Failed to update status. Please try again."
      )
    } finally {
      setUpdatingId(null)
    }
  }

  function handleStatusChange(id: string, status: ApplicationStatus) {
    const current = applications.find((a) => a.id === id)
    if (current?.status === "saved" && status === "applied") {
      confirmFocusIdRef.current = id
      setConfirmAppliedError(null)
      setConfirmApplied({ id, company: current.company })
      return
    }
    void applyStatusChange(id, { status })
  }

  async function handleConfirmApplied(dateApplied: string) {
    if (!confirmApplied) return
    const { id, company } = confirmApplied
    setConfirmAppliedError(null)
    setIsConfirmingApplied(true)
    try {
      await updateApplication(id, { status: "applied", date_applied: dateApplied })
      setConfirmApplied(null)
      setActionStatus(`${company} moved to Applied, dated ${dateApplied}.${hiddenByFilter("applied")}`)
    } catch (err) {
      setConfirmAppliedError(
        err instanceof ApiError ? apiErrorMessage(err, "Failed to update status.") : "Failed to update status. Please try again."
      )
    } finally {
      setIsConfirmingApplied(false)
    }
  }

  function toggleStatus(status: ApplicationStatus) {
    const next = new Set(statuses)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    setStatuses(next)
    setListStatus(`Showing ${next.size} of ${ALL_STATUSES.length} statuses.`)
  }

  function showAll() {
    setStatuses(new Set(ALL_STATUSES))
    setListStatus(`Showing all ${ALL_STATUSES.length} statuses.`)
    document.getElementById(FILTER_BUTTON_ID)?.focus()
  }

  function handleTableSort(key: TableSortKey) {
    setTableSort((prev) => ({
      key,
      dir: prev.key === key ? (prev.dir === 1 ? -1 : 1) : key === "company" || key === "status" ? 1 : -1,
    }))
  }

  const columns = ALL_STATUSES.filter((s) => statuses.has(s))

  return (
    <section className="tracker" data-view={viewMode} aria-labelledby="tracker-title">
      <ApplicationsToolbar
        shownCount={visible.length}
        totalCount={applications.length}
        search={search}
        onSearchChange={setSearch}
        statuses={statuses}
        statusCounts={statusCounts}
        onToggleStatus={toggleStatus}
        onShowAll={showAll}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Two failures, two alerts: a load error must never hide a later move error. */}
      {error && <p role="alert" className="alert">{error}</p>}
      {actionError && <p role="alert" className="alert">{actionError}</p>}
      <p aria-live="polite" aria-atomic="true" className="sr-only">{actionStatus}</p>
      <p aria-live="polite" aria-atomic="true" className="sr-only">{listStatus}</p>

      {isLoading ? (
        <p role="status" className="loading">Loading applications...</p>
      ) : viewMode === "board" ? (
        <ApplicationsBoard
          applications={visible}
          columns={columns}
          searching={search.trim().length > 0}
          columnSorts={columnSorts}
          onColumnSort={(status, sort) => setColumnSorts((prev) => ({ ...prev, [status]: sort }))}
          ghostDays={ghostDays}
          today={today}
          updatingId={updatingId}
          onStatusChange={handleStatusChange}
          onEdit={openEditForm}
          onShowAll={showAll}
        />
      ) : (
        <ApplicationsTable
          applications={visible}
          search={search}
          sort={tableSort}
          onSort={handleTableSort}
          ghostDays={ghostDays}
          today={today}
          updatingId={updatingId}
          onStatusChange={handleStatusChange}
          onEdit={openEditForm}
        />
      )}

      <ConfirmAppliedDialog
        target={confirmApplied}
        isSubmitting={isConfirmingApplied}
        error={confirmAppliedError}
        onConfirm={handleConfirmApplied}
        onCancel={() => {
          setConfirmApplied(null)
          setConfirmAppliedError(null)
        }}
        finalFocus={() => (confirmFocusIdRef.current ? resolveStatusFocusTarget(confirmFocusIdRef.current) : true)}
      />
    </section>
  )
}
