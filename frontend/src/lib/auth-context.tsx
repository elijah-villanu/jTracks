import { createContext, useCallback, useEffect, useState, type ReactNode } from "react"
import { apiClient, refreshAccessToken, setSessionExpiredHandler } from "@/lib/api-client"
import { setAccessToken } from "@/lib/token-store"
import type { AuthResponse, User } from "@/types/api"

export interface AuthContextValue {
  user: User | null
  /** True while the initial `GET /auth/me` session hydration is in flight. */
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  /**
   * Sends `PATCH /settings` and merges the response back into `user` --
   * F6's settings page and F4's form (which just needs to *display* the
   * current global default) both read `user.ghost_days_default` via
   * `useAuth()`, so this is the one place that value gets updated.
   */
  updateSettings: (ghostDaysDefault: number) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Auth state provider for F2. The access token now lives only in the
 * in-memory store (`src/lib/token-store.ts`, F19) -- never localStorage,
 * never a JS-readable cookie.
 *
 * The `/auth/*` endpoints are mocked via MSW (see
 * src/mocks/handlers/auth.ts) until B2/B3 ship -- this provider's
 * public API (`login`/`signup`/`loginWithGoogle`/`logout`/`user`)
 * doesn't need to change when the real backend lands, only the mock
 * handlers get swapped out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // F21: the access token is no longer persisted anywhere (F19), so on
    // every fresh page load we attempt a silent `POST /auth/refresh` --
    // if the httpOnly `jtracks_refresh` cookie is still valid, the backend
    // mints a fresh access token and the session is restored with no
    // login screen flash. Uses the same single-flight `refreshAccessToken`
    // that api-client's 401-retry path uses, rather than duplicating the
    // fetch logic. A rejected refresh is the normal "not logged in" case
    // for a fresh visitor -- not an error to surface to the UI.
    async function hydrate() {
      try {
        await refreshAccessToken()
        const me = await apiClient.get<User>("/auth/me")
        if (!cancelled) {
          setUser(me)
        }
      } catch {
        // No valid refresh cookie (or `/auth/me` failed right after) --
        // stay logged out. `refreshAccessToken`/`performRefresh` already
        // clears the token store and fires the session-expired handler
        // on failure, so there's nothing else to clean up here.
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void hydrate()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // F20: api-client's single-flight refresh-on-401 logic calls this once
    // a refresh attempt has definitively failed -- clearing `user` here is
    // all that's needed, since `ProtectedRoute` already redirects to
    // `/login` whenever `user` is `null` (a clean SPA-native redirect, no
    // hard reload, no new routing logic here).
    setSessionExpiredHandler(() => setUser(null))
    return () => setSessionExpiredHandler(null)
  }, [])

  /**
   * The real backend's `TokenResponse` carries no `user` field (see
   * backend/API_SPEC_V1.md #6.3) -- every auth endpoint mints a token
   * only, so hydrating `user` always takes a follow-up `GET /auth/me`.
   */
  const applyAuthResponse = useCallback(async (response: AuthResponse) => {
    setAccessToken(response.access_token)
    const me = await apiClient.get<User>("/auth/me")
    setUser(me)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiClient.post<AuthResponse>("/auth/login", { email, password })
      await applyAuthResponse(response)
    },
    [applyAuthResponse]
  )

  const signup = useCallback(
    async (email: string, password: string) => {
      const response = await apiClient.post<AuthResponse>("/auth/signup", { email, password })
      await applyAuthResponse(response)
    },
    [applyAuthResponse]
  )

  /**
   * Mock "Sign in with Google" flow (real Google Identity Services
   * integration lands with B3). This is the single call site that a
   * real ID-token exchange would replace -- the surrounding UI just
   * calls `loginWithGoogle()` and doesn't need to change.
   */
  const loginWithGoogle = useCallback(async () => {
    const response = await apiClient.post<AuthResponse>("/auth/oauth/google", {
      provider: "google",
      id_token: "mock-google-id-token",
    })
    await applyAuthResponse(response)
  }, [applyAuthResponse])

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout")
    } finally {
      // Clear in-memory state unconditionally -- a network failure on the
      // logout call must not strand the user in a half-logged-in UI (F21).
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  const updateSettings = useCallback(async (ghostDaysDefault: number) => {
    const response = await apiClient.patch<{ ghost_days_default: number }>("/settings", {
      ghost_days_default: ghostDaysDefault,
    })
    setUser((prev) => (prev ? { ...prev, ghost_days_default: response.ghost_days_default } : prev))
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, signup, loginWithGoogle, logout, updateSettings }}
    >
      {children}
    </AuthContext.Provider>
  )
}
