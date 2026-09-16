import { LoginForm } from "@/components/login-form"
import { Logo } from "@/components/layout/logo"
import { useDocumentTitle } from "@/hooks/useDocumentMetadata"

/**
 * F2 login route (`/login`, gated by `GuestRoute` in App.tsx so an
 * already-authenticated user is redirected to `/` instead).
 */
export function LoginPage() {
  useDocumentTitle("Log in")

  // A11y: <main>, not <div>. Unlike the authenticated routes (which get
  // their landmark from AppLayout) this route renders standalone, so axe
  // flagged the whole page as content outside any landmark -- a screen
  // reader user had no "jump to main content" target here at all.
  return (
    <main className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <Logo className="absolute top-6 left-6 h-9 md:top-10 md:left-10" />
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </main>
  )
}
