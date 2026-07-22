import { createContext, useCallback, useEffect, useState, type ReactNode } from "react"
import { apiClient } from "@/lib/api-client"
import type { AuthResponse, User } from "@/types/api"

/**
 * localStorage key for the JWT. Must match what `src/lib/api-client.ts`
 * reads when attaching the `Authorization` header to every request.
 */
const TOKEN_STORAGE_KEY = "jtracks_token"

export interface AuthContextValue {
  user: User | null
  /** True while the initial `GET /auth/me` session hydration is in flight. */
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY)
}

function storeToken(token: string) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

function clearStoredToken() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
}

/**
 * Auth state provider for F2. Persists the JWT under the same
 * localStorage key `api-client.ts` already expects, and hydrates
 * `user` from `GET /auth/me` on mount if a token is present.
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

    async function hydrate() {
      const token = getStoredToken()

      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const me = await apiClient.get<User>("/auth/me")
        if (!cancelled) {
          setUser(me)
        }
      } catch {
        // Token is invalid/expired -- clear it so the app treats the
        // user as logged out rather than retrying forever.
        clearStoredToken()
        if (!cancelled) {
          setUser(null)
        }
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

  const applyAuthResponse = useCallback((response: AuthResponse) => {
    storeToken(response.access_token)
    setUser(response.user)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiClient.post<AuthResponse>("/auth/login", { email, password })
      applyAuthResponse(response)
    },
    [applyAuthResponse]
  )

  const signup = useCallback(
    async (email: string, password: string) => {
      const response = await apiClient.post<AuthResponse>("/auth/signup", { email, password })
      applyAuthResponse(response)
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
    applyAuthResponse(response)
  }, [applyAuthResponse])

  const logout = useCallback(() => {
    clearStoredToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
