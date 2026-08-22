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
import { cn, todayIsoDate } from "@/lib/utils"
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

/** Validated fields in DOM order, for "focus the first invalid control". */
const INVALID_FIELD_ORDER = [
  "company",
  "title",
  "status",
  "date_applied",
  "ghost_days_override",
] as const satisfies readonly (keyof FieldErrors)[]

const FIELD_CONTROL_ID: Record<keyof FieldErrors, string> = {
  company: "application-company",
  title: "application-title",
  status: "application-status",
  date_applied: "application-date-applied",
  ghost_days_override: "application-ghost-days-override",
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
  // F5 autofill outcome (parsed / unsupported / failed / network error).
  const notice = formState?.mode === "create" ? formState.notice : undefined

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

    // A11y (WCAG 3.3.1): this dialog scrolls (`max-h-[85vh] overflow-y-auto`),
    // so a failed submit could leave the offending field entirely off-screen
    // with nothing but the submit button focused. Move focus to the first
    // invalid control -- that both scrolls it into view and makes the screen
    // reader read the field's label plus its now-associated error message.
    const firstInvalid = INVALID_FIELD_ORDER.find((key) => errors[key])
    if (firstInvalid) {
      // Defer a frame so the error nodes (and their ids) exist before focus
      // moves, otherwise `aria-describedby` resolves to nothing.
      requestAnimationFrame(() => {
        document.getElementById(FIELD_CONTROL_ID[firstInvalid])?.focus()
      })
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

        {/*
          A11y: the autofill review notice. `role="status"` (polite) rather
          than `role="alert"` -- even the failure cases are a recoverable
          "fill this in yourself", not an error, and the dialog is opening
          at the same moment, so an assertive announcement would interrupt
          the dialog title/description. Announced *and* visible, so neither
          a screen reader user nor a sighted user has to infer the outcome
          from which inputs happen to be blank.
        */}
        {notice && (
          <p
            role="status"
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              notice.tone === "success"
                ? "border-emerald-600/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-amber-600/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            )}
          >
            {notice.message}
          </p>
        )}

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

            {/*
              A11y (WCAG 3.3.1 Error Identification / 1.3.1 Info and
              Relationships): each input carried `aria-invalid` but was
              never pointed at its own message, so a screen reader
              announced a bare "invalid entry" with no reason -- and if
              the user tabbed back to the field later, nothing at all.
              Every `FieldError`/`FieldDescription` below now has a
              stable id referenced by its input's `aria-describedby`.
            */}
            <Field data-invalid={fieldErrors.company}>
              <FieldLabel htmlFor="application-company">Company</FieldLabel>
              <Input
                id="application-company"
                value={values.company}
                onChange={(event) => updateField("company", event.target.value)}
                aria-invalid={fieldErrors.company}
                aria-describedby={fieldErrors.company ? "application-company-error" : undefined}
              />
              {fieldErrors.company && (
                <FieldError id="application-company-error">Company is required.</FieldError>
              )}
            </Field>

            <Field data-invalid={fieldErrors.title}>
              <FieldLabel htmlFor="application-title">Job Title</FieldLabel>
              <Input
                id="application-title"
                value={values.title}
                onChange={(event) => updateField("title", event.target.value)}
                aria-invalid={fieldErrors.title}
                aria-describedby={fieldErrors.title ? "application-title-error" : undefined}
              />
              {fieldErrors.title && (
                <FieldError id="application-title-error">Job title is required.</FieldError>
              )}
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
                  aria-describedby={fieldErrors.status ? "application-status-error" : undefined}
                >
                  {/*
                    A11y (WCAG 4.1.2): `<SelectValue />` on its own shows
                    Base UI's raw value, so this trigger read "saved" /
                    "interviewing_oa" instead of the real labels, both
                    visually and to a screen reader. Format via
                    STATUS_LABEL, the same map the options use.
                  */}
                  <SelectValue>
                    {(value: ApplicationStatus | null) =>
                      value ? STATUS_LABEL[value] : "Select a status"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.status && (
                <FieldError id="application-status-error">Status is required.</FieldError>
              )}
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
                  aria-describedby={
                    fieldErrors.date_applied ? "application-date-applied-error" : undefined
                  }
                />
                {fieldErrors.date_applied && (
                  <FieldError id="application-date-applied-error">
                    Date applied is required once status is past Saved.
                  </FieldError>
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
                aria-describedby={
                  fieldErrors.ghost_days_override
                    ? "application-ghost-days-override-error"
                    : "application-ghost-days-override-hint"
                }
              />
              {fieldErrors.ghost_days_override ? (
                <FieldError id="application-ghost-days-override-error">
                  Enter a whole number of days greater than 0, or leave blank.
                </FieldError>
              ) : (
                <FieldDescription id="application-ghost-days-override-hint">
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
