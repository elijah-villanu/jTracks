import { useEffect, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { CircleAlert, Eye, EyeOff } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"

/*
  Pieces shared by log in, sign up and password reset (docs/wireframes/login-v1.html).
  Styles: ./auth.css. Every screen asks one question; these are its parts.
*/

export type StepDir = "none" | "next" | "back"

/**
 * Which question is showing, which way it arrived, and where focus goes after the visitor acts:
 * the field with an error, else the notice's button, else the first input, else the heading.
 * A fresh page load leaves focus alone.
 */
export function useSteps<S extends string>(initial: S) {
  const [{ step, dir }, setState] = useState<{ step: S; dir: StepDir }>({ step: initial, dir: "none" })
  const ref = useRef<HTMLDivElement>(null)
  const pending = useRef<"step" | "focus" | null>(null)
  // Written directly rather than through state: React leaves the region's text alone, and this effect can't re-render.
  const liveRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!pending.current || !root) return
    const target =
      root.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      root.querySelector<HTMLElement>(".notice .btn") ??
      root.querySelector<HTMLElement>(".input") ??
      root.querySelector<HTMLElement>("h1")
    target?.focus({ preventScroll: true })
    if (pending.current === "step" && liveRef.current) liveRef.current.textContent = root.querySelector("h1")?.textContent ?? ""
    pending.current = null
  })

  return {
    step,
    dir,
    ref,
    liveRef,
    go(next: S, to: StepDir) {
      pending.current = "step"
      setState({ step: next, dir: to })
    },
    /** Call with the state change that shows an error, so focus lands on what it names. */
    focusAfterRender() {
      pending.current = "focus"
    },
  }
}

/** The question itself. Keyed by step, so each one mounts fresh and plays its entrance. */
export function Step({ steps, children }: { steps: ReturnType<typeof useSteps>; children: ReactNode }) {
  return (
    <>
      <div key={steps.step} ref={steps.ref} className="auth-step" data-dir={steps.dir}>
        {children}
      </div>
      <p ref={steps.liveRef} className="sr-only" aria-live="polite" />
    </>
  )
}

export function emailProblem(email: string): string | null {
  if (!email) return "Enter your email."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That doesn’t look like an email. Check it for a typo."
  return null
}

/** Sign up and reset share the backend's rule (at least 8 characters) and these messages. */
export function newPasswordProblem(password: string, confirm: string): { field: "password" | "confirm"; message: string } | null {
  if (password.length < 8) return { field: "password", message: "Use at least 8 characters." }
  if (password !== confirm) return { field: "confirm", message: "These don’t match. Type the same password in both." }
  return null
}

/** Continue with Google, then on to `redirectTo`. `failed` is for the call site's own message. */
export function useGoogleSignIn(redirectTo: string) {
  const { loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function start() {
    if (busy) return
    setFailed(false)
    setBusy(true)
    try {
      await loginWithGoogle()
      navigate(redirectTo, { replace: true })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return { busy, failed, start }
}

export function Soon() {
  return <span className="soon">Soon</span>
}

export function FieldError({ id, alert, children }: { id?: string; alert?: boolean; children: ReactNode }) {
  return (
    <p className="fld-err" id={id} role={alert ? "alert" : undefined}>
      <CircleAlert className="i" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

export function EmailField({
  value,
  onChange,
  error,
  autoComplete,
}: {
  value: string
  onChange: (value: string) => void
  error: string | null
  autoComplete: "username" | "email"
}) {
  return (
    <div className="fld">
      <label className="fld-label" htmlFor="email">
        Email
      </label>
      <input
        className="input"
        id="email"
        type="email"
        autoComplete={autoComplete}
        spellCheck={false}
        autoCapitalize="off"
        placeholder="name@example.com"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "email-err" : undefined}
      />
      {error && <FieldError id="email-err">{error}</FieldError>}
    </div>
  )
}

export function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  hint,
  error,
  labelEnd,
}: {
  id: string
  label: string
  autoComplete: "current-password" | "new-password"
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: ReactNode
  labelEnd?: ReactNode
}) {
  const [shown, setShown] = useState(false)
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className="fld">
      <div className="fld-row">
        <label className="fld-label" htmlFor={id}>
          {label}
        </label>
        {labelEnd}
      </div>
      <div className="input-wrap">
        <input
          className="input"
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <button className="btn peek" type="button" aria-label="Show password" aria-pressed={shown} onClick={() => setShown(!shown)}>
          {shown ? <EyeOff className="i" aria-hidden="true" /> : <Eye className="i" aria-hidden="true" />}
        </button>
      </div>
      {hint && !error && (
        <p className="fld-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
    </div>
  )
}

/** Password managers pair the saved password with this hidden username. */
export function HiddenUsername({ email }: { email: string }) {
  return <input type="email" autoComplete="username" value={email} readOnly hidden />
}

/**
 * The one blue button per screen. Busy stays focusable (aria-disabled, so the keyboard isn't dropped to <body>);
 * `soon` disables it outright, which also stops Enter from submitting the form.
 */
export function SubmitButton({ busy, busyLabel, soon, children }: { busy?: boolean; busyLabel?: string; soon?: boolean; children: ReactNode }) {
  return (
    <button className="btn btn-accent btn-lg" type="submit" aria-disabled={busy || undefined} disabled={soon}>
      {busy ? (
        <>
          <span className="spin" aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}

export function GoogleButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button className="btn btn-line btn-lg" type="button" aria-disabled={busy || undefined} onClick={onClick}>
      {busy ? (
        <>
          <span className="spin" aria-hidden="true" />
          Opening Google…
        </>
      ) : (
        <>
          <GoogleMark />
          Continue with Google
        </>
      )}
    </button>
  )
}

function GoogleMark() {
  return (
    <svg className="g" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/** The email from step one, with a way back to change it. */
export function EmailChip({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <div className="email-chip">
      <span className="av" aria-hidden="true">
        {email.charAt(0).toUpperCase()}
      </span>
      <span className="em">{email}</span>
      <button className="btn" type="button" onClick={onChange}>
        Change<span className="sr-only"> email</span>
      </button>
    </div>
  )
}
