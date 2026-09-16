import { useEffect, useState, type FormEvent } from "react"
import { BlurFade } from "@/components/ui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/useAuth"
import { useDocumentTitle } from "@/hooks/useDocumentMetadata"
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
  useDocumentTitle("Settings")
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
      // Send focus back to the field that needs fixing, so the label and
      // the (now associated) error message are both read out.
      requestAnimationFrame(() => {
        document.getElementById("settings-ghost-days-default")?.focus()
      })
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
        <p role="status" className="text-sm text-muted-foreground">
          Loading settings...
        </p>
      ) : !user ? (
        <p className="text-sm text-muted-foreground">Sign in to manage your settings.</p>
      ) : (
        // Single once-per-mount entrance for the form card -- no numeric
        // KPI on this page, so no NumberTicker; see
        // docs/decisions/magicui-conventions.md.
        <BlurFade delay={0}>
          {/*
            F53 (R16.3): visual-only refinement, following the
            label/helper-text/value rhythm of the Fresha and Optimal
            Workshop settings references -- a titled card section, a rule
            between that title and the field, and the action pinned in
            its own footer strip instead of floating under the input.
            The <form> moved out to wrap the whole card interior purely
            so the submit control can live in `CardFooter`; every id,
            `aria-describedby` string, validation branch, focus-restore
            `requestAnimationFrame` and the "Settings saved." live region
            are unchanged.
          */}
          <Card className="max-w-xl">
            <form onSubmit={handleSubmit}>
              <CardHeader className="border-b">
                {/* A11y (WCAG 1.3.1): a real <h2> under the page's <h1>, same nesting AnalyticsPage uses -- `CardTitle` alone is a <div>. */}
                <CardTitle>
                  <h2>Ghosting</h2>
                </CardTitle>
              </CardHeader>

              <CardContent className="p-4">
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
                    {/*
                      The value is a small integer, so a full-width number
                      input read as an unbounded text field. Capping it
                      keeps the label -> control -> helper column tight,
                      which is the whole point of the reference rhythm.
                    */}
                    <Input
                      id="settings-ghost-days-default"
                      type="number"
                      min={1}
                      step={1}
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      aria-invalid={!!fieldError}
                      // A11y: both the explanatory hint and the validation
                      // message were visually adjacent but programmatically
                      // orphaned -- neither was announced when focus landed
                      // on the input (WCAG 1.3.1 / 3.3.1).
                      aria-describedby={
                        fieldError
                          ? "settings-ghost-days-hint settings-ghost-days-error"
                          : "settings-ghost-days-hint"
                      }
                      className="max-w-28 tabular-nums"
                    />
                    <FieldDescription id="settings-ghost-days-hint" className="max-w-prose text-xs">
                      Applications with no status update for this many days are automatically
                      marked Ghosted. Individual applications can override this in their own edit
                      form.
                    </FieldDescription>
                    {fieldError && (
                      <FieldError id="settings-ghost-days-error">{fieldError}</FieldError>
                    )}
                  </Field>
                </FieldGroup>
              </CardContent>

              <CardFooter className="justify-between gap-3 -m-1">
                {/*
                  A11y (WCAG 4.1.3): the "Saved." confirmation appeared and
                  auto-cleared after 2s with nothing announced -- focus stays
                  on the submit button, whose label flickers back to "Save",
                  so a screen reader user got no confirmation the save
                  succeeded. This is a live region that's always in the DOM
                  (a region only inserted at the moment it gets content is
                  unreliably announced). It now sits opposite the button
                  instead of beside it, but is otherwise untouched -- same
                  role, same aria-live, same content expression.
                */}
                <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
                  {isSaving ? "Saving..." : savedAt !== null ? "Settings saved." : ""}
                </span>
                {/* `focusableWhenDisabled`: see button.tsx -- keeps focus here while saving instead of dropping it to <body>. */}
                <Button type="submit" disabled={isSaving} focusableWhenDisabled>
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </BlurFade>
      )}
    </div>
  )
}
