import { useEffect } from "react"

/** Suffix every route title carries, so a tab or history entry still names the product. */
const TITLE_SUFFIX = "JourneyJob"

/**
 * A11y (WCAG 2.4.2 Page Titled): title-only sibling of
 * `useDocumentMetadata` below, for the routes that aren't the crawlable
 * entry point. Every one of them used to inherit `index.html`'s landing
 * title, so `/login`, `/app` and `/app/analytics` were all announced --
 * and listed in tabs and history -- as "JourneyJob — see where your job
 * search stalls". Same write-on-mount / restore-on-unmount contract, so it
 * composes with the landing route's hook in either direction.
 */
export function useDocumentTitle(pageTitle: string): void {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${pageTitle} — ${TITLE_SUFFIX}`
    return () => {
      document.title = previousTitle
    }
  }, [pageTitle])
}

/**
 * F44 (R10.6): route-scoped `<title>` + description meta.
 *
 * `index.html` carries the landing page's title and description
 * statically, because `/` is the crawlable entry point and a crawler that
 * doesn't execute JS only ever sees that file. This hook exists for the
 * *client-side* case: once the SPA is running, navigating between `/` and
 * `/app` must not leave the previous route's metadata behind. It writes
 * on mount and restores whatever was there before on unmount, so it can
 * be adopted by another route later without the two fighting.
 *
 * Deliberately the whole of R10.6: title and description, nothing else.
 * No OG tags, no structured data, no canonical -- those are explicit
 * Non-goals (FRONTEND_TASKS.md's out-of-scope list).
 */
export function useDocumentMetadata(title: string, description: string): void {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    // Reuse index.html's existing tag when it's there; only create one as
    // a fallback (e.g. if this hook is ever used by a route whose
    // description isn't the static default).
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    let created = false
    if (!meta) {
      meta = document.createElement("meta")
      meta.name = "description"
      document.head.appendChild(meta)
      created = true
    }
    const previousDescription = meta.content
    meta.content = description

    return () => {
      document.title = previousTitle
      if (created) {
        meta?.remove()
      } else if (meta) {
        meta.content = previousDescription
      }
    }
  }, [title, description])
}
