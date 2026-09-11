import { useCallback, useState } from "react"

/**
 * F51 (R16.1): which rendering of the pipeline the viewer last picked --
 * the status-grouped Board or the sortable Table. With nothing stored,
 * the starting view is chosen from viewport width once at mount (see
 * `defaultViewModeForViewport`).
 *
 * `localStorage`, not the user record, for exactly the reason F25's
 * theme key and F48's recap-skin key already document: this is a display
 * preference with no auth or authorization meaning, nothing about it is
 * worth a round trip or a backend contract change, and the worst case
 * for a corrupted/absent value is that the page opens on the default
 * view. It is also read *before* `useApplications` resolves, so a
 * server-persisted value would arrive too late to avoid a visible swap
 * anyway.
 */
export const VIEW_MODE_STORAGE_KEY = "jtracks_view_mode"

export type ViewMode = "table" | "board"

/**
 * Viewport wide enough to *open* on Board. A column is `w-72` (288px), so
 * this fits roughly three of them plus the page's own padding — enough for
 * the board to read as a board on arrival rather than as one column and a
 * scrollbar. Below it, the first view is Table.
 */
export const BOARD_DEFAULT_VIEWPORT_QUERY = "(min-width: 1024px)"

/** Used when `matchMedia` is unavailable or throws (non-browser render, locked-down privacy modes). */
export const FALLBACK_VIEW_MODE: ViewMode = "table"

/**
 * The view a viewer gets before they have ever picked one.
 *
 * F51/R16.1 originally specified Table unconditionally, on the reasoning
 * that Board was an opt-in alternate rather than a replacement. Changed on
 * 2026-09-09 at the user's direction: land on Board where there is room
 * for it, Table where there isn't.
 *
 * **Read once, deliberately never watched.** This is a plain `matchMedia`
 * read rather than `useMediaQuery`, and that is the whole point: the hook
 * subscribes to `change` and re-renders, which would swap the view out
 * from under someone who rotated their phone or dragged a window — losing
 * their place mid-task. Called from `useState`'s lazy initializer, this
 * runs exactly once per mount, so **width decides the starting view and
 * nothing else; later resizes never change it.** Don't "improve" this into
 * `useMediaQuery` without re-reading this paragraph.
 *
 * A stored choice still beats it entirely (see `readStoredViewMode`), so
 * this only ever applies to a viewer with no saved preference at all.
 */
function defaultViewModeForViewport(): ViewMode {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return FALLBACK_VIEW_MODE
    }
    return window.matchMedia(BOARD_DEFAULT_VIEWPORT_QUERY).matches ? "board" : "table"
  } catch {
    return FALLBACK_VIEW_MODE
  }
}

const VIEW_MODES: ViewMode[] = ["table", "board"]

export function isViewMode(value: string | null): value is ViewMode {
  return value !== null && (VIEW_MODES as string[]).includes(value)
}

function readStoredViewMode(): ViewMode {
  // Guarded the same way useRecapSkin.ts is: `localStorage` throws
  // outright in some privacy modes (and is absent entirely in a
  // non-browser render), and a stored value can be anything -- a mode
  // that no longer exists, or hand-edited junk -- so `isViewMode` is
  // what makes the fallback to the default safe rather than rendering
  // an unknown view.
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    return isViewMode(stored) ? stored : defaultViewModeForViewport()
  } catch {
    return defaultViewModeForViewport()
  }
}

export function useViewMode(): [ViewMode, (next: ViewMode) => void] {
  const [viewMode, setViewModeState] = useState<ViewMode>(readStoredViewMode)

  const setViewMode = useCallback((next: ViewMode) => {
    setViewModeState(next)
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next)
    } catch {
      // Persisting is best-effort: the choice still applies for this
      // session, it just won't survive a reload.
    }
  }, [])

  return [viewMode, setViewMode]
}
