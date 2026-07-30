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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
