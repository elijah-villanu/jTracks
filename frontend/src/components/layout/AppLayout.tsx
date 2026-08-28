import { useEffect, useRef, useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router"
import { Briefcase, ClipboardPaste, LogOut, Menu, Plus } from "lucide-react"
import { ApplicationFormDialog } from "@/components/applications/application-form-dialog"
import { AutofillDialog } from "@/components/applications/autofill-dialog"
import { BlurFade } from "@/components/ui/blur-fade"
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

/** Page title announced to screen readers after a client-side route change. */
const ROUTE_TITLES: Record<string, string> = {
  "/": "Applications",
  "/analytics": "Analytics",
  "/profile": "Settings",
}

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
  const location = useLocation()
  const [isAutofillOpen, setIsAutofillOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // A11y: a client-side route change replaces the whole page body without
  // moving focus or firing anything a screen reader notices -- focus stays
  // on the nav link that was just activated and nothing is announced (WCAG
  // 2.4.3 Focus Order / 4.1.3 Status Messages). Move focus to <main> and
  // announce the new page title, but skip the very first render so landing
  // directly on a URL doesn't yank focus out of the document start.
  const mainRef = useRef<HTMLElement>(null)
  const isFirstRender = useRef(true)
  const [routeAnnouncement, setRouteAnnouncement] = useState("")

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    mainRef.current?.focus()
    setRouteAnnouncement(`${ROUTE_TITLES[location.pathname] ?? "Page"} — navigated`)
  }, [location.pathname])

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
      {/*
        A11y (WCAG 2.4.1 Bypass Blocks): the header repeats 3 nav links +
        3-4 action buttons on every page, so a keyboard-only user had to
        tab past all of them to reach the table. Visually hidden until
        focused.
      */}
      <a
        href="#main-content"
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to main content
      </a>

      {/*
        Single once-per-mount entrance for the whole header shell -- see
        docs/decisions/magicui-conventions.md. AppLayout wraps <Outlet />
        rather than being remounted by it, so this only plays once per
        authenticated session (login/refresh), not on every client-side
        route change -- unlike page content, which does remount per route.
        No BorderBeam here: it would be a second simultaneous continuous
        accent alongside the one already on the current page's own
        headline element (Analytics' stat tile, Login/Signup's card), and
        the "one continuous accent per view" rule counts across the whole
        view, not just per-component.
      */}
      <BlurFade delay={0}>
        <header className="border-b border-border">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-2 font-semibold">
              <Briefcase className="size-5 text-primary" aria-hidden="true" />
              <span>jTracks</span>
            </div>

            <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
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

                <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
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
      </BlurFade>

      {/*
        `tabIndex={-1}` makes <main> a programmatic focus target for both
        the skip link and the route-change effect above; it is not in the
        tab order. `outline-none` is safe here because focus is only ever
        moved here programmatically, immediately after a user-initiated
        navigation, and the page heading is what the user hears.
      */}
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none"
      >
        <Outlet />
      </main>

      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {routeAnnouncement}
      </p>

      <ApplicationFormDialog />
      <AutofillDialog open={isAutofillOpen} onOpenChange={setIsAutofillOpen} />
    </div>
  )
}
