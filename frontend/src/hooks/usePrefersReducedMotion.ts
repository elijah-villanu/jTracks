import { useMediaQuery } from "@/hooks/useMediaQuery"

/**
 * Live `prefers-reduced-motion: reduce` flag (re-renders if the OS setting
 * changes mid-session, unlike Motion's own `useReducedMotion`, which reads
 * it once).
 *
 * **Why this exists when main.tsx already has `<MotionConfig
 * reducedMotion="user">`.** That provider does less than its name
 * suggests. Motion only short-circuits *positional* values under it --
 * transforms, `width`/`height`/`top`/`left` (`positionalKeys` in
 * `motion-dom`'s `visual-element-target`) -- and animates everything else
 * normally. Measured with the OS setting on:
 *
 * - `NumberTicker` drives a standalone `useSpring` that writes
 *   `textContent` directly; no visual element is involved, so the provider
 *   never sees it and the count-up still ran.
 * - `BorderBeam` (`offsetDistance`, not positional) kept looping forever
 *   too. It has since been removed from the app entirely (WCAG 2.2.2), so
 *   `NumberTicker` is the one live consumer of this hook.
 *
 * `BlurFade` is fine as is: its `y` offset is skipped and only the
 * opacity/blur fade remains, which is the non-vestibular part the setting
 * is meant to leave alone.
 *
 * Call sites use this to render the static end state instead -- the final
 * number, not a count-up -- the same "handle it locally when a library
 * falls through both safety nets" treatment the Embla carousel in
 * recap-dialog.tsx already needed.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)")
}
