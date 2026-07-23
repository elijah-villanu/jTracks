import { useMemo, useState } from "react"
import { ALL_STATUSES } from "@/components/StatusBadge"
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
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { ApiError } from "@/lib/api-client"
import type { Application, ApplicationStatus } from "@/types/api"

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
    setActionError(null)
    setUpdatingId(id)
    try {
      await updateApplication(id, patch)
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { message?: string })?.message ?? "Failed to update status.")
          : "Failed to update status. Please try again."
      )
    } finally {
      setUpdatingId(null)
    }
  }

  function handleStatusChange(id: string, status: ApplicationStatus) {
    const current = applications.find((application) => application.id === id)

    if (current?.status === "saved" && status === "applied") {
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

    setConfirmAppliedError(null)
    setIsConfirmingApplied(true)
    try {
      await updateApplication(confirmApplied.id, { status: "applied", date_applied: dateApplied })
      setConfirmApplied(null)
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Every application in your pipeline -- filter, search, sort, and move a row through
          its status right from the table.
        </p>
      </div>

      {(error || actionError) && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ?? actionError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading applications...</p>
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
