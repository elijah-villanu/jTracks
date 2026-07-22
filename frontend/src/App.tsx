import { Route, Routes } from "react-router"
import { AppLayout } from "@/components/layout/AppLayout"
import { GuestRoute, ProtectedRoute } from "@/components/ProtectedRoute"
import { ApplicationsPage } from "@/routes/ApplicationsPage"
import { LoginPage } from "@/routes/LoginPage"
import { PlaceholderPage } from "@/routes/PlaceholderPage"
import { SignupPage } from "@/routes/SignupPage"

function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
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
          <Route
            path="profile"
            element={
              <PlaceholderPage
                title="Profile"
                description="Ghost-time settings land in a later milestone (F6)."
              />
            }
          />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
