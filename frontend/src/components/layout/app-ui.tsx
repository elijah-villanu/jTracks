import type { ComponentProps, ReactElement } from "react"
import { DropdownMenuContent } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { ApplicationStatus } from "@/types/api"

/**
 * The app's one small note: opens on hover, and on tap or Enter, for the ghost
 * ring and the Analytics "i" buttons. A Popover rather than a Tooltip because a
 * tooltip never opens on touch. Focus stays on the trigger.
 */
export function Note({
  children,
  title,
  body,
  native = true,
}: {
  /** The trigger element. */
  children: ReactElement
  /** Optional bold first line. */
  title?: string
  body: string
  /** False when the trigger is not a <button> (the ring is a span). */
  native?: boolean
}) {
  return (
    <Popover>
      <PopoverTrigger openOnHover delay={120} closeDelay={60} nativeButton={native} render={children} />
      <PopoverContent className="app tip" side="bottom" align="end" sideOffset={6} initialFocus={false}>
        {title && <b>{title}</b>}
        <span>{body}</span>
      </PopoverContent>
    </Popover>
  )
}

/** A menu panel in the app's look (shadcn DropdownMenuContent, restyled by app.css). */
export function MenuContent({ className, ...props }: ComponentProps<typeof DropdownMenuContent>) {
  return <DropdownMenuContent align="end" sideOffset={6} className={cn("app menu", className)} {...props} />
}

export function StatusDot({ status }: { status: ApplicationStatus }) {
  return <span className={`dot dot-${status}`} aria-hidden="true" />
}

/** The Generate recap button's glyph: a 9:16 card. */
export function RecapGlyph() {
  return (
    <svg viewBox="0 0 14 16" className="i" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
      <rect x="1.5" y="0.75" width="11" height="14.5" rx="2" />
      <path d="M3.8 3.4h1.6M6.2 3.4h1.6M8.6 3.4h1.6" strokeWidth="1.5" />
    </svg>
  )
}
