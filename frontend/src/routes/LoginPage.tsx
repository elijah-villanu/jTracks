import { LoginForm } from "@/components/login-form"

/**
 * F2 login route (`/login`, gated by `GuestRoute` in App.tsx so an
 * already-authenticated user is redirected to `/` instead).
 */
export function LoginPage() {
  // A11y: <main>, not <div>. Unlike the authenticated routes (which get
  // their landmark from AppLayout) this route renders standalone, so axe
  // flagged the whole page as content outside any landmark -- a screen
  // reader user had no "jump to main content" target here at all.
  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </main>
  )
}
