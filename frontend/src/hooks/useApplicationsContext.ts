import { useContext } from "react"
import { ApplicationsContext, type ApplicationsContextValue } from "@/lib/applications-context"

/**
 * Consumes the application state set up by `ApplicationsProvider` (see
 * src/lib/applications-context.tsx). Must be used within the provider,
 * which wraps the protected routed subtree in App.tsx.
 */
export function useApplicationsContext(): ApplicationsContextValue {
  const context = useContext(ApplicationsContext)

  if (!context) {
    throw new Error("useApplicationsContext must be used within an ApplicationsProvider")
  }

  return context
}
