import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * SECURITY: `VITE_*` values are baked into the bundle at build time, so a
 * wrong one can't be fixed by App Service settings afterwards. Fail the
 * production build instead of shipping a frontend that talks to the wrong
 * place:
 *   - no `VITE_API_URL` -> the app would have no backend at all;
 *   - a non-https, non-loopback API -> access tokens and the refresh
 *     cookie's exchange would cross the network in cleartext (and the
 *     `Secure` refresh cookie would never be sent anyway).
 * A loopback URL is allowed (with a warning) so local `npm run build`
 * checks keep working.
 */
function assertProductionEnv(mode: string) {
  const env = loadEnv(mode, dirname, 'VITE_')
  const apiUrl = env.VITE_API_URL

  if (!apiUrl) {
    throw new Error(
      'VITE_API_URL must be set for a production build (e.g. https://<api-app>.azurewebsites.net).'
    )
  }

  let parsed: URL
  try {
    parsed = new URL(apiUrl)
  } catch {
    throw new Error(`VITE_API_URL is not a valid absolute URL: ${apiUrl}`)
  }

  if (LOOPBACK_HOSTS.has(parsed.hostname)) {
    console.warn(
      `\n[security] VITE_API_URL points at ${apiUrl}. Fine for a local build check, ` +
        'but do not deploy this bundle.\n'
    )
  } else if (parsed.protocol !== 'https:') {
    throw new Error(`VITE_API_URL must use https in a production build (got ${apiUrl}).`)
  }

  if (env.VITE_ENABLE_MOCKS === 'true') {
    console.warn('\n[security] VITE_ENABLE_MOCKS=true is ignored in production builds.\n')
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') {
    assertProductionEnv(mode)
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(dirname, './src'),
      },
    },
  }
})
