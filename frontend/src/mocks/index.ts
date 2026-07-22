/**
 * Starts the MSW mock API layer when running in dev (or whenever
 * `VITE_ENABLE_MOCKS` is explicitly set to "true"), and is a no-op
 * otherwise -- e.g. in production builds once a real backend exists,
 * or in dev if you set `VITE_ENABLE_MOCKS=false` to hit a locally
 * running backend instead.
 */
export async function enableMocking(): Promise<void> {
  const mocksExplicitlyDisabled = import.meta.env.VITE_ENABLE_MOCKS === "false"
  const mocksExplicitlyEnabled = import.meta.env.VITE_ENABLE_MOCKS === "true"

  const shouldMock = mocksExplicitlyEnabled || (import.meta.env.DEV && !mocksExplicitlyDisabled)

  if (!shouldMock) {
    return
  }

  const { worker } = await import("@/mocks/browser")

  await worker.start({
    onUnhandledRequest: "bypass",
  })
}
