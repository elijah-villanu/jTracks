import { useEffect, useState } from "react"

/**
 * Tracks a CSS media query via `matchMedia`, re-rendering on change. Used
 * by F31 (column-priority hiding) and F32 (table -> card rendering swap)
 * so the applications board reacts to real viewport width in JS rather
 * than relying on a CSS-only `hidden`/`sm:block` swap, which would mount
 * both renderings at once and duplicate every row's DOM ids (see
 * `applications-table.tsx` / `applications-card-list.tsx`).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false
  )

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return
    }

    const mediaQueryList = window.matchMedia(query)
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches)

    setMatches(mediaQueryList.matches)
    mediaQueryList.addEventListener("change", handleChange)
    return () => mediaQueryList.removeEventListener("change", handleChange)
  }, [query])

  return matches
}
