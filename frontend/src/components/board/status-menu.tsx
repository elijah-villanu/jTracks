import type { ReactElement } from "react"
import { Check } from "lucide-react"
import { MenuContent, StatusDot } from "@/components/layout/app-ui"
import { ALL_STATUSES, STATUS_LABEL } from "@/components/StatusBadge"
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Application, ApplicationStatus } from "@/types/api"

/**
 * The one way to move an application: a menu of every status, the current one
 * checked. Picking one goes through ApplicationsPage's `onStatusChange`, which
 * holds the Saved -> Applied confirm step and the PATCH.
 */
export function StatusMenu({
  application,
  busy,
  onStatusChange,
  trigger,
}: {
  application: Application
  busy: boolean
  onStatusChange: (id: string, status: ApplicationStatus) => void
  trigger: ReactElement
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <MenuContent aria-label={`Status for ${application.company}`}>
        <DropdownMenuRadioGroup
          value={application.status}
          onValueChange={(value: ApplicationStatus) => {
            if (!busy && value !== application.status) onStatusChange(application.id, value)
          }}
        >
          {ALL_STATUSES.map((status) => (
            <DropdownMenuRadioItem key={status} value={status} closeOnClick>
              <StatusDot status={status} />
              {STATUS_LABEL[status]}
              <Check className="i check" aria-hidden="true" />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </MenuContent>
    </DropdownMenu>
  )
}
