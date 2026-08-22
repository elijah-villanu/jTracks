import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router"
import { Briefcase, ClipboardPaste, LogOut, Menu, Plus } from "lucide-react"
import { ApplicationFormDialog } from "@/components/applications/application-form-dialog"
import { AutofillDialog } from "@/components/applications/autofill-dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
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
/** Shared active-state styling for the Tracker/Analytics/Profile nav links. */
function navLinkClassName({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    isActive && "bg-muted text-foreground"
  )
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const { openCreateForm } = useApplicationsContext()
  const navigate = useNavigate()
  const [isAutofillOpen, setIsAutofillOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  async function handleLogout() {
    // Await first: `logout()` clears `user` only in its `finally`, and
    // navigating to `/login` before that lands `GuestRoute` (which reads
    // `user` too) mid-flight -- it would see the still-truthy `user` and
    // immediately bounce back to `/`. Awaiting avoids that flicker; the
    // explicit navigate below is otherwise redundant with `ProtectedRoute`'s
    // reactive redirect-on-`user-null`, but keeps the transition instant.
    await logout()
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

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={navLinkClassName}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
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

          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger render={<Button size="icon" variant="outline" className="sm:hidden" />}>
              <Menu />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="sm:hidden">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Briefcase className="size-5 text-primary" aria-hidden="true" />
                  jTracks
                </SheetTitle>
              </SheetHeader>

              <nav className="flex flex-col gap-1 px-4">
                {NAV_LINKS.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(navLinkClassName({ isActive }), "block w-full")
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>

              <Separator className="my-1" />

              <div className="flex flex-col gap-3 px-4">
                {user && (
                  <span className="text-sm text-muted-foreground">{user.email}</span>
                )}
                <SheetClose
                  render={<Button variant="outline" onClick={() => setIsAutofillOpen(true)} />}
                >
                  <ClipboardPaste />
                  Paste a Link
                </SheetClose>
                <SheetClose render={<Button onClick={() => openCreateForm()} />}>
                  <Plus />
                  Add Job
                </SheetClose>
                <SheetClose render={<Button variant="ghost" onClick={handleLogout} />}>
                  <LogOut />
                  Log out
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
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
