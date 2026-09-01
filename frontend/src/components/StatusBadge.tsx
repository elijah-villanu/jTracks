import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ApplicationStatus } from "@/types/api"

/**
 * Canonical pipeline order (Saved -> Applied -> Interviewing/OA -> Offer /
 * Rejected / Failed Interview/OA / Ghosted), per PRD_V2.md's R1.3 status
 * vocabulary. Shared by the status filter toolbar and each row's
 * status-change control so there's a single source of truth for "every
 * status, in order."
 */
export const ALL_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "interviewing_oa",
  "offer",
  "rejected",
  "failed",
  "ghosted",
]

/**
 * "Failed Interview/OA" is a deliberate, verbose label (per PRD_V2.md) --
 * it must never be shortened to just "Failed" anywhere in the UI, since
 * that would risk being confused with a rejection.
 */
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing_oa: "Interviewing / OA",
  offer: "Offer",
  rejected: "Rejected",
  failed: "Failed Interview/OA",
  ghosted: "Ghosted",
}

/**
 * One color per status, shared by the badge, the status-select's
 * dropdown items, and the table cell background -- so a status reads
 * as the same color everywhere it appears. `failed` uses pink/fuchsia,
 * deliberately distinct from `rejected`'s red, so the two can never be
 * confused at a glance.
 *
 * F28: these `dark:` variants were written before dark mode was
 * reachable (F25) and were untested assumptions. Now measured with a
 * WCAG contrast calculator against the real dark theme's `--background`
 * / `--card` (composited for the `/NN` opacity variants): every status's
 * dark badge text clears 8:1+ against its own tinted background --
 * comfortably past the 4.5:1 AA floor -- so no values changed here. See
 * docs/decisions/magicui-conventions.md for the full numbers, and
 * `STATUS_FOCUS_CLASSES`/`STATUS_CELL_CLASSES` below (also re-verified,
 * also unchanged: focus-state text clears 8:1+, cell-tint text clears
 * 17:1+ since the tint is very subtle against the dark surface).
 */
export const STATUS_COLOR_CLASSES: Record<ApplicationStatus, string> = {
  saved: "bg-slate-100 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300",
  applied: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  interviewing_oa: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  offer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  failed: "bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300",
  ghosted: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
}

/** Focus/keyboard-highlight state for a dropdown item -- same hue, a step darker, rather than falling back to the generic accent gray. */
export const STATUS_FOCUS_CLASSES: Record<ApplicationStatus, string> = {
  saved: "focus:bg-slate-200 focus:text-slate-800 dark:focus:bg-slate-700 dark:focus:text-slate-100",
  applied: "focus:bg-blue-200 focus:text-blue-800 dark:focus:bg-blue-800/70 dark:focus:text-blue-100",
  interviewing_oa: "focus:bg-amber-200 focus:text-amber-900 dark:focus:bg-amber-800/70 dark:focus:text-amber-100",
  offer: "focus:bg-emerald-200 focus:text-emerald-800 dark:focus:bg-emerald-800/70 dark:focus:text-emerald-100",
  rejected: "focus:bg-red-200 focus:text-red-800 dark:focus:bg-red-800/70 dark:focus:text-red-100",
  failed: "focus:bg-pink-200 focus:text-pink-800 dark:focus:bg-pink-800/70 dark:focus:text-pink-100",
  ghosted: "focus:bg-violet-200 focus:text-violet-800 dark:focus:bg-violet-800/70 dark:focus:text-violet-100",
}

/** Lighter tint of the same color, for the table cell background once a status is selected. */
export const STATUS_CELL_CLASSES: Record<ApplicationStatus, string> = {
  saved: "bg-slate-50 dark:bg-slate-900/40",
  applied: "bg-blue-50 dark:bg-blue-950/30",
  interviewing_oa: "bg-amber-50 dark:bg-amber-950/30",
  offer: "bg-emerald-50 dark:bg-emerald-950/30",
  rejected: "bg-red-50 dark:bg-red-950/30",
  failed: "bg-pink-50 dark:bg-pink-950/30",
  ghosted: "bg-violet-50 dark:bg-violet-950/30",
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", STATUS_COLOR_CLASSES[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
