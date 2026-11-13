import { useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate, type Location } from "react-router"
import { ApiError, apiErrorMessage } from "@/lib/api-client"
import { useAuth } from "@/hooks/useAuth"
import {
  EmailChip,
  EmailField,
  FieldError,
  GoogleButton,
  HiddenUsername,
  PasswordField,
  Soon,
  Step,
  SubmitButton,
  emailProblem,
  useGoogleSignIn,
  useSteps,
} from "@/components/auth/auth-ui"

/**
 * Log in, one question at a time (docs/wireframes/login-v1.html): Google or an email first, then the password.
 * Wired to `useAuth()` exactly as before (POST /auth/login, POST /auth/oauth/google), and sends the visitor back
 * to the page `ProtectedRoute` bounced them from.
 */
export function LoginForm() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { from?: Location; email?: string } | null
  const redirectTo = state?.from?.pathname ?? "/app"

  // Sign up's "Log in instead" brings the email along, so the password is the only question left.
  const steps = useSteps<"email" | "password">(state?.email ? "password" : "email")
  const google = useGoogleSignIn(redirectTo)
  const [email, setEmail] = useState(state?.email ?? "")
  const [password, setPassword] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = emailProblem(email)
    if (problem) {
      setEmailError(problem)
      steps.focusAfterRender()
      return
    }
    setPasswordError(null)
    steps.go("password", "next")
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    if (!password) {
      setPasswordError("Enter your password.")
      steps.focusAfterRender()
      return
    }
    setPasswordError(null)
    setIsSubmitting(true)

    try {
      await login(email, password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      // The backend answers a wrong email or password with one 401 (no hint which), so the message covers both.
      setPasswordError(
        err instanceof ApiError
          ? err.status === 401
            ? "That email and password don’t match. Check the email above and try again."
            : apiErrorMessage(err, "Invalid email or password.")
          : "Something went wrong. Please try again."
      )
      steps.focusAfterRender()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Step steps={steps}>
      {steps.step === "email" ? (
        <>
          <h1 tabIndex={-1}>Log in</h1>
          <div className="auth-body">
            <GoogleButton busy={google.busy} onClick={google.start} />
            {google.failed && <FieldError alert>Google sign-in didn’t finish. Try again, or use your email below.</FieldError>}
            <div className="or" aria-hidden="true">
              or
            </div>
            <form onSubmit={handleEmail} noValidate>
              <EmailField
                autoComplete="username"
                value={email}
                error={emailError}
                onChange={(value) => {
                  setEmail(value)
                  setEmailError(null)
                }}
              />
              <SubmitButton>Continue</SubmitButton>
            </form>
            <p className="alt">
              New here?{" "}
              <Link className="link" to="/signup">
                Register
              </Link>
            </p>
          </div>
        </>
      ) : (
        <>
          <h1 tabIndex={-1}>Enter your password</h1>
          <EmailChip email={email} onChange={() => steps.go("email", "back")} />
          <div className="auth-body">
            <form onSubmit={handlePassword} noValidate>
              <HiddenUsername email={email} />
              <PasswordField
                id="password"
                label="Password"
                autoComplete="current-password"
                value={password}
                error={passwordError}
                onChange={(value) => {
                  setPassword(value)
                  setPasswordError(null)
                }}
                labelEnd={
                  <span className="fld-end">
                    <Link className="link" to="/forgot-password" state={{ email }}>
                      Forgot password?
                    </Link>
                    <Soon />
                  </span>
                }
              />
              <SubmitButton busy={isSubmitting} busyLabel="Logging in…">
                Log in
              </SubmitButton>
            </form>
          </div>
        </>
      )}
    </Step>
  )
}
