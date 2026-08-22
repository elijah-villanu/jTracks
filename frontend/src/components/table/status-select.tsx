import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  ALL_STATUSES,
  STATUS_FOCUS_CLASSES,
  STATUS_COLOR_CLASSES,
  STATUS_LABEL,
} from "@/components/StatusBadge"
import { cn } from "@/lib/utils"
import type { ApplicationStatus } from "@/types/api"

interface StatusSelectProps {
  status: ApplicationStatus
  onChange: (status: ApplicationStatus) => void
  disabled?: boolean
}

/**
 * Per-row "Status Pipeline Dropdown" (UXPLAN.md): an icon-only trigger
 * (just the chevron `SelectTrigger` already renders) next to the
 * `StatusBadge`, which already shows the current status -- showing the
 * value a second time in the trigger would be redundant. Opens the
 * same list of the other six statuses; picking one round-trips
 * through the mocked `PATCH /applications/{id}` before the row
 * visually updates.
 */
export function StatusSelect({ status, onChange, disabled }: StatusSelectProps) {
  return (
    <Select
      value={status}
      disabled={disabled}
      onValueChange={(value) => {
        if (value && value !== status) {
          onChange(value as ApplicationStatus)
        }
      }}
    >
      <SelectTrigger
        size="sm"
        className="w-7 justify-center px-0"
        aria-label={`Change status (currently ${STATUS_LABEL[status]})`}
      />
      <SelectContent>
        {ALL_STATUSES.map((option) => (
          <SelectItem
            key={option}
            value={option}
            className={cn(STATUS_COLOR_CLASSES[option], STATUS_FOCUS_CLASSES[option])}
          >
            {STATUS_LABEL[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
