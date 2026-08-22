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
  /** Stable id so callers can return focus to this exact trigger. */
  id?: string
}

/**
 * Id of the status trigger for a given row. Shared with ApplicationsPage,
 * which uses it to hand focus back to the right row after the
 * Saved -> Applied confirmation dialog closes.
 */
export function statusSelectId(applicationId: string): string {
  return `status-select-${applicationId}`
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
/**
 * `busy` (was `disabled`) is deliberately *not* the native `disabled`
 * attribute. The PATCH round-trip starts in the same tick the user picks
 * an item, so by the time Base UI closes the popup and restores focus to
 * the trigger, that trigger would already be `disabled` -- a disabled
 * button cannot take focus, so focus silently fell back to `<body>` and
 * a keyboard/screen-reader user lost their place in the table on every
 * single status change (WCAG 2.4.3 Focus Order). Keeping the button
 * focusable and using `aria-disabled`/`aria-busy` preserves focus while
 * still communicating and enforcing the in-flight state.
 */
export function StatusSelect({ status, onChange, disabled, id }: StatusSelectProps) {
  return (
    <Select
      value={status}
      onValueChange={(value) => {
        if (disabled) {
          return
        }
        if (value && value !== status) {
          onChange(value as ApplicationStatus)
        }
      }}
    >
      <SelectTrigger
        id={id}
        size="sm"
        className={cn("w-7 justify-center px-0", disabled && "opacity-50")}
        aria-disabled={disabled || undefined}
        aria-busy={disabled || undefined}
        aria-label={
          disabled
            ? `Updating status, currently ${STATUS_LABEL[status]}`
            : `Change status (currently ${STATUS_LABEL[status]})`
        }
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
