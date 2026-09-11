import logoDark from "@/assets/JourneyJobLogoDark.png"
import logoLight from "@/assets/JourneyJobLogoLight.png"
import { cn } from "@/lib/utils"

/**
 * JourneyJob wordmark. Two pre-rendered PNGs (not a single recolored asset)
 * because the mark itself -- not just its surrounding chrome -- has
 * different ink colors per theme; `dark:hidden`/`hidden dark:block` swap
 * them the same way every other themed value in this app resolves off the
 * `.dark` class, so no JS theme read is needed here.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <img src={logoLight} alt="JourneyJob" className="block h-full w-auto dark:hidden" />
      <img src={logoDark} alt="JourneyJob" className="hidden h-full w-auto dark:block" />
    </span>
  )
}
