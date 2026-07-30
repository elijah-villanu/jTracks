import { useEffect, useState, type FormEvent } from "react"
import { Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ALL_STATUSES, STATUS_LABEL } from "@/components/StatusBadge"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { useAuth } from "@/hooks/useAuth"
import { ApiError } from "@/lib/api-client"
import type { ApplicationInput } from "@/lib/applications-context"
import { todayIsoDate } from "@/lib/utils"
import type { Application, ApplicationStatus } from "@/types/api"

const EMPTY_VALUES: ApplicationInput = {
  company: "",
  title: "",
  status: "saved",
  job_url: null,
  location: null,
  salary: null,
  date_posted: null,
  date_saved: null,
  date_applied: null,
  ghost_days_override: null,
  notes: null,
}

function toFormValues(application?: Application): ApplicationInput {
  if (!application) {
    return EMPTY_VALUES
  }

  // Strip the server-managed fields; everything else in `Application`
  // is a 1:1 match for `ApplicationInput`.
  const { id: _id, user_id: _userId, created_at: _createdAt, updated_at: _updatedAt, ...rest } = application
  return rest
}

interface FieldErrors {
  company?: boolean
  title?: boolean
  status?: boolean
  date_applied?: boolean
  ghost_days_override?: boolean
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return (err.body as { message?: string } | undefined)?.message ?? fallback
  }
  return fallback
}

/**
 * F4's add/edit application dialog, rendered once (see AppLayout) and
 * driven entirely by `ApplicationsProvider`'s `formState` -- opening it
 * for create vs. edit, and which application is being edited, are
 * decided by whoever called `openCreateForm()`/`openEditForm()` (the
 * header's Add Job button, or a row's edit button), not by this
 * component. Covers every user-editable field in the shared contract,
 * including F6's `ghost_days_override`.
 */
export function ApplicationFormDialog() {
  const { formState, closeForm, createApplication, updateApplication, deleteApplication } =
    useApplicationsContext()
  const { user } = useAuth()

  const isOpen = formState !== null
  const mode = formState?.mode ?? "create"
  const application = formState?.mode === "edit" ? formState.application : undefined

  const [values, setValues] = useState<ApplicationInput>(EMPTY_VALUES)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Reset the dialog-local state every time it opens (for a new
  // create, a possibly-different application to edit, or -- F5 --  a
  // create seeded with autofill's parsed fields/pasted URL). Merge
  // over EMPTY_VALUES rather than replacing wholesale so any field
  // autofill didn't touch (notes, date_saved, etc.) still defaults
  // sanely instead of ending up `undefined`.
  useEffect(() => {
    if (formState) {
      setValues(
        formState.mode === "edit"
          ? toFormValues(formState.application)
          : { ...EMPTY_VALUES, ...formState.initialValues }
      )
      setFieldErrors({})
      setSubmitError(null)
      setDeleteError(null)
    }
  }, [formState])

  function handleOpenChange(open: boolean) {
    if (!open) {
      closeForm()
    }
  }

  function updateField<K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const errors: FieldErrors = {
      company: values.company.trim().length === 0,
      title: values.title.trim().length === 0,
      status: !values.status,
      // Any status past "saved" implies the application has been
      // applied to -- date_applied is what starts the ghosting clock
      // (see ConfirmAppliedDialog), so it can't be left blank here,
      // whether that status was picked directly on create or set via
      // an edit that skips the row-level Saved->Applied prompt.
      date_applied: values.status !== "saved" && !values.date_applied,
      // `null` means "use the global default" and is always valid; a
      // non-null override must be a positive whole number of days.
      ghost_days_override:
        values.ghost_days_override !== null &&
        (!Number.isInteger(values.ghost_days_override) || values.ghost_days_override <= 0),
    }
    setFieldErrors(errors)

    if (
      errors.company ||
      errors.title ||
      errors.status ||
      errors.date_applied ||
      errors.ghost_days_override
    ) {
      return
    }

    setSubmitError(null)
    setIsSubmitting(true)
    try {
      if (mode === "edit" && application) {
        await updateApplication(application.id, values)
      } else {
        await createApplication(values)
      }
      closeForm()
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Failed to save application. Please try again."))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!application) {
      return
    }

    setDeleteError(null)
    setIsDeleting(true)
    try {
      await deleteApplication(application.id)
      closeForm()
    } catch (err) {
      setDeleteError(extractErrorMessage(err, "Failed to delete application. Please try again."))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit application" : "Add application"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update the details for this application."
              : "Track a new job application in your pipeline."}
          </DialogDescription>
        </DialogHeader>

        <form id="application-form" onSubmit={handleSubmit}>
          <FieldGroup>
            {submitError && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {submitError}
              </p>
            )}

            <Field data-invalid={fieldErrors.company}>
              <FieldLabel htmlFor="application-company">Company</FieldLabel>
              <Input
                id="application-company"
                value={values.company}
                onChange={(event) => updateField("company", event.target.value)}
                aria-invalid={fieldErrors.company}
              />
              {fieldErrors.company && <FieldError>Company is required.</FieldError>}
            </Field>

            <Field data-invalid={fieldErrors.title}>
              <FieldLabel htmlFor="application-title">Job Title</FieldLabel>
              <Input
                id="application-title"
                value={values.title}
                onChange={(event) => updateField("title", event.target.value)}
                aria-invalid={fieldErrors.title}
              />
              {fieldErrors.title && <FieldError>Job title is required.</FieldError>}
            </Field>

            <Field data-invalid={fieldErrors.status}>
              <FieldLabel htmlFor="application-status">Status</FieldLabel>
              <Select
                value={values.status}
                onValueChange={(value) => {
                  if (!value) {
                    return
                  }
                  const nextStatus = value as ApplicationStatus
                  setValues((prev) => ({
                    ...prev,
                    status: nextStatus,
                    // Moving off "saved" implies the user has applied --
                    // default date_applied to today (still editable/
                    // required below) rather than leaving it blank.
                    date_applied:
                      nextStatus !== "saved" && !prev.date_applied
                        ? todayIsoDate()
                        : prev.date_applied,
                  }))
                }}
              >
                <SelectTrigger
                  id="application-status"
                  className="w-full"
                  aria-invalid={fieldErrors.status}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.status && <FieldError>Status is required.</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="application-job-url">Job URL</FieldLabel>
              <Input
                id="application-job-url"
                type="url"
                placeholder="https://..."
                value={values.job_url ?? ""}
                onChange={(event) => updateField("job_url", event.target.value || null)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="application-location">Location</FieldLabel>
                <Input
                  id="application-location"
                  value={values.location ?? ""}
                  onChange={(event) => updateField("location", event.target.value || null)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="application-salary">Salary</FieldLabel>
                <Input
                  id="application-salary"
                  value={values.salary ?? ""}
                  onChange={(event) => updateField("salary", event.target.value || null)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="application-date-posted">Date Posted</FieldLabel>
                <Input
                  id="application-date-posted"
                  type="date"
                  value={values.date_posted ?? ""}
                  onChange={(event) => updateField("date_posted", event.target.value || null)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="application-date-saved">Date Saved</FieldLabel>
                <Input
                  id="application-date-saved"
                  type="date"
                  value={values.date_saved ?? ""}
                  onChange={(event) => updateField("date_saved", event.target.value || null)}
                />
              </Field>
              <Field data-invalid={fieldErrors.date_applied}>
                <FieldLabel htmlFor="application-date-applied">Date Applied</FieldLabel>
                <Input
                  id="application-date-applied"
                  type="date"
                  value={values.date_applied ?? ""}
                  onChange={(event) => updateField("date_applied", event.target.value || null)}
                  aria-invalid={fieldErrors.date_applied}
                />
                {fieldErrors.date_applied && (
                  <FieldError>Date applied is required once status is past Saved.</FieldError>
                )}
              </Field>
            </div>

            <Field data-invalid={fieldErrors.ghost_days_override}>
              <FieldLabel htmlFor="application-ghost-days-override">
                Ghost override (days)
              </FieldLabel>
              <Input
                id="application-ghost-days-override"
                type="number"
                min={1}
                step={1}
                placeholder={`Default: ${user?.ghost_days_default ?? 14} days`}
                value={values.ghost_days_override ?? ""}
                onChange={(event) => {
                  const raw = event.target.value
                  updateField("ghost_days_override", raw === "" ? null : Number(raw))
                }}
                aria-invalid={fieldErrors.ghost_days_override}
              />
              {fieldErrors.ghost_days_override ? (
                <FieldError>Enter a whole number of days greater than 0, or leave blank.</FieldError>
              ) : (
                <FieldDescription>
                  Leave blank to use your global default ({user?.ghost_days_default ?? 14} days).
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="application-notes">Notes</FieldLabel>
              <Textarea
                id="application-notes"
                rows={3}
                value={values.notes ?? ""}
                onChange={(event) => updateField("notes", event.target.value || null)}
              />
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter className="sm:justify-between">
          {mode === "edit" ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isSubmitting || isDeleting}
                  />
                }
              >
                <Trash2 />
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this application?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes {application?.company} — {application?.title} from
                    your pipeline. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {deleteError}
                  </p>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span aria-hidden="true" />
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={closeForm} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" form="application-form" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : mode === "edit" ? "Save changes" : "Add application"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
