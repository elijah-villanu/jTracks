import { useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate, type Location } from "react-router"
import { cn } from "@/lib/utils"
import { ApiError } from "@/lib/api-client"
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/**
 * F2 login form. Adapted from the shadcn `login-01` block, wired to
 * `useAuth()` -- see src/lib/auth-context.tsx. Validates required
 * fields / email shape via native HTML5 constraints (the browser
 * withholds the `submit` event until the inputs are valid), and
 * surfaces the mock API's error responses (e.g. bad credentials).
 */
export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { login, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: Location } | null)?.from?.pathname ?? "/app"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await login(email, password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.body as { message?: string })?.message ?? "Invalid email or password.")
          : "Something went wrong. Please try again."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleGoogleLogin() {
    setError(null)
    setIsSubmitting(true)

    try {
      await loginWithGoogle()
      navigate(redirectTo, { replace: true })
    } catch {
      setError("Something went wrong signing in with Google. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {/*
        Single entrance for the whole auth card -- see
        docs/decisions/magicui-conventions.md. The card used to carry a
        looping BorderBeam too; removed app-wide 2026-09-15 (WCAG 2.2.2: an
        endless animation with no way to pause it).
      */}
      <BlurFade delay={0}>
        <Card>
          <CardHeader>
            {/*
              A11y (WCAG 1.3.1 / 2.4.6): `CardTitle` renders a plain <div>, so
              this route previously had no heading element at all. Tailwind's
              preflight resets heading typography, so the nested <h1> is
              visually identical to what shipped.
            */}
            {/*
              F58/R17.1: this is the page's app-H1 role (600), not
              CardTitle's own default (font-medium/500) -- overridden at
              this call site rather than in the shared primitive, which
              also backs unrelated, lighter sub-section titles elsewhere
              (e.g. AnalyticsPage's "Status breakdown").
            */}
            <CardTitle className="font-semibold">
              <h1>Login to your account</h1>
            </CardTitle>
            <CardDescription>
              Enter your email below to login to your account
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
                  {/*
                    A11y (WCAG 1.3.5 Identify Input Purpose, and 3.3.8
                    Accessible Authentication): `autoComplete` tokens let
                    browsers and password managers fill these reliably, so
                    signing in doesn't depend on recalling or retyping
                    credentials.
                  */}
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="m@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <div className="flex items-center">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  {/*
                    A11y (WCAG 2.4.3): `focusableWhenDisabled` on both. A
                    natively disabled button can't hold focus, so activating
                    either one from the keyboard dropped focus to <body> --
                    and on a failed sign-in the user then had to tab back
                    through the whole page to try again.
                  */}
                  <Button type="submit" disabled={isSubmitting} focusableWhenDisabled>
                    {isSubmitting ? "Logging in..." : "Login"}
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={isSubmitting}
                    focusableWhenDisabled
                    onClick={handleGoogleLogin}
                  >
                    Login with Google
                  </Button>
                  <FieldDescription className="text-center">
                    Don&apos;t have an account? <Link to="/signup">Sign up</Link>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </BlurFade>
    </div>
  )
}
