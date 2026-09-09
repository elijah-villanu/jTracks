import { Suspense, lazy } from "react"
import { Route, Routes } from "react-router"
import { AppLayout } from "@/components/layout/AppLayout"
import { GuestRoute, ProtectedRoute } from "@/components/ProtectedRoute"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ApplicationsProvider } from "@/lib/applications-context"
import { AnalyticsPage } from "@/routes/AnalyticsPage"
import { ApplicationsPage } from "@/routes/ApplicationsPage"
import { LoginPage } from "@/routes/LoginPage"
import { SettingsPage } from "@/routes/SettingsPage"
import { SignupPage } from "@/routes/SignupPage"

/**
 * F44 (the PRD's Bundle-cost NFR): the landing page is the one route here
 * that is route-level code-split. Everything else is statically imported,
 * so the authenticated app is a single eager graph and `React.lazy` on `/`
 * is what keeps the two apart -- a visitor who signs in and lands on
 * `/app` never downloads the landing chunk, and a visitor on `/` never
 * pays for the app's route modules beyond what the two genuinely share
 * (`SankeyChart`, `RecapCard`, the `ui/` primitives). Verified against a
 * real `vite build` chunk listing, not assumed.
 *
 * A default export is required by `React.lazy`, which is why
 * `LandingPage.tsx` exports default while every other route in this file
 * is a named export.
 */
const LandingPage = lazy(() => import("@/routes/LandingPage"))

function App() {
  return (
    <TooltipProvider>
      <Routes>
        {/*
          F41 (R10.2): `/` is declared outside *both* guards on purpose. Not
          under `ProtectedRoute` (which would redirect a logged-out visitor
          to `/login`), not under `GuestRoute` (which would bounce a
          signed-in visitor to `/app`), and -- critically -- not under the
          `ApplicationsProvider` wrapper below, which fires
          `GET /applications` from a mount effect. The result is a route
          that renders identically signed in or out and makes no
          authenticated request at all, which is the whole rationale for
          moving the app to `/app` (routing option B).

          The Suspense fallback is intentionally empty rather than a
          spinner: it covers a chunk fetch that is the very first thing the
          browser does on this URL, and a flashed loading state there reads
          as a slower page, not a faster one.
        */}
        <Route
          path="/"
          element={
            <Suspense fallback={null}>
              <LandingPage />
            </Suspense>
          }
        />

        <Route element={<GuestRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
        </Route>

        <Route
          element={
            <ApplicationsProvider>
              <ProtectedRoute />
            </ApplicationsProvider>
          }
        >
          {/*
            F40 (R10.1, approach B): the authenticated app moved from the
            root to `/app` so `/` can be an unconditionally public landing
            page. `path="app"` on the layout route makes the three children
            resolve to `/app`, `/app/analytics` and `/app/profile` without
            repeating the prefix. `/login` and `/signup` deliberately stay
            top-level -- a visitor reaches them from the public page before
            they have an app to be under.
          */}
          <Route path="app" element={<AppLayout />}>
            <Route index element={<ApplicationsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="profile" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </TooltipProvider>
  )
}

export default App
