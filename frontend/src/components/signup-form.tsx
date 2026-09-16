import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import { ApiError } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/useAuth"
import { BlurFade } from "@/components/ui/blur-fade"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/**
 * F2 signup form. Adapted from the shadcn `signup-01` block, wired to
 * `useAuth()` -- see src/lib/auth-context.tsx. `User` (src/types/api.ts)
 * has no name field, so this only collects email/password + a
 * client-side password confirmation check.
 */
export function SignupForm({ className, ...props }: React.ComponentProps<typeof Card>) {
  const { signup, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [mismatch, setMismatch] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      // A11y: this used to only render a generic banner at the top of the
      // form while focus stayed on the submit button, leaving no way to
      // tell *which* field was wrong. Now the offending field is marked
      // invalid and focused.
      setMismatch(true)
      requestAnimationFrame(() => {
        document.getElementById("confirm-password")?.focus()
      })
      return
    }

    setMismatch(false)
    setIsSubmitting(true)

    try {
      await signup(email, password)
      navigate("/app", { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.body as { message?: string })?.message ?? "Could not create your account.")
          : "Something went wrong. Please try again."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleGoogleSignup() {
    setError(null)
    setIsSubmitting(true)

    try {
      await loginWithGoogle()
      navigate("/app", { replace: true })
    } catch {
      setError("Something went wrong signing up with Google. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    // Single entrance for the whole auth card -- see
    // docs/decisions/magicui-conventions.md. Same as login-form.tsx: the
    // looping BorderBeam that used to sit here was removed app-wide
    // 2026-09-15 (WCAG 2.2.2).
    <BlurFade delay={0}>
      <Card className={cn(className)} {...props}>
        <CardHeader>
          {/*
            A11y (WCAG 1.3.1 / 2.4.6): `CardTitle` renders a plain <div>, so
            this route had no heading at all -- screen reader users landing
            here found an unstructured page with nothing to navigate by.
            Tailwind's preflight resets heading typography, so the nested
            <h1> is visually identical.
          */}
          {/*
            F58/R17.1: this is the page's app-H1 role (600), not CardTitle's
            own default (font-medium/500) -- overridden at this call site
            rather than in the shared primitive, which also backs unrelated,
            lighter sub-section titles elsewhere (e.g. AnalyticsPage's
            "Status breakdown").
          */}
          <CardTitle className="font-semibold">
            <h1>Create an account</h1>
          </CardTitle>
          <CardDescription>
            Enter your information below to create your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  // A11y (WCAG 1.3.5): see login-form.tsx.
                  autoComplete="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  aria-describedby="signup-email-hint"
                />
                {/*
                  A11y: these hints sat next to their inputs visually but were
                  never referenced by `aria-describedby`, so the password rule
                  ("at least 8 characters") was invisible to screen reader
                  users until the browser rejected the submit.
                */}
                <FieldDescription id="signup-email-hint">
                  We&apos;ll use this to contact you. We will not share your email
                  with anyone else.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                  aria-describedby="signup-password-hint"
                />
                <FieldDescription id="signup-password-hint">
                  Must be at least 8 characters long.
                </FieldDescription>
              </Field>
              <Field data-invalid={mismatch}>
                <FieldLabel htmlFor="confirm-password">
                  Confirm Password
                </FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  aria-describedby={
                    mismatch
                      ? "signup-confirm-password-hint signup-confirm-password-error"
                      : "signup-confirm-password-hint"
                  }
                  aria-invalid={mismatch || undefined}
                />
                <FieldDescription id="signup-confirm-password-hint">
                  Re-enter the same password to confirm it.
                </FieldDescription>
                {mismatch && (
                  <FieldError id="signup-confirm-password-error">
                    Passwords do not match.
                  </FieldError>
                )}
              </Field>
              <FieldGroup>
                <Field>
                  {/* A11y (WCAG 2.4.3): `focusableWhenDisabled` -- see login-form.tsx. */}
                  <Button type="submit" disabled={isSubmitting} focusableWhenDisabled>
                    {isSubmitting ? "Creating account..." : "Create Account"}
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={isSubmitting}
                    focusableWhenDisabled
                    onClick={handleGoogleSignup}
                  >
                    Sign up with Google
                  </Button>
                  <FieldDescription className="px-6 text-center">
                    Already have an account? <Link to="/login">Sign in</Link>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </BlurFade>
  )
}
