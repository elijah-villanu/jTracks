import { useContext } from "react"
import { AuthContext, type AuthContextValue } from "@/lib/auth-context"

/**
 * Consumes the auth state set up by `AuthProvider` (see
 * src/lib/auth-context.tsx). Must be used within the provider, which
 * wraps the whole app in main.tsx.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
}
