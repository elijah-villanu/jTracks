import { Navigate, Outlet, useLocation } from "react-router"
import { useAuth } from "@/hooks/useAuth"

/**
 * Route guard for F2. Renders the nested routes (via `<Outlet />`)
 * only once an authenticated user is loaded; otherwise redirects to
 * `/login`, preserving the attempted destination in location state so
 * LoginPage can send the user back after signing in.
 */
export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

/**
 * Inverse guard for `/login` and `/signup`: if an already-authenticated
 * user lands there (e.g. via back button), send them to the app
 * instead of showing the auth forms again.
 */
export function GuestRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (user) {
    /*
      F40: this has to honour the same `from` state `ProtectedRoute` sets
      above, not just send everyone to `/app`. `/login` renders *inside*
      this guard, so the instant a successful sign-in sets `user`, this
      redirect runs during the re-render and beats `login-form`'s own
      `navigate(redirectTo)` -- whatever the form computed is discarded.
      Sending the visitor to a bare `/app` here is therefore enough to
      swallow the deep link entirely: sign in after being bounced from
      `/app/analytics` and you land on the tracker, not on analytics.

      The race predates F40 (before it, both this redirect and the form's
      fallback were `"/"`, so agreeing on the wrong answer looked like the
      right one), but F40's acceptance requires the return trip to work,
      so the two paths now read the same state and agree deliberately
      rather than by coincidence.
    */
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    return <Navigate to={from ?? "/app"} replace />
  }

  return <Outlet />
}
