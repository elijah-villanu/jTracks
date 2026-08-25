import { useState, type FormEvent } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { apiClient } from "@/lib/api-client"
import { todayIsoDate } from "@/lib/utils"
import { isAutofillSuccess, isAutofillUnsupported, type AutofillResponse } from "@/types/api"

interface AutofillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SOURCE_LABEL = { greenhouse: "Greenhouse", workday: "Workday" } as const

/**
 * F5's "Paste a Link" entry point: a small dialog with just a URL
 * input that calls the mocked `POST /applications/autofill` (see
 * src/mocks/handlers/autofill.ts) and always routes into F4's
 * add/edit form for review, whether that call succeeded, came back
 * unsupported/failed, or threw outright. Per PRD.md, there is no dead
 * end here and the pasted URL is never lost -- every path closes this
 * dialog and calls `openCreateForm` with at least `job_url` set.
 */
export function AutofillDialog({ open, onOpenChange }: AutofillDialogProps) {
  const { openCreateForm } = useApplicationsContext()
  const [url, setUrl] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  function reset() {
    setUrl("")
    setIsSubmitting(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      reset()
    }
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!url.trim() || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await apiClient.post<AutofillResponse>("/applications/autofill", { url })

      if (isAutofillSuccess(response)) {
        const { fields } = response
        handleOpenChange(false)
        openCreateForm(
          {
            job_url: fields.job_url,
            company: fields.company ?? "",
            title: fields.title ?? "",
            location: fields.location,
            salary: fields.salary,
            date_posted: fields.date_posted,
            status: fields.suggested_status,
            date_applied: todayIsoDate(),
          },
          {
            tone: "success",
            message: `Filled in from this ${SOURCE_LABEL[response.source]} posting. Check the details below before saving.`,
          }
        )
        return
      }

      // Unsupported domain or a supported-but-failed parse -- both
      // fall back to the same manual-entry form, pre-filled with
      // only the pasted URL. A11y: they no longer fall back *silently*
      // -- each carries its own explanation into the review form, which
      // announces it, so the outcome isn't communicated purely by
      // "some inputs happen to be blank".
      handleOpenChange(false)
      openCreateForm(
        { job_url: url },
        {
          tone: "warning",
          message: isAutofillUnsupported(response)
            ? "We don't support autofill for this site yet, so nothing could be filled in automatically. Your link is saved below — please add the rest yourself."
            : "We couldn't read the details from that posting. Your link is saved below — please add the rest yourself.",
        }
      )
    } catch {
      // Network error, non-2xx, anything else `apiClient.post` threw
      // -- treated identically to the failed/unsupported case so the
      // pasted URL is never lost and the user is never stuck here.
      handleOpenChange(false)
      openCreateForm(
        { job_url: url },
        {
          tone: "warning",
          message:
            "We couldn't reach the autofill service. Your link is saved below — please add the rest yourself.",
        }
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paste a job link</DialogTitle>
          <DialogDescription>
            Paste a job posting URL and we&apos;ll try to fill in the details for you.
          </DialogDescription>
        </DialogHeader>

        <form id="autofill-form" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="autofill-url">Job URL</FieldLabel>
              <Input
                id="autofill-url"
                type="url"
                placeholder="https://boards.greenhouse.io/acme/jobs/12345"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={isSubmitting}
                aria-describedby="autofill-url-hint"
                autoFocus
                required
              />
              <FieldDescription id="autofill-url-hint">
                Greenhouse and Workday links fill in the details automatically. Any other link
                still works — you&apos;ll fill in the rest on the next screen.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>

        {/*
          A11y (WCAG 4.1.3): the only in-flight feedback used to be the
          submit button's label changing to "Fetching job details...".
          Focus stays on that button, so a screen reader never re-reads
          it and the user had no idea anything was happening. This polite
          region announces the wait explicitly.
        */}
        <p role="status" aria-live="polite" className="sr-only">
          {isSubmitting ? "Fetching job details, please wait." : ""}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="autofill-form" disabled={isSubmitting || !url.trim()}>
            {isSubmitting ? "Fetching job details..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
