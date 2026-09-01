import { useContext } from "react"
import { ThemeContext, type ThemeContextValue } from "@/lib/theme-context"

/**
 * Consumes the theme state set up by `ThemeProvider` (see
 * src/lib/theme-context.tsx). Must be used within the provider, which
 * wraps the whole app in main.tsx -- mirrors hooks/useAuth.ts's shape.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
