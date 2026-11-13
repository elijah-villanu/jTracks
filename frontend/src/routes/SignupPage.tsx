import { SignupForm } from "@/components/signup-form"
import { useDocumentTitle } from "@/hooks/useDocumentMetadata"

/**
 * F2 signup route (`/signup`, gated by `GuestRoute` in App.tsx so an
 * already-authenticated user is redirected to `/` instead). The shell is
 * `AuthLayout`'s, shared with /login.
 */
export function SignupPage() {
  useDocumentTitle("Create your account")
  return <SignupForm />
}
