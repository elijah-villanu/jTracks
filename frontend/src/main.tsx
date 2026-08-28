import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MotionConfig } from "motion/react"
import { BrowserRouter } from "react-router"
import "./index.css"
import App from "./App.tsx"
import { enableMocking } from "@/mocks"
import { AuthProvider } from "@/lib/auth-context"

enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {/*
        A11y: index.css's global `prefers-reduced-motion` reset only
        neutralises plain CSS `animation`/`transition` properties -- it
        can't reach Motion-driven (MagicUI) components, which animate via
        spring/WAAPI, not CSS transitions. `reducedMotion="user"` makes
        every `motion.*` element under this provider (current and future
        MagicUI usage alike) honour the OS setting automatically, so no
        individual component needs its own check. See docs/decisions/
        magicui-conventions.md.
      */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </MotionConfig>
    </StrictMode>
  )
})
