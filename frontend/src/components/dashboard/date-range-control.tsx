import { useId } from "react"
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
  /** ISO `YYYY-MM-DD`, used when `range === "custom"`. */
  start: string | null
  end: string | null
  onStartChange: (value: string | null) => void
  onEndChange: (value: string | null) => void
  /** Names the group ("Range", "Recap range"). */
  ariaLabel: string
  /** From `validateCustomRange`, owned by the caller because it also gates the fetch. */
  error?: string | null
}

/**
 * The range switch shared by Analytics and the recap dialog: a segmented
 * control, plus two date fields for Custom. Fully controlled; it returns a
 * fragment so each caller's own row lays the pieces out.
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
  const errorId = useId()
  const invalid = range === "custom" && Boolean(error)

  return (
    <>
      <div className="seg" role="group" aria-label={ariaLabel}>
        {RANGE_OPTIONS.map((option) => (
          <button key={option.value} type="button" aria-pressed={range === option.value} onClick={() => onRangeChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <span className="custom">
          <input
            className="field"
            type="date"
            aria-label={`${ariaLabel} start`}
            value={start ?? ""}
            onChange={(event) => onStartChange(event.target.value || null)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
          />
          <span>to</span>
          <input
            className="field"
            type="date"
            aria-label={`${ariaLabel} end`}
            value={end ?? ""}
            onChange={(event) => onEndChange(event.target.value || null)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
          />
        </span>
      )}
      {invalid && (
        <p id={errorId} role="alert" className="range-error">
          {error}
        </p>
      )}
    </>
  )
}
