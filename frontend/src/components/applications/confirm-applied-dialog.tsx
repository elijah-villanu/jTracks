import { useEffect, useState, type FormEvent, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { todayIsoDate } from "@/lib/utils"

interface ConfirmAppliedDialogProps {
  /** Non-null (and thus open) only for the Saved -> Applied transition. */
  target: { id: string; company: string } | null
  isSubmitting: boolean
  error: string | null
  onConfirm: (dateApplied: string) => void
  onCancel: () => void
  /**
   * A11y (WCAG 2.4.3): where focus goes when this closes. Unlike every
   * other dialog in the app, this one is opened from state rather than
   * from a `DialogTrigger`, so Base UI has no trigger to restore focus to
   * and was dropping focus to `<body>` -- dumping a keyboard user back at
   * the top of the document and losing their place in the table.
   */
  finalFocusRef?: RefObject<HTMLElement | null>
}

/**
 * PRD-specific confirmation for the Saved -> Applied status transition
 * (see ApplicationsPage's `handleStatusChange`): "moving an entry from
 * Saved to Applied prompts the user to confirm/set the date applied...
 * this date is what starts the ghosting clock." Every other status
 * transition still fires immediately with no prompt.
 */
export function ConfirmAppliedDialog({
  target,
  isSubmitting,
  error,
  onConfirm,
  onCancel,
  finalFocusRef,
}: ConfirmAppliedDialogProps) {
  const [dateApplied, setDateApplied] = useState(todayIsoDate)

  useEffect(() => {
    if (target) {
      setDateApplied(todayIsoDate())
    }
  }, [target])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onConfirm(dateApplied)
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <DialogContent className="sm:max-w-sm" finalFocus={finalFocusRef}>
        <DialogHeader>
          <DialogTitle>Mark as applied?</DialogTitle>
          <DialogDescription>
            Moving {target?.company ?? "this application"} to Applied starts the ghosting clock
            -- confirm or adjust the date you applied.
          </DialogDescription>
        </DialogHeader>

        <form id="confirm-applied-form" onSubmit={handleSubmit}>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Field>
            <FieldLabel htmlFor="confirm-date-applied">Date applied</FieldLabel>
            <Input
              id="confirm-date-applied"
              type="date"
              value={dateApplied}
              onChange={(event) => setDateApplied(event.target.value)}
              required
            />
          </Field>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="confirm-applied-form" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
