import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/useAuth"
import { ApiError } from "@/lib/api-client"

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return (err.body as { message?: string } | undefined)?.message ?? fallback
  }
  return fallback
}

/**
 * F6's settings page: the one global, user-editable field from the
 * shared contract (`users.ghost_days_default`, see DATABASE_TASKS.md /
 * PRD.md) -- the number of days of no status update after which an
 * application auto-transitions to Ghosted. Per-application overrides
 * of this value live in F4's form (see application-form-dialog.tsx),
 * not here.
 */
export function SettingsPage() {
  const { user, isLoading, updateSettings } = useAuth()

  const [value, setValue] = useState("")
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Keep the field in sync with the current global default whenever it
  // changes underneath us (e.g. hydration finishing after this page
  // already rendered).
  useEffect(() => {
    if (user) {
      setValue(String(user.ghost_days_default))
    }
  }, [user])

  // Clear the transient "Saved" confirmation a couple seconds after a
  // successful save rather than leaving it up indefinitely.
  useEffect(() => {
    if (savedAt === null) {
      return
    }
    const timeout = window.setTimeout(() => setSavedAt(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [savedAt])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setFieldError("Enter a whole number of days greater than 0.")
      return
    }

    setFieldError(null)
    setSubmitError(null)
    setIsSaving(true)
    try {
      await updateSettings(parsed)
      setSavedAt(Date.now())
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Failed to save settings. Please try again."))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Control how long an application can go without a status update before it's
          automatically marked Ghosted.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      ) : !user ? (
        <p className="text-sm text-muted-foreground">Sign in to manage your settings.</p>
      ) : (
        <Card className="max-w-md">
          <CardContent>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                {submitError && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {submitError}
                  </p>
                )}

                <Field data-invalid={!!fieldError}>
                  <FieldLabel htmlFor="settings-ghost-days-default">
                    Default ghost days
                  </FieldLabel>
                  <Input
                    id="settings-ghost-days-default"
                    type="number"
                    min={1}
                    step={1}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    aria-invalid={!!fieldError}
                  />
                  <FieldDescription>
                    Applications with no status update for this many days are automatically
                    marked Ghosted. Individual applications can override this in their own edit
                    form.
                  </FieldDescription>
                  {fieldError && <FieldError>{fieldError}</FieldError>}
                </Field>
              </FieldGroup>

              <div className="mt-4 flex items-center gap-3">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save"}
                </Button>
                {savedAt !== null && (
                  <span className="text-sm text-muted-foreground">Saved.</span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
