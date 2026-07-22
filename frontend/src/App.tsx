import { Route, Routes } from "react-router"
import { AppLayout } from "@/components/layout/AppLayout"
import { ApplicationsPage } from "@/routes/ApplicationsPage"
import { PlaceholderPage } from "@/routes/PlaceholderPage"

function App() {
  return (
    <Routes>
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
    </Routes>
  )
}

export default App
