import { Route, Routes } from "react-router"
import { AppLayout } from "@/components/layout/AppLayout"
import { GuestRoute, ProtectedRoute } from "@/components/ProtectedRoute"
import { ApplicationsProvider } from "@/lib/applications-context"
import { AnalyticsPage } from "@/routes/AnalyticsPage"
import { ApplicationsPage } from "@/routes/ApplicationsPage"
import { LoginPage } from "@/routes/LoginPage"
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
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="profile" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
