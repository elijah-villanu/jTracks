import { StatusBadge } from "@/components/StatusBadge"
import { StalenessIndicator } from "@/components/table/staleness-indicator"
import { StatusSelect, statusSelectId } from "@/components/table/status-select"
import type { Application, ApplicationStatus } from "@/types/api"

interface StatusControlProps {
  application: Application
  updatingId: string | null
  onStatusChange: (id: string, status: ApplicationStatus) => void
}

/**
 * F30/F32: the badge + change control + staleness warning, shared by the
 * table's Status cell and the card rendering so both go through the same
 * `onStatusChange` -> `handleStatusChange` path (per F32's hard
 * constraint) and can't drift in markup. `statusSelectId(application.id)`
 * stays unique because only one of the table/card renderings is ever
 * mounted at a time (see ApplicationsPage's JS-driven swap) -- this is
 * what `ConfirmAppliedDialog`'s `finalFocusRef` resolves lazily by id.
 *
 * Callers own the surrounding layout/background (`STATUS_CELL_CLASSES`,
 * padding) -- this only renders the row of controls itself.
 */
export function StatusControl({ application, updatingId, onStatusChange }: StatusControlProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={application.status} />
      <StatusSelect
        id={statusSelectId(application.id)}
        status={application.status}
        disabled={updatingId === application.id}
        onChange={(status) => onStatusChange(application.id, status)}
      />
      <StalenessIndicator application={application} />
    </div>
  )
}
