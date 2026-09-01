import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/hooks/useTheme"
import type { Theme } from "@/lib/theme-context"
import { cn } from "@/lib/utils"

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

export interface ThemeToggleProps {
  className?: string
}

/**
 * F26's theme control: a segmented button group (three states, since a
 * two-way switch can't express "system"), following the existing
 * `dashboard/date-range-control.tsx` precedent -- `role="group"` +
 * `aria-label` on the wrapper, one button per option, `aria-pressed` on
 * whichever one is active (same pattern DateRangeControl uses for its
 * range buttons, so screen readers announce the active option the same
 * way across the app).
 *
 * Icon-only triggers (Sun/Moon/Monitor) each carry an `sr-only` label --
 * same treatment as AppLayout's existing "Open menu" `SheetTrigger` --
 * so the accessible name is "Light theme"/"Dark theme"/"System theme",
 * not just "button".
 *
 * Standalone and exported (not inlined into AppLayout) because F43's
 * landing-page header reuses this exact component per R11.1 -- see
 * `.claude/rules/shadcn-ui.md`'s Visual Liberty note and
 * FRONTEND_TASKS.md's F26.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()

  return (
    <div className={cn("flex items-center gap-1", className)} role="group" aria-label="Theme">
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon
        const isActive = theme === option.value
        return (
          <Button
            key={option.value}
            type="button"
            size="icon-sm"
            variant={isActive ? "default" : "outline"}
            aria-pressed={isActive}
            onClick={() => setTheme(option.value)}
          >
            <Icon />
            <span className="sr-only">{option.label} theme</span>
          </Button>
        )
      })}
    </div>
  )
}
