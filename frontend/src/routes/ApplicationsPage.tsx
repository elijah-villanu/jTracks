import { useEffect, useMemo, useRef, useState } from "react"
import { ALL_STATUSES, STATUS_LABEL } from "@/components/StatusBadge"
import { ConfirmAppliedDialog } from "@/components/applications/confirm-applied-dialog"
import {
  ApplicationsToolbar,
  type StatusFilter,
} from "@/components/table/applications-toolbar"
import {
  ApplicationsTable,
  type SortDirection,
  type SortKey,
} from "@/components/table/applications-table"
import { statusSelectId } from "@/components/table/status-select"
import { BlurFade } from "@/components/ui/blur-fade"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { ApiError } from "@/lib/api-client"
import type { Application, ApplicationStatus } from "@/types/api"

/** Human-readable column names for the sort live-region announcement. */
const SORT_KEY_LABEL: Record<SortKey, string> = {
  company: "Company",
  title: "Job Title",
  status: "Status",
  location: "Location",
  date_applied: "Date Applied",
}

/**
 * The Pipeline View (UXPLAN.md): a single sortable/filterable
 * spreadsheet of every application, with a toolbar for filtering by
 * status and a search bar. Replaces F1's static placeholder table.
 */
export function ApplicationsPage() {
  const { applications, isLoading, error, updateApplication } = useApplicationsContext()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  const [actionError, setActionError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // A11y (WCAG 4.1.3 Status Messages): every one of the interactions on
  // this page -- picking a status, typing in search, choosing a filter,
  // clicking a column header -- silently rewrites the table body. Sighted
  // users see rows reflow; a screen reader user got nothing at all. These
  // two polite live regions cover the two kinds of change: a one-shot
  // action result, and "what does the table contain now".
  const [actionStatus, setActionStatus] = useState("")

  // Saved -> Applied is the one transition the PRD requires a confirm
  // step for (it sets `date_applied`, which starts the ghosting
  // clock); every other transition still fires immediately below.
  const [confirmApplied, setConfirmApplied] = useState<{ id: string; company: string } | null>(
    null
  )
  const [confirmAppliedError, setConfirmAppliedError] = useState<string | null>(null)
  const [isConfirmingApplied, setIsConfirmingApplied] = useState(false)

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDirection("asc")
    }
  }

  async function applyStatusChange(id: string, patch: Partial<Application>) {
    const company = applications.find((application) => application.id === id)?.company ?? "Application"

    setActionError(null)
    setActionStatus(`Updating ${company}...`)
    setUpdatingId(id)
    try {
      await updateApplication(id, patch)
      setActionStatus(
        patch.status
          ? `${company} moved to ${STATUS_LABEL[patch.status]}.`
          : `${company} updated.`
      )
    } catch (err) {
      setActionStatus("")
      setActionError(
        err instanceof ApiError
          ? ((err.body as { message?: string })?.message ?? "Failed to update status.")
          : "Failed to update status. Please try again."
      )
    } finally {
      setUpdatingId(null)
    }
  }

  // A11y (WCAG 2.4.3 Focus Order): ConfirmAppliedDialog is opened from
  // state rather than from a `DialogTrigger`, so Base UI has no trigger
  // element to hand focus back to on close -- focus was being dropped to
  // <body>, dumping a keyboard user at the top of the document and
  // costing them their place in the table. Point Base UI's `finalFocus`
  // at the row's status trigger instead. Resolved lazily from the id
  // (rather than captured from `document.activeElement` at open time,
  // which is the *select popup item* and is unmounted by the time the
  // dialog closes) and re-read on close, so it still works if the row
  // re-rendered while the dialog was open.
  const confirmFocusRef = useRef<HTMLElement | null>(null)

  function trackConfirmFocusTarget(applicationId: string) {
    confirmFocusRef.current = document.getElementById(statusSelectId(applicationId))
  }

  function handleStatusChange(id: string, status: ApplicationStatus) {
    const current = applications.find((application) => application.id === id)

    if (current?.status === "saved" && status === "applied") {
      trackConfirmFocusTarget(id)
      setConfirmAppliedError(null)
      setConfirmApplied({ id, company: current.company })
      return
    }

    void applyStatusChange(id, { status })
  }

  async function handleConfirmApplied(dateApplied: string) {
    if (!confirmApplied) {
      return
    }

    const { id, company } = confirmApplied
    setConfirmAppliedError(null)
    setIsConfirmingApplied(true)
    try {
      await updateApplication(id, { status: "applied", date_applied: dateApplied })
      // Re-resolve the focus target: the row just re-rendered with its new
      // status, so the node captured when the dialog opened may be stale.
      trackConfirmFocusTarget(id)
      setConfirmApplied(null)
      // This path bypasses `applyStatusChange`, so it has to do its own
      // announcing -- otherwise the one status transition that takes an
      // extra confirmation step was also the only one that completed
      // silently.
      setActionStatus(`${company} moved to Applied, dated ${dateApplied}.`)
    } catch (err) {
      setConfirmAppliedError(
        err instanceof ApiError
          ? ((err.body as { message?: string })?.message ?? "Failed to update status.")
          : "Failed to update status. Please try again."
      )
    } finally {
      setIsConfirmingApplied(false)
    }
  }

  function handleCancelApplied() {
    setConfirmApplied(null)
    setConfirmAppliedError(null)
  }

  const visibleApplications = useMemo(() => {
    const query = search.trim().toLowerCase()

    const filtered = applications.filter((application) => {
      const matchesStatus = statusFilter === "all" || application.status === statusFilter
      const matchesSearch =
        query.length === 0 ||
        application.company.toLowerCase().includes(query) ||
        application.title.toLowerCase().includes(query)

      return matchesStatus && matchesSearch
    })

    if (!sortKey) {
      return filtered
    }

    const direction = sortDirection === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => direction * compareByKey(a, b, sortKey))
  }, [applications, statusFilter, search, sortKey, sortDirection])

  // Announce the *result* of filtering/sorting, not the keystroke. Skipped
  // on the initial render (the table caption already states the count when
  // the page is first read).
  const [tableStatus, setTableStatus] = useState("")
  const isFirstResultRender = useRef(true)

  useEffect(() => {
    if (isFirstResultRender.current) {
      isFirstResultRender.current = false
      return
    }

    const sortSuffix = sortKey
      ? `, sorted by ${SORT_KEY_LABEL[sortKey]} ${sortDirection === "asc" ? "ascending" : "descending"}`
      : ""

    setTableStatus(
      `${visibleApplications.length} of ${applications.length} application${
        applications.length === 1 ? "" : "s"
      } shown${sortSuffix}.`
    )
  }, [visibleApplications.length, applications.length, sortKey, sortDirection])

  return (
    <div className="flex flex-col gap-4">
      {/*
        Single once-per-mount entrance on the header only -- this page is
        data-dense/interactive (filter, search, sort, per-row status
        changes), so per docs/decisions/magicui-conventions.md's restraint
        rule the toolbar and table are deliberately left untouched: neither
        should re-animate on every keystroke/filter change.
      */}
      <BlurFade delay={0}>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Applications</h1>
          <p className="text-sm text-muted-foreground">
            Every application in your pipeline -- filter, search, sort, and move a row through
            its status right from the table.
          </p>
        </div>
      </BlurFade>

      {(error || actionError) && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ?? actionError}
        </p>
      )}

      {/* Two separate polite regions so an action result and a
          filter/sort result can't clobber each other mid-announcement. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {actionStatus}
      </p>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {tableStatus}
      </p>

      {isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading applications...
        </p>
      ) : (
        <>
          <ApplicationsToolbar
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            search={search}
            onSearchChange={setSearch}
          />
          <ApplicationsTable
            applications={visibleApplications}
            totalCount={applications.length}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onStatusChange={handleStatusChange}
            updatingId={updatingId}
          />
        </>
      )}

      <ConfirmAppliedDialog
        target={confirmApplied}
        isSubmitting={isConfirmingApplied}
        error={confirmAppliedError}
        onConfirm={handleConfirmApplied}
        onCancel={handleCancelApplied}
        finalFocusRef={confirmFocusRef}
      />
    </div>
  )
}

/**
 * Comparator for the ascending-direction sort; ApplicationsPage flips
 * the sign for descending. `status` sorts by pipeline order (Saved ->
 * ... -> Ghosted) rather than alphabetically since that's the
 * meaningful order per UXPLAN.md. Nullable date/location fields fall
 * back to an empty string, so ascending sorts them first and
 * descending sorts them last -- acceptable given how few applications
 * have a null value in either column.
 */
function compareByKey(a: Application, b: Application, key: SortKey): number {
  if (key === "status") {
    return ALL_STATUSES.indexOf(a.status) - ALL_STATUSES.indexOf(b.status)
  }

  const aValue = a[key] ?? ""
  const bValue = b[key] ?? ""
  return aValue.localeCompare(bValue)
}
