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
 * serializes JSON bodies, attaches the auth token (once F2 lands), and
 * normalizes error responses into `ApiError`.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { params, body, headers, ...rest } = options

  const token = typeof window !== "undefined" ? window.localStorage.getItem("jtracks_token") : null

  const response = await fetch(buildUrl(path, params), {
    ...rest,
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

export const apiClient = {
  get: <T>(path: string, options?: ApiFetchOptions) => apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: ApiFetchOptions) => apiFetch<T>(path, { ...options, method: "DELETE" }),
}
