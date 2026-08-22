import { useId } from "react"
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
  const startId = useId()
  const endId = useId()

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
          <Field className="w-auto">
            <FieldLabel htmlFor={startId}>Start</FieldLabel>
            <Popover>
              <PopoverTrigger
                id={startId}
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
                  onSelect={(date) => onStartChange(date ? dateToIsoDateString(date) : null)}
                />
              </PopoverContent>
            </Popover>
          </Field>

          <Field className="w-auto">
            <FieldLabel htmlFor={endId}>End</FieldLabel>
            <Popover>
              <PopoverTrigger
                id={endId}
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
                  onSelect={(date) => onEndChange(date ? dateToIsoDateString(date) : null)}
                />
              </PopoverContent>
            </Popover>
          </Field>
        </div>
      )}

      {range === "custom" && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
