/**
 * Central API client wrapper.
 *
 * Reads the backend base URL from `VITE_API_URL` (see `.env.example`).
 * All requests to the real/mocked backend should go through `apiFetch`
 * (or one of the typed helpers below) so later milestones only need to
 * add new methods here rather than scattering `fetch` calls throughout
 * the app.
 *
 * In dev, MSW intercepts requests made to `API_BASE_URL` (see
 * `src/mocks`), so this file works unchanged whether or not a real
 * backend is running.
 */

import { getAccessToken, setAccessToken } from "@/lib/token-store"

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

/** Path (relative to `API_BASE_URL`) of the refresh endpoint -- a `401` from this exact endpoint must never itself trigger another refresh attempt (F20/R7.6), or it would loop forever. */
const REFRESH_PATH = "/auth/refresh"

/** Path (relative to `API_BASE_URL`) of the logout endpoint -- see `performLogout` below. */
const LOGOUT_PATH = "/auth/logout"

/**
 * `true` when `path` resolves to the refresh endpoint itself, regardless of
 * whether it was passed relative (`"/auth/refresh"`) or absolute. Used to
 * guard against ever retrying/re-refreshing off of the refresh call's own
 * response.
 */
function isRefreshRequestPath(path: string): boolean {
  try {
    return new URL(path, API_BASE_URL).pathname === REFRESH_PATH
  } catch {
    return path === REFRESH_PATH
  }
}

/**
 * Single callback invoked once a refresh attempt has definitively failed
 * (F20/R7.6) -- i.e. the session can no longer be silently restored.
 * `auth-context.tsx`'s `AuthProvider` registers a handler on mount that
 * clears `user`, which `ProtectedRoute` already turns into a `/login`
 * redirect (via React Router's `<Navigate>`) with no new routing logic and
 * no hard page reload. A single-slot setter (rather than a list of
 * subscribers) is enough -- there's only ever one `AuthProvider` mounted.
 */
let sessionExpiredHandler: (() => void) | null = null

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}

/**
 * Module-level single-flight refresh promise (F20/R7.6). `null` when no
 * refresh is in flight. The first `401` to see `null` creates the promise
 * (kicking off exactly one `POST /auth/refresh`); any `401`s that arrive
 * while it's still pending reuse the same promise instead of firing their
 * own refresh call. Cleared (back to `null`) once the attempt settles --
 * success or failure -- via `.finally`, so the *next* `401` (one that
 * isn't concurrent with this batch) can trigger a fresh attempt rather
 * than being stuck reusing a stale settled promise.
 */
let refreshPromise: Promise<string> | null = null

/**
 * Performs the actual `POST /auth/refresh` call: sends the required
 * `X-Refresh-Request: 1` CSRF-defense header (B25) and `credentials:
 * "include"` so the httpOnly `jtracks_refresh` cookie flows -- no
 * `Authorization` header, since the whole point is the access token has
 * expired. On success, stores the new token and returns it. On any
 * failure (non-2xx or a thrown error), clears the token and fires the
 * session-expired handler exactly once before rethrowing.
 */
async function performRefresh(): Promise<string> {
  try {
    const response = await fetch(buildUrl(REFRESH_PATH), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Refresh-Request": "1",
      },
    })

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }

    const data = (await response.json()) as { access_token: string; token_type: string }
    setAccessToken(data.access_token)
    return data.access_token
  } catch (error) {
    setAccessToken(null)
    sessionExpiredHandler?.()
    throw error
  }
}

/**
 * Performs `POST /auth/logout` -- like `performRefresh`, this is one of the
 * two cookie-reading endpoints (B25) and requires the same `X-Refresh-Request:
 * 1` CSRF-defense header and `credentials: "include"`. It must NOT go through
 * `apiClient.post`/`rawFetch`, which only ever attach `Authorization` -- doing
 * so silently fails the backend's header check with a `403` that the caller's
 * `finally` swallows, leaving the refresh-token cookie (and the DB session it
 * points at) un-revoked while the UI still looks logged out.
 */
export async function performLogout(): Promise<void> {
  const response = await fetch(buildUrl(LOGOUT_PATH), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Refresh-Request": "1",
    },
  })

  if (!response.ok && response.status !== 204) {
    throw new ApiError(response.status, response.statusText)
  }
}

/**
 * Kicks off (or joins) the single in-flight refresh attempt. See
 * `refreshPromise` above for the dedup contract. Exported so
 * `auth-context.tsx`'s `hydrate()` (F21) can drive the exact same
 * single-flight refresh path on boot rather than duplicating the fetch
 * logic -- a concurrent 401-triggered refresh and a boot-time refresh
 * that happened to overlap will correctly share one in-flight request.
 */
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown
  /** Query params to append to the URL. */
  params?: Record<string, string | number | boolean | undefined>
}

function buildUrl(path: string, params?: ApiFetchOptions["params"]): string {
  const url = new URL(path, API_BASE_URL)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

/**
 * Low-level fetch wrapper: resolves the URL against `VITE_API_URL`,
 * serializes JSON bodies, attaches the auth token, and normalizes error
 * responses into `ApiError`. Does *not* handle refresh-on-401 itself --
 * see `apiFetch` below, which wraps this with the single-flight retry.
 *
 * `credentials: "include"` is always sent so the httpOnly `jtracks_refresh`
 * cookie (`Path=/auth`, cross-site `SameSite=None; Secure`) can flow to
 * `/auth/refresh` -- it's scoped to `/auth` so sending it unconditionally
 * on every request is harmless.
 */
async function rawFetch<T>(path: string, options: ApiFetchOptions): Promise<T> {
  const { params, body, headers, ...rest } = options

  const token = getAccessToken()

  const response = await fetch(buildUrl(path, params), {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let errorBody: unknown
    try {
      errorBody = await response.json()
    } catch {
      errorBody = undefined
    }
    throw new ApiError(response.status, response.statusText, errorBody)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

/**
 * Public entry point every request goes through. Wraps `rawFetch` with
 * F20/R7.6's single-flight refresh-on-401 behavior:
 *
 * - A `401` from any path other than `/auth/refresh` itself triggers (or
 *   joins) exactly one in-flight refresh attempt (`refreshAccessToken`).
 * - On refresh success, the *original* request is retried exactly once
 *   (via `rawFetch`, not `apiFetch`, so a second `401` on the retry is
 *   surfaced as-is rather than looping back into another refresh).
 * - On refresh failure, the original `401` `ApiError` is rethrown
 *   unchanged -- the caller sees "their" request failed, not that the
 *   refresh call failed. The session-expired side effect (clearing the
 *   token, notifying `AuthProvider`) already fired once inside
 *   `performRefresh`.
 * - A `401` from `/auth/refresh` itself is never intercepted here (that
 *   call goes through `performRefresh`'s own `fetch`, not `apiFetch`, but
 *   the `isRefreshRequestPath` guard is kept as defense-in-depth in case
 *   something ever calls `/auth/refresh` through this wrapper).
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  try {
    return await rawFetch<T>(path, options)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || isRefreshRequestPath(path)) {
      throw error
    }

    try {
      await refreshAccessToken()
    } catch {
      // Refresh itself failed -- surface the ORIGINAL 401, not a refresh error.
      throw error
    }

    // Retry the original request exactly once with the new token. Uses
    // `rawFetch` (not `apiFetch`) so a 401 on this retry doesn't loop back
    // into another refresh attempt.
    return await rawFetch<T>(path, options)
  }
}

export const apiClient = {
  get: <T>(path: string, options?: ApiFetchOptions) => apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: ApiFetchOptions) => apiFetch<T>(path, { ...options, method: "DELETE" }),
}
