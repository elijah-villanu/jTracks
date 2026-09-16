import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MotionConfig } from "motion/react"
import { BrowserRouter } from "react-router"
import "./index.css"
import App from "./App.tsx"
import { enableMocking } from "@/mocks"
import { AuthProvider } from "@/lib/auth-context"
import { ThemeProvider } from "@/lib/theme-context"

enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {/*
        A11y: index.css's global `prefers-reduced-motion` reset only
        neutralises plain CSS `animation`/`transition` properties -- it
        can't reach Motion-driven (MagicUI) components, which animate via
        spring/WAAPI, not CSS transitions. `reducedMotion="user"` makes
        `motion.*` elements under this provider honour the OS setting --
        but only for *positional* values (transforms, width/height/top/
        left). Anything else keeps animating -- `NumberTicker`'s standalone
        spring falls through, so its call site checks
        `hooks/usePrefersReducedMotion.ts` itself. Check what a new
        MagicUI component actually animates before assuming this covers
        it. See docs/decisions/magicui-conventions.md.
      */}
      <MotionConfig reducedMotion="user">
        {/*
          F25: mounted inside MotionConfig but outside BrowserRouter so
          /login, /signup and the landing route (F43) all get the theme
          class/context too, not just the authenticated tree behind
          BrowserRouter's routes. See lib/theme-context.tsx for the
          provider itself and index.html's inline <head> script for the
          synchronous no-flash class application that happens before this
          ever mounts.
        */}
        <ThemeProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </MotionConfig>
    </StrictMode>
  )
})
