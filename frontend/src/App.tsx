import { Route, Routes } from "react-router"
import { AppLayout } from "@/components/layout/AppLayout"
import { GuestRoute, ProtectedRoute } from "@/components/ProtectedRoute"
import { ApplicationsProvider } from "@/lib/applications-context"
import { ApplicationsPage } from "@/routes/ApplicationsPage"
import { LoginPage } from "@/routes/LoginPage"
import { PlaceholderPage } from "@/routes/PlaceholderPage"
import { SettingsPage } from "@/routes/SettingsPage"
import { SignupPage } from "@/routes/SignupPage"

function App() {
  return (
    <Routes>
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
        <Route element={<AppLayout />}>
          <Route index element={<ApplicationsPage />} />
          <Route
            path="analytics"
            element={
              <PlaceholderPage
                title="Analytics"
                description="Dashboard charts land in a later milestone (F7)."
              />
            }
          />
          <Route path="profile" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
