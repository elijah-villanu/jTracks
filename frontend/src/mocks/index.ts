/**
 * Starts the MSW mock API layer in dev (unless `VITE_ENABLE_MOCKS` is
 * explicitly "false", e.g. to hit a locally running backend), and is a
 * no-op in every production build.
 *
 * SECURITY: `VITE_ENABLE_MOCKS=true` used to force mocks on in *any* mode.
 * MSW's `requireAuth` accepts any non-empty bearer token, so a production
 * build made with that variable set (e.g. from a copied `.env.example`)
 * would have shipped an auth-bypassing fixture API instead of talking to
 * the real backend. Gating on `import.meta.env.DEV` also lets the bundler
 * drop the mock handlers from production output entirely.
 */
export async function enableMocking(): Promise<void> {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS === "false") {
    return
  }

  const { worker } = await import("@/mocks/browser")

  await worker.start({
    onUnhandledRequest: "bypass",
  })
}
