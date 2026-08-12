import { useState, type FormEvent } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { apiClient } from "@/lib/api-client"
import { todayIsoDate } from "@/lib/utils"
import { isAutofillSuccess, type AutofillResponse } from "@/types/api"

interface AutofillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

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
        openCreateForm({
          job_url: fields.job_url,
          company: fields.company ?? "",
          title: fields.title ?? "",
          location: fields.location,
          salary: fields.salary,
          date_posted: fields.date_posted,
          status: fields.suggested_status,
          date_applied: todayIsoDate(),
        })
        return
      }

      // Unsupported domain or a supported-but-failed parse -- both
      // fall back to the same manual-entry form, pre-filled with
      // only the pasted URL.
      handleOpenChange(false)
      openCreateForm({ job_url: url })
    } catch {
      // Network error, non-2xx, anything else `apiClient.post` threw
      // -- treated identically to the failed/unsupported case so the
      // pasted URL is never lost and the user is never stuck here.
      handleOpenChange(false)
      openCreateForm({ job_url: url })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paste a job link</DialogTitle>
          <DialogDescription>
            Paste a Greenhouse or Workday job posting URL and we&apos;ll try to fill in the
            details for you. Any other link still works -- you&apos;ll just fill in the rest
            yourself.
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
                autoFocus
                required
              />
            </Field>
          </FieldGroup>
        </form>

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
