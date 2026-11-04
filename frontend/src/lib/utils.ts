import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A11y: whether `element` can actually take focus back when a dialog
 * closes -- still in the document (not unmounted by a delete, or by the
 * dialog that opened this one closing) and not `display: none` (e.g. the
 * desktop header actions below `lg`). Base UI's own focus return has no
 * such check and silently drops focus to <body> when its target is gone.
 */
export function canReceiveFocus(element: HTMLElement | null | undefined): element is HTMLElement {
  return !!element && element.isConnected && element.getClientRects().length > 0
}

/** Today's date as `YYYY-MM-DD`, matching the shared contract's date fields and native `<input type="date">`. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}
