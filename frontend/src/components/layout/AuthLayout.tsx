import { useEffect, useRef, useState } from "react"
import { Link, Outlet, useLocation } from "react-router"
import { CircleAlert, Moon, Sun, X } from "lucide-react"
import { Logo } from "@/components/layout/logo"
import { useAuth } from "@/hooks/useAuth"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"
import { useTheme } from "@/hooks/useTheme"
import "./app.css"
import "@/components/auth/auth.css"

const SESSION_ENDED = "Session ended. You’ve been logged out."

/** First input on the page, else its heading: where focus goes after a route change or the notice closes. */
function focusFirst(main: HTMLElement | null) {
  ;(main?.querySelector<HTMLElement>(".input") ?? main?.querySelector<HTMLElement>("h1"))?.focus({ preventScroll: true })
}

/**
 * The signed-out shell for log in, sign up and password reset (docs/wireframes/login-v1.html): the app's top bar
 * with the logo and a theme button, one centred column, and the session-ended notice. It stays mounted across
 * those routes, so the notice and the bar don't restart when the visitor switches between them.
 */
export function AuthLayout() {
  const { resolvedTheme, setTheme } = useTheme()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const dark = resolvedTheme === "dark"

  // A route change (Register, Log in, Forgot password) swaps the page under the visitor's last click;
  // move focus to the new question and say which page this is. A fresh load leaves focus alone.
  const lastPath = useRef(location.pathname)
  const [announcement, setAnnouncement] = useState("")
  useEffect(() => {
    if (lastPath.current === location.pathname) return
    lastPath.current = location.pathname
    focusFirst(mainRef.current)
    setAnnouncement(mainRef.current?.querySelector("h1")?.textContent ?? "")
  }, [location.pathname])

  return (
    <div className="app app-shell auth-shell">
      <header className="top">
        <Link className="logo" to="/" aria-label="JourneyJob home">
          <Logo className="h-6" />
        </Link>
        <div className="top-end">
          <button
            className="btn icon-btn"
            type="button"
            aria-label="Dark theme"
            aria-pressed={dark}
            onClick={() => setTheme(dark ? "light" : "dark")}
          >
            {dark ? <Sun className="i" aria-hidden="true" /> : <Moon className="i" aria-hidden="true" />}
          </button>
        </div>
        <SessionEndedNotice mainRef={mainRef} />
      </header>

      <main id="main-content" ref={mainRef} className="auth-main">
        <div className="auth">
          <Outlet />
        </div>
      </main>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}

/**
 * Shown when a signed-in session couldn't be refreshed (auth-context's `sessionEnded`), never on a plain visit.
 * Closes with the x, or by itself after 5s: the draining bar is the timer, so when its animation ends the notice
 * closes, and pausing the bar (hover, focus, hidden tab) pauses both.
 */
function SessionEndedNotice({ mainRef }: { mainRef: React.RefObject<HTMLElement | null> }) {
  const { sessionEnded, dismissSessionEnded } = useAuth()
  const reduceMotion = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [tabHidden, setTabHidden] = useState(() => document.hidden)
  const [announcement, setAnnouncement] = useState("")

  useEffect(() => {
    const onChange = () => setTabHidden(document.hidden)
    document.addEventListener("visibilitychange", onChange)
    return () => document.removeEventListener("visibilitychange", onChange)
  }, [])

  // Filled after mount, so the live region exists before its text arrives and screen readers hear it.
  useEffect(() => {
    setAnnouncement(sessionEnded ? SESSION_ENDED : "")
  }, [sessionEnded])

  function close() {
    const el = ref.current
    if (!el || el.dataset.closing) return
    el.dataset.closing = "1"
    // Closing from the keyboard would drop focus to <body>; hand it to the form instead.
    const hadFocus = el.contains(document.activeElement)
    el.animate([{ opacity: 1 }, { opacity: 0, transform: reduceMotion ? "none" : "translateY(-4px)" }], {
      duration: 150,
      easing: "ease-out",
      fill: "forwards",
    }).finished.then(() => {
      dismissSessionEnded()
      if (hadFocus) focusFirst(mainRef.current)
    })
  }

  return (
    <>
      {sessionEnded && (
        <div ref={ref} className="toast" data-paused={tabHidden || undefined}>
          <CircleAlert className="i" aria-hidden="true" />
          <p>{SESSION_ENDED}</p>
          <button className="btn toast-x" type="button" aria-label="Dismiss" onClick={close}>
            <X className="i" aria-hidden="true" />
          </button>
          <span className="toast-bar" aria-hidden="true" onAnimationEnd={close} />
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}
