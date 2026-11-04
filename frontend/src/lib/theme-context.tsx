import { createContext, useEffect, useMemo, type ReactNode } from "react"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useStoredState } from "@/hooks/useStoredState"

export type Theme = "light" | "dark" | "system"

export interface ThemeContextValue {
  /** The user's stored preference -- may be `"system"`, which is the default for a first-time visitor. */
  theme: Theme
  /** The theme actually painted right now (`"system"` resolved against the live OS setting). */
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

/**
 * F25's persistence key. This is the **single source of truth for the
 * name** -- the only other place it appears is the inline no-flash script
 * in `frontend/index.html`'s `<head>` (which must stay in sync by hand,
 * since that script runs before any JS module graph loads and can't
 * import this constant). If you rename this, update that script too.
 *
 * Not auth material: this stores a UI preference ("light" | "dark" |
 * "system"), never a token, session id, or anything else that would
 * trip F19's "no auth material in localStorage, ever again" rule. F19
 * moved the *access token* into an in-memory store (src/lib/token-store.ts)
 * specifically because tokens are sensitive; a theme name is not, and
 * storing it in localStorage (so it survives a reload, before React even
 * mounts) is exactly what makes the no-flash behavior below possible.
 */
export const THEME_STORAGE_KEY = "jtracks_theme"

const MEDIA_QUERY = "(prefers-color-scheme: dark)"

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system"
}

function applyResolvedTheme(resolved: "light" | "dark") {
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  // Keeps native scrollbars/form controls/the canvas background in sync --
  // see index.css's :root/.dark `color-scheme` declarations.
  root.style.colorScheme = resolved
}

/**
 * Theme provider for F25 -- mirrors the `lib/auth-context.tsx` /
 * `hooks/useTheme.ts` split used by auth. Mounted in `main.tsx` inside
 * `<MotionConfig>` and outside `<BrowserRouter>`, so `/login`, `/signup`
 * and the landing route (F43) are covered too, not just the authenticated
 * tree.
 *
 * `system` tracks the OS setting *live*: it subscribes to
 * `matchMedia("(prefers-color-scheme: dark)")`'s `change` event, so
 * flipping the OS appearance while the tab is open updates the app
 * immediately -- it is not just read once at mount.
 *
 * The actual `.dark` class toggle on `<html>` happens synchronously in
 * the inline script in `index.html` on first paint (no-flash); this
 * provider's job is to keep that class (and localStorage) correct for
 * every render after that, including reacting to `setTheme` calls and
 * live OS changes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useStoredState(THEME_STORAGE_KEY, isTheme, () => "system")
  const systemIsDark = useMediaQuery(MEDIA_QUERY)

  const resolvedTheme: "light" | "dark" = theme === "system" ? (systemIsDark ? "dark" : "light") : theme

  useEffect(() => {
    applyResolvedTheme(resolvedTheme)
  }, [resolvedTheme])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
