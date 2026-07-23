import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router"
import { Briefcase, ClipboardPaste, LogOut, Plus } from "lucide-react"
import { ApplicationFormDialog } from "@/components/applications/application-form-dialog"
import { AutofillDialog } from "@/components/applications/autofill-dialog"
import { Button } from "@/components/ui/button"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { to: "/", label: "Tracker" },
  { to: "/analytics", label: "Analytics" },
  { to: "/profile", label: "Profile" },
] as const

/**
 * Base app shell: logo, nav tabs, and the "Add Job" primary action.
 * Per UXPLAN.md's Dashboard Page Structure. The add/edit application
 * dialog is rendered once here (rather than per-page) since both the
 * header's "Add Job" button and the table's per-row edit button (deep
 * inside ApplicationsPage) need to open the same dialog -- see
 * src/lib/applications-context.tsx's `formState`.
 */
export function AppLayout() {
  const { user, logout } = useAuth()
  const { openCreateForm } = useApplicationsContext()
  const navigate = useNavigate()
  const [isAutofillOpen, setIsAutofillOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate("/login", { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Briefcase className="size-5 text-primary" aria-hidden="true" />
            <span>jTracks</span>
          </div>

          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    isActive && "bg-muted text-foreground"
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.email}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={() => setIsAutofillOpen(true)}>
              <ClipboardPaste />
              Paste a Link
            </Button>
            <Button size="sm" onClick={() => openCreateForm()}>
              <Plus />
              Add Job
            </Button>
            <Button size="sm" variant="ghost" onClick={handleLogout}>
              <LogOut />
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <ApplicationFormDialog />
      <AutofillDialog open={isAutofillOpen} onOpenChange={setIsAutofillOpen} />
    </div>
  )
}
