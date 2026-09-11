import { SignupForm } from "@/components/signup-form"
import { Logo } from "@/components/layout/logo"

/**
 * F2 signup route (`/signup`, gated by `GuestRoute` in App.tsx so an
 * already-authenticated user is redirected to `/` instead).
 */
export function SignupPage() {
  // A11y: <main>, not <div> -- see the note in LoginPage.tsx.
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <Logo className="absolute top-6 left-6 h-9 md:top-10 md:left-10" />
      <div className="w-full max-w-sm">
        <SignupForm />
      </div>
    </main>
  )
}
