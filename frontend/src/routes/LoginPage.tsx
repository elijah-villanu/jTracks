import { LoginForm } from "@/components/login-form"
import { useDocumentTitle } from "@/hooks/useDocumentMetadata"

/**
 * F2 login route (`/login`, gated by `GuestRoute` in App.tsx so an
 * already-authenticated user is redirected to `/` instead). The top bar,
 * <main> landmark and session-ended notice come from `AuthLayout`.
 */
export function LoginPage() {
  useDocumentTitle("Log in")
  return <LoginForm />
}
