import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import { CircleAlert } from "lucide-react"
import { ApiError, apiErrorMessage } from "@/lib/api-client"
import { useAuth } from "@/hooks/useAuth"
import {
  EmailChip,
  EmailField,
  FieldError,
  GoogleButton,
  HiddenUsername,
  PasswordField,
  Step,
  SubmitButton,
  emailProblem,
  newPasswordProblem,
  useGoogleSignIn,
  useSteps,
} from "@/components/auth/auth-ui"

/**
 * Sign up, one question at a time (docs/wireframes/login-v1.html): Google or an email first, then a password
 * typed twice. `User` has no name field, so that's all it asks. Wired to `useAuth()` exactly as before
 * (POST /auth/signup, POST /auth/oauth/google).
 */
export function SignupForm() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const steps = useSteps<"email" | "password">("email")
  const google = useGoogleSignIn("/app")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<{ field: "password" | "confirm"; message: string } | null>(null)
  // A 409 means the email already has an account; anything else the server says goes in `error`.
  const [taken, setTaken] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = emailProblem(email)
    if (problem) {
      setEmailError(problem)
      steps.focusAfterRender()
      return
    }
    setTaken(false)
    setError(null)
    steps.go("password", "next")
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    setTaken(false)
    setError(null)
    const problem = newPasswordProblem(password, confirmPassword)
    setFieldError(problem)
    if (problem) {
      steps.focusAfterRender()
      return
    }
    setIsSubmitting(true)

    try {
      await signup(email, password)
      navigate("/app", { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setTaken(true)
      else
        setError(
          err instanceof ApiError
            ? apiErrorMessage(err, "Could not create your account.")
            : "Something went wrong. Please try again."
        )
      steps.focusAfterRender()
    } finally {
      setIsSubmitting(false)
    }
  }

  function onPasswordChange(field: "password" | "confirm", set: (value: string) => void) {
    return (value: string) => {
      set(value)
      if (fieldError?.field === field) setFieldError(null)
    }
  }

  return (
    <Step steps={steps}>
      {steps.step === "email" ? (
        <>
          <h1 tabIndex={-1}>Create your account</h1>
          <p className="auth-sub">Share your job search journey one step at a time.</p>
          <div className="auth-body">
            <GoogleButton busy={google.busy} onClick={google.start} />
            {google.failed && <FieldError alert>Google sign-up didn’t finish. Try again, or use your email below.</FieldError>}
            <div className="or" aria-hidden="true">
              or
            </div>
            <form onSubmit={handleEmail} noValidate>
              <EmailField
                autoComplete="email"
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
              Have an account?{" "}
              <Link className="link" to="/login">
                Log in
              </Link>
            </p>
          </div>
        </>
      ) : (
        <>
          <h1 tabIndex={-1}>Choose a password</h1>
          <EmailChip email={email} onChange={() => steps.go("email", "back")} />
          <div className="auth-body">
            {taken && (
              <div className="notice" role="alert">
                <CircleAlert className="i" aria-hidden="true" />
                <div>
                  <p>
                    There’s already an account for <b>{email}</b>.
                  </p>
                  <Link className="btn btn-line" to="/login" state={{ email }}>
                    Log in instead
                  </Link>
                </div>
              </div>
            )}
            {error && (
              <div className="notice" role="alert">
                <CircleAlert className="i" aria-hidden="true" />
                <p>{error}</p>
              </div>
            )}
            <form onSubmit={handlePassword} noValidate>
              <HiddenUsername email={email} />
              <PasswordField
                id="password"
                label="Password"
                autoComplete="new-password"
                hint="At least 8 characters."
                value={password}
                error={fieldError?.field === "password" ? fieldError.message : null}
                onChange={onPasswordChange("password", setPassword)}
              />
              <PasswordField
                id="confirm-password"
                label="Confirm password"
                autoComplete="new-password"
                value={confirmPassword}
                error={fieldError?.field === "confirm" ? fieldError.message : null}
                onChange={onPasswordChange("confirm", setConfirmPassword)}
              />
              <SubmitButton busy={isSubmitting} busyLabel="Creating your account…">
                Create account
              </SubmitButton>
            </form>
          </div>
        </>
      )}
    </Step>
  )
}
