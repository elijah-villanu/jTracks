import { createContext, useCallback, useEffect, useState, type ReactNode } from "react"
import { apiClient } from "@/lib/api-client"
import type { Application } from "@/types/api"

/**
 * User-editable fields for create/edit -- everything in the shared
 * contract except the server-managed `id`/`user_id`/`created_at`/
 * `updated_at` (see DATABASE_TASKS.md). `ghost_days_override` is
 * included in the type since it's part of `Application`, but F4's form
 * doesn't render a field for it yet (that's F6) -- callers just don't
 * set it, and the mock defaults it to `null`.
 */
export type ApplicationInput = Omit<Application, "id" | "user_id" | "created_at" | "updated_at">

/**
 * "Is the add/edit dialog open, and for which application" -- shared
 * between the trigger (header's Add Job button, a per-row edit button
 * deep in the table, or F5's "Paste a Link" autofill dialog) and the
 * dialog itself (rendered once in AppLayout), which live in different
 * parts of the tree. The `create` variant's `initialValues` lets F5
 * hand off whatever the mocked `POST /applications/autofill` returned
 * (or just the pasted URL, on the unsupported/failed/error paths) so
 * this form always opens pre-filled instead of blank.
 */
export type ApplicationFormState =
  | { mode: "create"; initialValues?: Partial<ApplicationInput> }
  | { mode: "edit"; application: Application }
  | null

export interface ApplicationsContextValue {
  applications: Application[]
  /** True while the initial `GET /applications` fetch is in flight. */
  isLoading: boolean
  error: string | null
  /**
   * Sends `POST /applications` and appends the response to local state
   * -- no refetch of the whole list. Rejects (throwing whatever
   * `apiClient.post` throws, typically an `ApiError`) on failure so
   * callers can surface their own error UI.
   */
  createApplication: (data: ApplicationInput) => Promise<Application>
  /**
   * Sends `PATCH /applications/{id}` with `patch` and merges the
   * response into local state by id -- no refetch of the whole list.
   */
  updateApplication: (id: string, patch: Partial<Application>) => Promise<Application>
  /**
   * Sends `DELETE /applications/{id}` and removes it from local state
   * by id -- no refetch of the whole list.
   */
  deleteApplication: (id: string) => Promise<void>
  formState: ApplicationFormState
  openCreateForm: (initialValues?: Partial<ApplicationInput>) => void
  openEditForm: (application: Application) => void
  closeForm: () => void
}

export const ApplicationsContext = createContext<ApplicationsContextValue | undefined>(undefined)

/**
 * Application state provider for F4. Lifted out of the F3-era
 * `useApplications` hook so the header's "Add Job" button (AppLayout,
 * which wraps every protected route) and the table's per-row edit
 * button (deep inside ApplicationsPage) can share one source of truth
 * for both the application list and "is the add/edit dialog open"
 * state, instead of each page re-fetching/re-deriving its own copy.
 */
export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] = useState<Application[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formState, setFormState] = useState<ApplicationFormState>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setIsLoading(true)
        const data = await apiClient.get<Application[]>("/applications")
        if (!cancelled) {
          setApplications(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load applications.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const createApplication = useCallback(async (data: ApplicationInput) => {
    const created = await apiClient.post<Application>("/applications", data)
    setApplications((prev) => [...prev, created])
    return created
  }, [])

  const updateApplication = useCallback(async (id: string, patch: Partial<Application>) => {
    const updated = await apiClient.patch<Application>(`/applications/${id}`, patch)
    setApplications((prev) => prev.map((application) => (application.id === id ? updated : application)))
    return updated
  }, [])

  const deleteApplication = useCallback(async (id: string) => {
    await apiClient.delete<void>(`/applications/${id}`)
    setApplications((prev) => prev.filter((application) => application.id !== id))
  }, [])

  const openCreateForm = useCallback((initialValues?: Partial<ApplicationInput>) => {
    setFormState({ mode: "create", initialValues })
  }, [])

  const openEditForm = useCallback((application: Application) => {
    setFormState({ mode: "edit", application })
  }, [])

  const closeForm = useCallback(() => {
    setFormState(null)
  }, [])

  return (
    <ApplicationsContext.Provider
      value={{
        applications,
        isLoading,
        error,
        createApplication,
        updateApplication,
        deleteApplication,
        formState,
        openCreateForm,
        openEditForm,
        closeForm,
      }}
    >
      {children}
    </ApplicationsContext.Provider>
  )
}
