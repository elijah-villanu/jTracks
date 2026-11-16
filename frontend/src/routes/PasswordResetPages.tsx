import { useEffect, useState, type FormEvent } from "react"
import { Link, useLocation, useSearchParams } from "react-router"
import { ChevronLeft } from "lucide-react"
import {
  EmailField,
  FieldError,
  PasswordField,
  Soon,
  Step,
  SubmitButton,
  emailProblem,
  newPasswordProblem,
  useGoogleSignIn,
  useSteps,
} from "@/components/auth/auth-ui"
import { useDocumentTitle } from "@/hooks/useDocumentMetadata"

/*
  Password reset, built from docs/wireframes/login-v1.html ahead of the backend, which has no reset endpoints yet.
  Until it does, the screens show a Soon tag and their submit buttons are disabled. To wire it up: send the email
  in ForgotPasswordPage's handleSubmit (and in ResendHint), save the password in ResetPasswordPage's handleSubmit,
  show the expired screen when the backend rejects a token, then set RESET_LIVE to true.
*/
const RESET_LIVE = false
const RESEND_WAIT_S = 30

/** `/forgot-password`: ask for the email, then say a link is on its way. */
export function ForgotPasswordPage() {
  useDocumentTitle("Reset your password")
  const location = useLocation()
  const steps = useSteps<"email" | "sent">("email")
  const google = useGoogleSignIn("/app")
  // Log in's "Forgot password?" passes the email it already has.
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? "")
  const [emailError, setEmailError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = emailProblem(email)
    if (problem) {
      setEmailError(problem)
      steps.focusAfterRender()
      return
    }
    // Soon: send `email` to the reset endpoint here.
    steps.go("sent", "next")
  }

  return (
    <Step steps={steps}>
      {steps.step === "email" ? (
        <>
          <h1 tabIndex={-1}>Reset your password</h1>
          {!RESET_LIVE && <SoonLine />}
          <p className="auth-sub">Enter the email you log in with. We’ll send a link to choose a new password.</p>
          <div className="auth-body">
            <form onSubmit={handleSubmit} noValidate>
              <EmailField
                autoComplete="username"
                value={email}
                error={emailError}
                onChange={(value) => {
                  setEmail(value)
                  setEmailError(null)
                }}
              />
              <SubmitButton soon={!RESET_LIVE}>Email me a link</SubmitButton>
            </form>
            <p className="fld-hint">
              Signed up with Google? There’s no password to reset.{" "}
              <button className="link" type="button" aria-disabled={google.busy || undefined} onClick={google.start}>
                {google.busy ? "Opening Google…" : "Continue with Google"}
              </button>{" "}
              instead.
            </p>
            {google.failed && <FieldError alert>Google sign-in didn’t finish. Try again.</FieldError>}
          </div>
          <BackToLogin />
        </>
      ) : (
        <>
          <h1 tabIndex={-1}>Check your email</h1>
          <p className="auth-sub">
            If an account uses <b>{email}</b>, a link to reset your password is on its way.
          </p>
          <div className="auth-body">
            <Link className="btn btn-line btn-lg" to="/login">
              Back to log in
            </Link>
            <ResendHint />
          </div>
        </>
      )}
    </Step>
  )
}

/** Resend waits a moment, so a second tap doesn't send a second email before the first could arrive. */
function ResendHint() {
  const [left, setLeft] = useState(RESEND_WAIT_S)
  useEffect(() => {
    if (left === 0) return
    const timer = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])

  return (
    <p className="fld-hint">
      Nothing after a few minutes? Check your spam folder, or{" "}
      {left > 0 ? (
        <span className="resend">send it again in {left}s</span>
      ) : (
        // Soon: resend through the reset endpoint here.
        <button className="link" type="button" onClick={() => setLeft(RESEND_WAIT_S)}>
          send it again
        </button>
      )}
      .
    </p>
  )
}

/** `/reset-password?token=…`: the page the emailed link opens. Without a token there's nothing to reset. */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  useDocumentTitle(token ? "Choose a new password" : "This link has expired")
  const steps = useSteps("new")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fieldError, setFieldError] = useState<{ field: "password" | "confirm"; message: string } | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = newPasswordProblem(password, confirmPassword)
    setFieldError(problem)
    if (problem) {
      steps.focusAfterRender()
      return
    }
    // Soon: send `token` and `password` to the reset endpoint here, then sign in as sign up does and go to /app.
  }

  if (!token) {
    return (
      <Step steps={steps}>
        <h1 tabIndex={-1}>This link has expired</h1>
        <p className="auth-sub">Reset links stop working after a while, and each one works once. Ask for a new one and use it soon after it arrives.</p>
        <div className="auth-body">
          <Link className="btn btn-accent btn-lg" to="/forgot-password">
            Email me a new link
          </Link>
        </div>
        <BackToLogin />
      </Step>
    )
  }

  return (
    <Step steps={steps}>
      <h1 tabIndex={-1}>Choose a new password</h1>
      {!RESET_LIVE && <SoonLine />}
      <div className="auth-body">
        <form onSubmit={handleSubmit} noValidate>
          <PasswordField
            id="password"
            label="New password"
            autoComplete="new-password"
            hint="At least 8 characters."
            value={password}
            error={fieldError?.field === "password" ? fieldError.message : null}
            onChange={(value) => {
              setPassword(value)
              if (fieldError?.field === "password") setFieldError(null)
            }}
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            error={fieldError?.field === "confirm" ? fieldError.message : null}
            onChange={(value) => {
              setConfirmPassword(value)
              if (fieldError?.field === "confirm") setFieldError(null)
            }}
          />
          <SubmitButton soon={!RESET_LIVE}>Save and log in</SubmitButton>
        </form>
      </div>
    </Step>
  )
}

/** The Soon tag, as the line under the heading. */
function SoonLine() {
  return (
    <p className="auth-soon">
      <Soon />
    </p>
  )
}

function BackToLogin() {
  return (
    <div className="after">
      <Link className="btn" to="/login">
        <ChevronLeft className="i" aria-hidden="true" />
        Back to log in
      </Link>
    </div>
  )
}
