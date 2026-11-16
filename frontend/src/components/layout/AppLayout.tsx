import { useEffect, useRef, useState, type ReactElement, type RefObject } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router"
import { ChartColumn, ChevronDown, Columns3, Link2, LogOut, Monitor, Moon, Plus, Settings2, SquarePen, Sun } from "lucide-react"
import { ApplicationFormDialog } from "@/components/applications/application-form-dialog"
import { AutofillDialog } from "@/components/applications/autofill-dialog"
import { MenuContent } from "@/components/layout/app-ui"
import { Logo } from "@/components/layout/logo"
import { SettingsDialog } from "@/components/layout/settings-dialog"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { useAuth } from "@/hooks/useAuth"
import { useTheme } from "@/hooks/useTheme"
import type { Theme } from "@/lib/theme-context"
import "./app.css"

/** Announced after a client-side route change. Keys track the `/app` prefix. */
const ROUTE_TITLES: Record<string, string> = {
  "/app": "Tracker",
  "/app/analytics": "Analytics",
}

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
]

/**
 * The signed-in shell: a top bar (logo, Tracker and Analytics, one Add menu and
 * the account menu), and on phones a bottom bar with the same three. The
 * add/edit form, the paste-a-link dialog and Settings are mounted once here so
 * every page opens the same ones.
 */
export function AppLayout() {
  const { user, logout } = useAuth()
  const { openCreateForm } = useApplicationsContext()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [isAutofillOpen, setIsAutofillOpen] = useState(false)

  // The control that started an add flow: both dialogs hand focus back to it, since the menu item is gone by then.
  const actionOpenerRef = useRef<HTMLElement | null>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)

  // A route change swaps the page without moving focus or saying anything; move focus to <main> and announce
  // the new page (WCAG 2.4.3 / 4.1.3). Not on first render, so landing on a URL doesn't move focus.
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
    // Await first: navigating before `user` clears would let GuestRoute bounce straight back.
    await logout()
    navigate("/login", { replace: true })
  }

  function setSettings(tab: string | null, replace: boolean) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab) next.set("settings", tab)
        else next.delete("settings")
        return next
      },
      { replace }
    )
  }

  function addMenu(trigger: ReactElement, side: "top" | "bottom", opener: RefObject<HTMLButtonElement | null>) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} />
        <MenuContent aria-label="Add application" side={side}>
          <DropdownMenuItem
            onClick={() => {
              actionOpenerRef.current = opener.current
              setIsAutofillOpen(true)
            }}
          >
            <Link2 className="i" aria-hidden="true" />
            <span>
              Paste a job link
              <span className="sub">Greenhouse and Workday fill in for you</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              actionOpenerRef.current = opener.current
              openCreateForm()
            }}
          >
            <SquarePen className="i" aria-hidden="true" />
            <span>
              Enter details yourself
              <span className="sub">Any job, from anywhere</span>
            </span>
          </DropdownMenuItem>
        </MenuContent>
      </DropdownMenu>
    )
  }

  const email = user?.email ?? ""

  return (
    <div className="app app-shell">
      <a href="#main-content" className="skip">
        Skip to content
      </a>

      <header className="top">
        <Link className="logo" to="/app" aria-label="JourneyJob, Tracker">
          <Logo className="h-6" />
        </Link>
        <nav className="tabs" aria-label="Main">
          <NavLink className="tab" to="/app" end>
            <Columns3 className="i" aria-hidden="true" />
            Tracker
          </NavLink>
          <NavLink className="tab" to="/app/analytics">
            <ChartColumn className="i" aria-hidden="true" />
            Analytics
          </NavLink>
        </nav>
        <div className="top-end">
          {addMenu(
            <button ref={addRef} className="btn btn-ink add" type="button">
              <Plus className="i" aria-hidden="true" />
              Add
              <ChevronDown className="i i-sm" aria-hidden="true" />
            </button>,
            "bottom",
            addRef
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<button ref={avatarRef} className="avatar" type="button" aria-label={`Account menu, ${email}`} />}>
              {email.charAt(0).toUpperCase()}
            </DropdownMenuTrigger>
            <MenuContent aria-label="Account">
              <div className="head">
                <b>{email}</b>
              </div>
              <DropdownMenuItem onClick={() => setSettings("account", false)}>
                <Settings2 className="i" aria-hidden="true" />
                Settings
              </DropdownMenuItem>
              <div className="theme-row">
                <span aria-hidden="true">Theme</span>
                <DropdownMenuRadioGroup className="seg" aria-label="Theme" value={theme} onValueChange={(value: Theme) => setTheme(value)}>
                  {THEME_OPTIONS.map(({ value, label, Icon }) => (
                    <DropdownMenuRadioItem key={value} value={value} aria-label={`${label} theme`} title={label}>
                      <Icon className="i" aria-hidden="true" />
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="i" aria-hidden="true" />
                Log out
              </DropdownMenuItem>
            </MenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* tabIndex -1: a programmatic focus target for the skip link and route changes, not a tab stop. */}
      <main id="main-content" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="bottom" aria-label="Main">
        <NavLink to="/app" end>
          <Columns3 className="i" aria-hidden="true" />
          Tracker
        </NavLink>
        {addMenu(
          <button ref={fabRef} className="btn btn-ink add-fab" type="button" aria-label="Add application">
            <Plus className="i" aria-hidden="true" />
          </button>,
          "top",
          fabRef
        )}
        <NavLink to="/app/analytics">
          <ChartColumn className="i" aria-hidden="true" />
          Analytics
        </NavLink>
      </nav>

      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {routeAnnouncement}
      </p>

      <ApplicationFormDialog returnFocusRef={actionOpenerRef} />
      <AutofillDialog open={isAutofillOpen} onOpenChange={setIsAutofillOpen} returnFocusRef={actionOpenerRef} />
      <SettingsDialog
        tab={searchParams.get("settings")}
        onTabChange={(tab) => setSettings(tab, true)}
        onClose={() => setSettings(null, true)}
        onLogout={handleLogout}
        returnFocusRef={avatarRef}
      />
    </div>
  )
}
