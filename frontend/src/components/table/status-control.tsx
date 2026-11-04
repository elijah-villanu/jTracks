import { StatusBadge } from "@/components/StatusBadge"
import { StalenessIndicator } from "@/components/table/staleness-indicator"
import { StatusSelect, statusSelectId } from "@/components/table/status-select"
import type { Application, ApplicationStatus } from "@/types/api"

interface StatusControlProps {
  application: Application
  updatingId: string | null
  onStatusChange: (id: string, status: ApplicationStatus) => void
  /**
   * F51: the board renders these controls inside a column that *is* the
   * status, where repeating it on every card is pure redundancy in a
   * ~288px column. Defaults to `true`, so the table and card renderings
   * are byte-for-byte unaffected. Nothing is lost when it's off: the
   * select trigger's own accessible name already spells out the current
   * status ("Change status (currently Applied)"), so this only drops a
   * visual duplicate, never the programmatic one.
   */
  showBadge?: boolean
}

/**
 * F30/F32/F51: the badge + change control + staleness warning, shared by
 * the table's Status cell, the card rendering and the board card so all
 * three go through the same `onStatusChange` -> `handleStatusChange`
 * path (per F32's hard constraint, restated by R16.1's "one shared
 * handler, not two") and can't drift in markup.
 * `statusSelectId(application.id)` stays unique because only *one* of
 * the table/card/board renderings is ever mounted at a time (see
 * ApplicationsPage's view-mode switch and its JS-driven narrow-width
 * swap) -- this is what `ConfirmAppliedDialog`'s `finalFocus`
 * resolves lazily by id, so the Saved -> Applied confirm dialog returns
 * focus to the right control from the board too.
 *
 * Callers own the surrounding layout/background (`STATUS_CELL_CLASSES`,
 * padding) -- this only renders the row of controls itself.
 */
export function StatusControl({
  application,
  updatingId,
  onStatusChange,
  showBadge = true,
}: StatusControlProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showBadge && <StatusBadge status={application.status} />}
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
