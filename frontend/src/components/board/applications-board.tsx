import { useId, useState } from "react"
import { CalendarDays, MapPin, Pencil } from "lucide-react"
import { ALL_STATUSES, STATUS_LABEL } from "@/components/StatusBadge"
import { COLUMN_LABEL } from "@/components/table/applications-table"
import { StatusControl } from "@/components/table/status-control"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { cn } from "@/lib/utils"
import type { Application, ApplicationStatus } from "@/types/api"

interface ApplicationsBoardProps {
  applications: Application[]
  totalCount: number
  onStatusChange: (id: string, status: ApplicationStatus) => void
  updatingId: string | null
}

/**
 * R16.1's bloat cap: how many cards a column renders before it hides the
 * rest behind "Show N more". A plain client-side slice, deliberately not
 * a virtualization library -- a 7-column board with a per-column cap
 * never has more than ~84 cards in the DOM at once, which is the same
 * order of magnitude the table already renders, and the scope doesn't
 * justify the dependency or the extra a11y surface a windowed list
 * brings with it.
 */
export const BOARD_INITIAL_CARD_LIMIT = 12

/**
 * The column header's accent bar (R16.1: "column header colors come
 * from FV6's `--status-*` tokens (F28), not new hardcoded values").
 *
 * These read F28's tokens through the `@theme inline` utilities
 * `index.css` already exposes as `--color-status-*`, so they pick up the
 * dark-mode `interviewing_oa` / `offer` swap for free. That's a
 * different layer from `StatusBadge.tsx`'s three maps
 * (`STATUS_COLOR_CLASSES` / `STATUS_FOCUS_CLASSES` /
 * `STATUS_CELL_CLASSES`), which are Tailwind *palette* classes
 * predating the token layer -- this map is deliberately not added
 * beside them, both because it isn't the same kind of value and because
 * exporting another object from that `.tsx` would add an
 * `only-export-components` lint warning to a file that already carries
 * five.
 *
 * Purely decorative (`aria-hidden` at the call site): every column also
 * carries its status label as real text plus a count, so nothing here
 * is conveyed by color alone (WCAG 1.4.1). That matters, because the
 * light-mode `interviewing_oa` / `offer` hexes sit in the same sub-3:1
 * band docs/decisions/magicui-conventions.md already records for the
 * breakdown chart.
 */
const STATUS_ACCENT_CLASSES: Record<ApplicationStatus, string> = {
  saved: "bg-status-saved",
  applied: "bg-status-applied",
  interviewing_oa: "bg-status-interviewing-oa",
  offer: "bg-status-offer",
  rejected: "bg-status-rejected",
  failed: "bg-status-failed",
  ghosted: "bg-status-ghosted",
}

/**
 * Fixed column height (R16.1: "each status column gets a fixed
 * max-height with its own independent vertical scroll, not one
 * page-length scroll per column"). Applied to the card list, not the
 * whole column, so the header/accent and the "Show more" control stay
 * pinned while the cards scroll under them.
 */
const COLUMN_SCROLL_CLASSES = "max-h-[26rem] overflow-y-auto"

const SUMMARY_ID = "applications-board-summary"

/**
 * F51 (R16.1): the status-grouped Board -- an *alternate rendering* of
 * the exact same `visibleApplications` array `ApplicationsTable` and
 * `ApplicationsCardList` receive, never a different data source and
 * never a different mutation path. Every card's status control is the
 * shared `StatusControl`, so a status change from here runs the
 * identical `onStatusChange` -> `handleStatusChange` ->
 * `applyStatusChange` code path (including the Saved -> Applied confirm
 * detour and both of ApplicationsPage's live regions) as the table's.
 *
 * **No drag-and-drop, by design.** `StatusSelect` is the only way to
 * move an application between columns. A real WAI-ARIA-compliant
 * drag-and-drop reorder pattern (keyboard grab/move/drop plus its own
 * live-region choreography) is a substantial separate undertaking, and
 * a mouse-only one would make the board the one surface in this app a
 * keyboard user cannot fully operate.
 *
 * **Horizontal scroll is intentional here.** FV7's no-horizontal-scroll
 * guarantee (F31/F32) covers the Table/card renderings only; R16.1
 * exempts the Board explicitly, because picking a multi-column board at
 * 375px *is* picking a horizontally-scrolling layout. The columns
 * therefore keep a fixed width at every breakpoint and never reflow.
 * The scroller is a focusable `role="region"` so that scroll is
 * reachable with the keyboard (arrow keys / Home / End once focused)
 * rather than being mouse-drag- or touch-only -- which is also what
 * keeps axe's "scrollable region must have keyboard access" rule
 * satisfied for the empty columns, which contain nothing focusable of
 * their own.
 */
export function ApplicationsBoard({
  applications,
  totalCount,
  onStatusChange,
  updatingId,
}: ApplicationsBoardProps) {
  return (
    <div>
      {/*
        Same sentence, same conditional, and the same "N of M" wording as
        the table's <TableCaption> and the card list's summary, so no
        rendering can ever describe the same data differently.
      */}
      <p id={SUMMARY_ID} className="text-sm text-muted-foreground">
        {applications.length === totalCount
          ? `${totalCount} tracked applications.`
          : `Showing ${applications.length} of ${totalCount} tracked applications.`}
      </p>

      {/*
        `relative` is load-bearing, not cosmetic. Each card renders
        visually-hidden `<dt>` labels (`sr-only`), and `sr-only` is
        `position: absolute`. An absolutely-positioned element is clipped by
        an ancestor's `overflow` only when its containing block is inside
        that ancestor -- so while this scroller was `position: static`, those
        `<dt>`s resolved against a containing block *outside* it, escaped the
        `overflow-x-auto` clip, and extended the *document's* scroll width to
        the full 7-column strip (measured 2026px against a 1521px viewport).
        That produced a second, page-level horizontal scrollbar underneath
        the board's own: scrolling it dragged the whole app sideways, header
        included, into blank space. Making this element positioned turns it
        into the containing block for those `<dt>`s, so they are clipped here
        and only this element scrolls. F51 deliberately exempts the *board*
        from FV7's no-horizontal-scroll rule; it never exempted the page.
      */}
      <div
        role="region"
        aria-label="Application board, scrolls horizontally"
        aria-describedby={SUMMARY_ID}
        tabIndex={0}
        className={cn(
          "relative mt-3 flex gap-3 overflow-x-auto rounded-md pb-2",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        )}
      >
        {ALL_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            applications={applications.filter((application) => application.status === status)}
            onStatusChange={onStatusChange}
            updatingId={updatingId}
          />
        ))}
      </div>
    </div>
  )
}

function BoardColumn({
  status,
  applications,
  onStatusChange,
  updatingId,
}: {
  status: ApplicationStatus
  applications: Application[]
  onStatusChange: (id: string, status: ApplicationStatus) => void
  updatingId: string | null
}) {
  const headingId = useId()
  const [isExpanded, setIsExpanded] = useState(false)

  const hiddenCount = Math.max(applications.length - BOARD_INITIAL_CARD_LIMIT, 0)
  const visible = isExpanded ? applications : applications.slice(0, BOARD_INITIAL_CARD_LIMIT)
  const label = STATUS_LABEL[status]

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/30"
    >
      {/*
        The column's only color, straight from F28's `--status-*` tokens
        via `STATUS_ACCENT_CLASSES` -- decorative, and duplicated by the
        heading text right below it.
      */}
      <div aria-hidden="true" className={cn("h-1 w-full", STATUS_ACCENT_CLASSES[status])} />

      {/*
        The count lives *inside* the heading rather than beside it, so a
        screen reader user navigating by heading hears "Applied (12)" --
        the same live count a sighted user reads. It re-renders from
        `applications.length` on every filter/search/status change, so it
        can never disagree with the cards under it.
      */}
      <h2
        id={headingId}
        className="flex items-baseline gap-1.5 px-3 py-2 text-sm font-medium text-foreground"
      >
        {label}
        <span className="text-xs font-normal tabular-nums text-muted-foreground">
          ({applications.length})
        </span>
      </h2>

      {applications.length === 0 ? (
        <p className="mx-3 mb-3 rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          Nothing here yet.
        </p>
      ) : (
        <ul className={cn("flex flex-col gap-2 px-3 pb-3", COLUMN_SCROLL_CLASSES)}>
          {visible.map((application) => (
            <li key={application.id}>
              <BoardCard
                application={application}
                onStatusChange={onStatusChange}
                updatingId={updatingId}
              />
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <div className="border-t border-border p-2">
          {/*
            A11y: kept mounted as a toggle rather than disappearing once
            expanded -- a control that unmounts on activation drops focus
            to <body> and costs a keyboard user their place in the board
            (the same WCAG 2.4.3 failure ConfirmAppliedDialog's
            `finalFocus` exists to avoid). The `aria-label` names the
            column the count belongs to, since "Show 8 more" alone is
            ambiguous across seven simultaneous columns; it still starts
            with the visible text, so WCAG 2.5.3 Label in Name holds.
          */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? `Show fewer ${label} applications`
                : `Show ${hiddenCount} more ${label} applications`
            }
            onClick={() => setIsExpanded((previous) => !previous)}
          >
            {isExpanded ? "Show fewer" : `Show ${hiddenCount} more`}
          </Button>
        </div>
      )}
    </section>
  )
}

function BoardCard({
  application,
  onStatusChange,
  updatingId,
}: {
  application: Application
  onStatusChange: (id: string, status: ApplicationStatus) => void
  updatingId: string | null
}) {
  const { openEditForm } = useApplicationsContext()

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="font-medium break-words text-foreground">{application.company}</p>
            <p className="text-xs break-words text-muted-foreground">{application.title}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${application.company} — ${application.title}`}
            onClick={() => openEditForm(application)}
          >
            <Pencil />
          </Button>
        </div>

        {/*
          Same <dl> pairing the card list uses (WCAG 1.3.1): the icons
          are decorative shorthand for the visually-hidden <dt>, not a
          replacement for it, so the value is still programmatically
          tied to the field name it belongs to.
        */}
        <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <dt className="sr-only">{COLUMN_LABEL.location}</dt>
            <dd className="m-0 break-words">{application.location ?? "—"}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            <dt className="sr-only">{COLUMN_LABEL.date_applied}</dt>
            <dd className="m-0">{application.date_applied ?? "—"}</dd>
          </div>
        </dl>

        {/*
          `showBadge={false}`: the column heading above already states
          the status, and the select trigger's accessible name repeats it
          ("Change status (currently Applied)"), so the badge would be a
          third copy of the same word in a 288px column.
        */}
        <StatusControl
          application={application}
          updatingId={updatingId}
          onStatusChange={onStatusChange}
          showBadge={false}
        />
      </CardContent>
    </Card>
  )
}
