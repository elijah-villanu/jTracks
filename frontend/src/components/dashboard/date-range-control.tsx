import { useId, useState } from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldLabel } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { dateToIsoDateString, isoDateStringToDate } from "@/lib/date-range"
import type { DashboardRange } from "@/types/api"

const RANGE_OPTIONS: { value: DashboardRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
]

export interface DateRangeControlProps {
  range: DashboardRange
  onRangeChange: (range: DashboardRange) => void
  /** ISO `YYYY-MM-DD`, only meaningful (and rendered) when `range === "custom"`. */
  start: string | null
  end: string | null
  onStartChange: (value: string | null) => void
  onEndChange: (value: string | null) => void
  /** `aria-label` for the range button group -- callers use distinct copy ("Date range" vs. "Recap range"). */
  ariaLabel: string
  /** Client-side validation error for the current custom range (see `lib/date-range.ts`'s `validateCustomRange`), owned by the caller so it can also gate the actual fetch. */
  error?: string | null
}

/**
 * F13's shared range toggle -- week/month/year/all/custom -- used by both
 * AnalyticsPage (F7) and RecapDialog (F8), which previously each had
 * their own inline 3-/2-option toggle. `custom` reveals a pair of
 * start/end date pickers (shadcn's Calendar + Popover, added via the
 * shadcn CLI for F13) below the toggle.
 *
 * Fully controlled: the parent owns `range`/`start`/`end` state (and
 * feeds them to its own `useDashboardStats`/`useRecap` call) since
 * AnalyticsPage and RecapDialog each need independent range state --
 * this component holds no state of its own.
 */
export function DateRangeControl({
  range,
  onRangeChange,
  start,
  end,
  onStartChange,
  onEndChange,
  ariaLabel,
  error,
}: DateRangeControlProps) {
  // A11y: the calendar popovers are controlled so that choosing a day
  // closes them. Previously the popover stayed open with focus parked
  // inside the day grid -- not a trap (Escape works), but a keyboard user
  // had to know to press Escape, and the trigger's newly-updated value
  // was never announced. Closing on select returns focus to the trigger,
  // which is then re-announced with the date now in its label.
  const [openPicker, setOpenPicker] = useState<"start" | "end" | null>(null)

  const startId = useId()
  const endId = useId()
  const startLabelId = `${startId}-label`
  const endLabelId = `${endId}-label`
  const errorId = `${startId}-error`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
        {RANGE_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={range === option.value ? "default" : "outline"}
            aria-pressed={range === option.value}
            onClick={() => onRangeChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {range === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          {/*
            A11y (WCAG 4.1.2 Name, Role, Value): `<label for>` pointing at
            a <button> does *not* feed that button's accessible name --
            per the accname spec a button is named by its own contents.
            Both triggers therefore announced identically as "Pick a date,
            button", with no way to tell Start from End. `aria-labelledby`
            chains the visible "Start"/"End" label in front of the
            button's own text, so it now announces "Start Pick a date" /
            "Start Aug 1, 2026". `htmlFor` is kept so clicking the visible
            label still opens the picker.
          */}
          <Field className="w-auto">
            <FieldLabel id={startLabelId} htmlFor={startId}>
              Start
            </FieldLabel>
            <Popover open={openPicker === "start"} onOpenChange={(o) => setOpenPicker(o ? "start" : null)}>
              <PopoverTrigger
                id={startId}
                aria-labelledby={`${startLabelId} ${startId}`}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("justify-start font-normal", !start && "text-muted-foreground")}
                  />
                }
              >
                <CalendarIcon />
                {start ? format(isoDateStringToDate(start), "PP") : "Pick a date"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  autoFocus
                  selected={start ? isoDateStringToDate(start) : undefined}
                  onSelect={(date) => {
                    onStartChange(date ? dateToIsoDateString(date) : null)
                    setOpenPicker(null)
                  }}
                />
              </PopoverContent>
            </Popover>
          </Field>

          <Field className="w-auto">
            <FieldLabel id={endLabelId} htmlFor={endId}>
              End
            </FieldLabel>
            <Popover open={openPicker === "end"} onOpenChange={(o) => setOpenPicker(o ? "end" : null)}>
              <PopoverTrigger
                id={endId}
                aria-labelledby={`${endLabelId} ${endId}`}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("justify-start font-normal", !end && "text-muted-foreground")}
                  />
                }
              >
                <CalendarIcon />
                {end ? format(isoDateStringToDate(end), "PP") : "Pick a date"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  autoFocus
                  selected={end ? isoDateStringToDate(end) : undefined}
                  onSelect={(date) => {
                    onEndChange(date ? dateToIsoDateString(date) : null)
                    setOpenPicker(null)
                  }}
                />
              </PopoverContent>
            </Popover>
          </Field>
        </div>
      )}

      {range === "custom" && error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
