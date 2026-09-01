import { AlertTriangle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isStaleInterview, STALE_INTERVIEW_MESSAGE } from "@/lib/staleness"
import type { Application } from "@/types/api"

/**
 * F31/F32: extracted so the table row and the card rendering share the
 * exact same markup for the stale-interview warning -- it must never
 * drift between the two. Renders nothing when the application isn't
 * stale.
 *
 * A11y: the warning was originally a bare focusable `<span>` -- a tab
 * stop with no role, which VoiceOver/NVDA announce as an unlabelled
 * "group"/nothing at all. `role="img"` + `aria-label` gives it a real
 * name and role; the label text stands in for the visually-hidden
 * duplicate, so the warning is still reachable when reading the row
 * linearly (a tooltip that only opens on hover/focus is not).
 */
export function StalenessIndicator({ application }: { application: Application }) {
  if (!isStaleInterview(application)) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            role="img"
            className="inline-flex items-center rounded-sm text-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-amber-500"
            aria-label={STALE_INTERVIEW_MESSAGE}
          />
        }
      >
        <AlertTriangle className="size-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{STALE_INTERVIEW_MESSAGE}</TooltipContent>
    </Tooltip>
  )
}
