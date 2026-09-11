import { useEffect, useRef, useState } from "react"
import { toBlob } from "html-to-image"
import { Download, Share2 } from "lucide-react"
import { DateRangeControl } from "@/components/dashboard/date-range-control"
import { RecapCard } from "@/components/dashboard/recap-card"
import { RECAP_SKINS, recapSkinIndex } from "@/components/dashboard/recap-skins"
import type { RecapSkinId } from "@/components/dashboard/recap-skins"
import { Button } from "@/components/ui/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useRecap } from "@/hooks/useRecap"
import { useRecapSkin } from "@/hooks/useRecapSkin"
import { validateCustomRange } from "@/lib/date-range"
import { cn } from "@/lib/utils"
import type { DashboardRange } from "@/types/api"

// The on-screen card (recap-skins/shared.tsx) is 270x480 -- pixelRatio 4
// exports a clean 1080x1920 PNG, the standard Instagram-Stories resolution.
const EXPORT_PIXEL_RATIO = 4

/**
 * F60/R17.4: every font face the three recap skins actually render inside
 * the `html-to-image`-captured subtree (recap-skins/shared.tsx's
 * `RecapFooter` wordmark at Display 400, and the skins' own text at every
 * Roboto weight in use -- 400 for unstyled body text like the footer's
 * date range, 500/600/700 for labels and stat figures). Kept as an
 * explicit list rather than inferred from the DOM, since `document.fonts`
 * has no "faces this subtree needs" query.
 */
const REQUIRED_RECAP_FONTS = [
  '400 1rem "Hedvig Letters Sans"',
  '400 1rem "Roboto"',
  '500 1rem "Roboto"',
  '600 1rem "Roboto"',
  '700 1rem "Roboto"',
] as const

interface RecapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * F8's "Generate recap" flow: a range toggle (F13 widens this from a
 * week/month-only toggle to the full week/month/year/all/custom set,
 * matching the backend's shared `DashboardRange` contract -- deliberately
 * its own state, not coupled to AnalyticsPage's toggle), a live preview
 * of the exportable recap sticker, and Download/Share actions.
 *
 * Client-side render per docs/decisions/recap-image-approach.md (B15):
 * `GET /dashboard/recap` (mocked in src/mocks/handlers/recap.ts until
 * B16 ships) returns only the numbers -- the image itself is rendered
 * from the recap skins and exported entirely in the browser via
 * html-to-image, and never touches the network.
 *
 * F48: the single preview is now a carousel of the `RECAP_SKINS` designs.
 * Three things about that are load-bearing rather than incidental:
 *
 * - **All three cards are mounted; only one is ever exported.** Each
 *   slide registers its root node in `cardRefs`, and `exportCardToBlob`
 *   reaches for exactly the selected skin's node -- so the subtree handed
 *   to `toBlob` contains one skin, never three. Mounting all three is
 *   what lets Embla measure and animate between them, and it costs
 *   nothing at export time.
 * - **The carousel stays mounted while the fetch is in flight.**
 *   Unmounting it during a refetch (the obvious way to show a loading
 *   state) would destroy whatever control the user was on -- changing the
 *   range moves focus to nowhere, which is exactly the WCAG 2.4.3 problem
 *   the rest of this app works to avoid. Each slide swaps its own card
 *   for a same-sized placeholder instead, so the selector, its focus, and
 *   the dialog's height all survive a range change.
 * - **Paging is never swipe-only.** Embla's drag gesture is a bonus on
 *   top of real Previous/Next buttons and a row of dot controls, each a
 *   focusable `<button>` with a "design N of M" accessible name. A
 *   pointer-drag-only carousel is unusable by keyboard and invisible to a
 *   screen reader.
 */
export function RecapDialog({ open, onOpenChange }: RecapDialogProps) {
  const [range, setRange] = useState<DashboardRange>("week")
  const [customStart, setCustomStart] = useState<string | null>(null)
  const [customEnd, setCustomEnd] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  /** Announced (only) to assistive tech once an export finishes. */
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const [skinId, setSkinId] = useRecapSkin()
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  /**
   * One entry per skin, populated by each slide's callback ref. The
   * selected skin's node is the export target -- see the doc comment
   * above on why all three are mounted but only one is ever exported.
   */
  const cardRefs = useRef<Partial<Record<RecapSkinId, HTMLDivElement | null>>>({})

  const { recap, isLoading, error } = useRecap(range, customStart, customEnd, open)

  // Recomputed locally (cheap, pure) so it can gate the inline error shown
  // next to the date pickers -- distinct from `error` above, which also
  // covers real fetch/server failures (surfaced in the banner below).
  const customRangeError = range === "custom" ? validateCustomRange(customStart, customEnd) : null

  // Feature-detect the Web Share API's file-sharing support up front so
  // unsupported browsers (most desktops) never see a Share button that
  // would just fail -- Download is always available as the fallback, so
  // there's no dead end either way.
  const supportsShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  const activeIndex = recapSkinIndex(skinId)

  /*
   * Reduced motion, handled explicitly because nothing else in this app
   * reaches Embla. `.claude/rules/magicui-ui.md` makes honoring the OS
   * setting non-negotiable, but the two mechanisms that normally deliver
   * it both miss here: the app-root `<MotionConfig reducedMotion="user">`
   * only governs Motion components, and `index.css`'s global reduced-
   * motion reset only governs CSS transitions/animations. Embla slides by
   * writing an inline `transform` from a `requestAnimationFrame` loop, so
   * it sails past both. `duration: 0` makes it cut straight to the
   * selected slide instead of animating -- the selection still works
   * identically, it just doesn't move.
   */
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")

  /**
   * True once Embla has actually landed on the remembered skin. Until it
   * has, Embla's own `select` events are ignored rather than persisted.
   *
   * This guard is not defensive -- without it the stored preference is
   * destroyed on every dialog open. Embla mounts inside a dialog that has
   * only just appeared, so its first `select` fires before it has
   * measured its slides, and an unmeasured carousel reports snap 0. That
   * 0 flowed into `setSkinId`, which wrote "strava" over whatever the
   * user had chosen -- a returning Beli user would find Strava selected
   * and their choice gone, with no interaction of their own involved.
   * Confirming the restore before trusting Embla is what makes the
   * remembered skin survive.
   */
  const hasRestoredStoredSkin = useRef(false)
  /** Latest selection, read by the mount-time restore without re-running it. */
  const skinIdRef = useRef(skinId)
  useEffect(() => {
    skinIdRef.current = skinId
  }, [skinId])

  // Restore, then Carousel -> state. The `select` listener covers the
  // drag gesture and the arrow keys the shadcn `Carousel` binds itself,
  // both of which move Embla without going through `setSkinId`.
  useEffect(() => {
    if (!carouselApi) {
      return
    }
    hasRestoredStoredSkin.current = false
    const target = recapSkinIndex(skinIdRef.current)

    // Jumps (`scrollTo(index, true)`) rather than animating: a returning
    // user should find their card already there, not watch it slide in
    // from the start of the list every time they open the dialog.
    // Re-attempted on `reInit`, which is when Embla has measured -- the
    // first attempt is frequently too early to land.
    const restore = () => {
      if (hasRestoredStoredSkin.current) {
        return
      }
      carouselApi.scrollTo(target, true)
      hasRestoredStoredSkin.current = carouselApi.selectedScrollSnap() === target
    }

    const handleSelect = () => {
      if (!hasRestoredStoredSkin.current) {
        return
      }
      const selected = RECAP_SKINS[carouselApi.selectedScrollSnap()]
      if (selected) {
        setSkinId(selected.id)
      }
    }

    restore()
    carouselApi.on("reInit", restore)
    carouselApi.on("select", handleSelect)
    return () => {
      carouselApi.off("reInit", restore)
      carouselApi.off("select", handleSelect)
    }
  }, [carouselApi, setSkinId])

  // State -> carousel, so the dot controls move the preview.
  useEffect(() => {
    if (!carouselApi || !hasRestoredStoredSkin.current) {
      return
    }
    if (carouselApi.selectedScrollSnap() !== activeIndex) {
      carouselApi.scrollTo(activeIndex)
    }
  }, [carouselApi, activeIndex])

  // A11y (WCAG 4.1.3): paging the carousel changes the preview and
  // nothing else -- no focus moves, no text the user was reading is
  // replaced -- so a screen reader user got no signal that the selection
  // changed. Skips the first run so simply opening the dialog doesn't
  // announce a selection nobody made. Kept separate from the status
  // region below because the two describe unrelated things and would
  // otherwise overwrite each other's messages.
  const [skinAnnouncement, setSkinAnnouncement] = useState("")
  const isInitialSkinRender = useRef(true)
  useEffect(() => {
    if (isInitialSkinRender.current) {
      isInitialSkinRender.current = false
      return
    }
    const skin = RECAP_SKINS[activeIndex]
    setSkinAnnouncement(
      `Recap design ${activeIndex + 1} of ${RECAP_SKINS.length}: ${skin.label}. ${skin.description}.`
    )
  }, [activeIndex])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setExportError(null)
      setExportStatus(null)
    }
    onOpenChange(nextOpen)
  }

  /**
   * F60/R17.4: gate the export on font readiness, awaiting it *before*
   * `toBlob` fires. A custom font that hasn't finished loading when the
   * capture happens silently bakes the browser's fallback font into the
   * PNG -- no error, no visual sign on screen, just a wrong export.
   *
   * `document.fonts.ready` alone is not enough, and this is the trap worth
   * naming: it only settles *pending* loads. A face no rendered node has
   * requested yet isn't pending, so `ready` can resolve immediately while a
   * face the card needs was never fetched at all (e.g. right after a cold
   * page load, before anything on screen has asked for Roboto 700). So
   * this explicitly `load()`s every face `REQUIRED_RECAP_FONTS` names
   * first -- forcing the fetch regardless of what's been rendered -- and
   * only then awaits `ready` for the whole set to finish settling.
   *
   * Guarded so a rejection can't kill Download/Share outright -- an export
   * with a fallback font still beats no export at all -- but the failure
   * is surfaced through `exportError` rather than swallowed, so a real
   * font-loading problem doesn't look identical to a clean export.
   */
  async function ensureRecapFontsLoaded(): Promise<void> {
    try {
      await Promise.all(REQUIRED_RECAP_FONTS.map((font) => document.fonts.load(font)))
      await document.fonts.ready
    } catch (err) {
      setExportError(
        err instanceof Error
          ? `Recap fonts may not have finished loading (${err.message}); exporting anyway.`
          : "Recap fonts may not have finished loading; exporting anyway."
      )
    }
  }

  async function exportCardToBlob(): Promise<Blob> {
    const card = cardRefs.current[skinId]
    if (!card) {
      throw new Error("Recap card isn't ready yet.")
    }
    await ensureRecapFontsLoaded()
    // `backgroundColor` is intentionally omitted: html-to-image only
    // fills the exported canvas's background when it's explicitly set,
    // so leaving it out keeps the *outer* PNG canvas transparent. What
    // renders inside it is whatever the selected skin paints -- an opaque
    // card for the Duolingo/Beli skins, and for the Strava skin only its
    // per-block scrims (see strava-skin.tsx), so that one composites as a
    // floating overlay rather than a filled rectangle.
    const blob = await toBlob(card, { pixelRatio: EXPORT_PIXEL_RATIO })
    if (!blob) {
      throw new Error("Couldn't export the recap image. Please try again.")
    }
    return blob
  }

  /** Skin-qualified so exporting several designs doesn't overwrite one file. */
  const exportFileName = `jtracks-recap-${range}-${skinId}.png`

  async function handleDownload() {
    setExportError(null)
    setExportStatus(null)
    setIsExporting(true)
    try {
      const blob = await exportCardToBlob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = exportFileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      // A programmatic <a download> click produces no perceivable feedback
      // at all outside the browser's own download chrome, which many
      // screen readers don't surface -- say so explicitly.
      setExportStatus(`Recap image downloaded as ${exportFileName}.`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Couldn't export the recap image.")
    } finally {
      setIsExporting(false)
    }
  }

  async function handleShare() {
    setExportError(null)
    setExportStatus(null)
    setIsExporting(true)
    try {
      const blob = await exportCardToBlob()
      const file = new File([blob], exportFileName, { type: "image/png" })

      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        setExportError("Sharing images isn't supported on this device -- use Download instead.")
        return
      }

      await navigator.share({
        files: [file],
        title: "jTracks recap",
        text: recap?.headline ?? "My jTracks recap",
      })
    } catch (err) {
      // The user dismissing the native share sheet throws an
      // AbortError -- that's a cancellation, not a failure, so it
      // shouldn't surface as an error message.
      if (err instanceof DOMException && err.name === "AbortError") {
        return
      }
      setExportError(err instanceof Error ? err.message : "Couldn't share the recap image.")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Generate recap</DialogTitle>
          <DialogDescription>
            A shareable, Stories-shaped snapshot of your pipeline -- pick a design, then post it.
          </DialogDescription>
        </DialogHeader>

        <DateRangeControl
          range={range}
          onRangeChange={setRange}
          start={customStart}
          end={customEnd}
          onStartChange={setCustomStart}
          onEndChange={setCustomEnd}
          ariaLabel="Recap range"
          error={customRangeError}
        />

        {error && !customRangeError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <Carousel
          aria-label="Recap design"
          opts={prefersReducedMotion ? { duration: 0 } : undefined}
          setApi={setCarouselApi}
          // `min-w-0` is load-bearing, not defensive. `DialogContent` lays
          // its children out in a grid, and Embla's track is a flex row of
          // `basis-full` slides -- so the column's automatic minimum size
          // resolves against the track's max-content width (three cards
          // wide) and the carousel blows straight through the dialog's
          // 384px cap. Flooring the minimum at 0 lets the column take the
          // space actually available instead.
          className="flex min-w-0 flex-col gap-3"
        >
          <CarouselContent>
            {RECAP_SKINS.map((skin, index) => (
              <CarouselItem
                key={skin.id}
                aria-label={`Recap design ${index + 1} of ${RECAP_SKINS.length}, ${skin.label}`}
              >
                <div className="flex justify-center">
                  {isLoading || !recap ? (
                    <div
                      className="flex w-[270px] items-center justify-center rounded-[20px] border border-dashed border-border text-sm text-muted-foreground"
                      style={{ aspectRatio: "9 / 16" }}
                    >
                      Loading recap...
                    </div>
                  ) : (
                    <RecapCard
                      recap={recap}
                      skin={skin.id}
                      ref={(node) => {
                        cardRefs.current[skin.id] = node
                      }}
                    />
                  )}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>

          {/*
            Overridden to `static` so the controls sit in a real row under
            the card. The stock `-left-12`/`-right-12` absolute placement
            would put them outside this dialog's 384px content box and
            straight off the edge on a phone.
          */}
          <div className="flex items-center justify-center gap-3">
            <CarouselPrevious className="static translate-y-0" aria-label="Previous recap design" />

            <div className="flex items-center gap-0.5">
              {RECAP_SKINS.map((skin, index) => {
                const isActive = skin.id === skinId
                return (
                  <button
                    key={skin.id}
                    type="button"
                    onClick={() => {
                      // An explicit pick is unambiguous intent, so it also
                      // releases the restore guard above -- otherwise, in
                      // the rare case where Embla never confirms the
                      // restore, the dot would light up while the preview
                      // stayed put.
                      hasRestoredStoredSkin.current = true
                      setSkinId(skin.id)
                      carouselApi?.scrollTo(index)
                    }}
                    // WCAG 2.5.8: the visible dot is 8px, so the button
                    // carries a 24px target around it rather than being
                    // 8px of clickable area.
                    className="flex size-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    aria-label={`Recap design ${index + 1} of ${RECAP_SKINS.length}, ${skin.label}`}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full transition-colors",
                        isActive ? "bg-primary" : "bg-muted-foreground/40"
                      )}
                    />
                  </button>
                )
              })}
            </div>

            <CarouselNext className="static translate-y-0" aria-label="Next recap design" />
          </div>
        </Carousel>

        <p role="status" aria-live="polite" className="sr-only">
          {skinAnnouncement}
        </p>

        {/*
          A11y (WCAG 4.1.3): everything interesting in this dialog happens
          without moving focus -- the preview card swaps in when the fetch
          lands, and Download/Share do their work with only the button
          label changing to "Exporting...". A screen reader user got no
          signal for either. One always-present polite region covers the
          fetch, the export, and the export's completion.
        */}
        <p role="status" aria-live="polite" className="sr-only">
          {isExporting
            ? "Preparing your recap image..."
            : exportStatus
              ? exportStatus
              : isLoading
                ? "Loading recap..."
                : recap
                  ? `Recap ready: ${recap.headline}`
                  : ""}
        </p>

        {exportError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {exportError}
          </p>
        )}

        {/*
          F50: restyled as a centered row of icon-over-label actions,
          nodding to the referenced Beli recap's bottom share row
          (https://mobbin.com/screens/7fe2981e-cefd-4a7a-8e57-61ab97fb8e7f).
          Presentation only -- `handleDownload`/`handleShare`, the
          `supportsShare` feature gate, and the disabled conditions are
          untouched. Deliberately *not* a row of per-app share buttons:
          `navigator.share()` already hands the OS its own app-icon sheet
          on mobile, and a hand-rolled row can't reliably deep-link into
          those apps from a plain web share call. The 44px circles also
          make these a considerably larger touch target than the previous
          text buttons.
        */}
        <DialogFooter className="flex-row justify-center gap-6 sm:justify-center">
          <Button
            type="button"
            variant="ghost"
            onClick={handleDownload}
            disabled={!recap || isExporting}
            className="group h-auto flex-col gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium"
          >
            <span className="flex size-11 items-center justify-center rounded-full border border-border bg-muted transition-colors group-hover:bg-accent">
              <Download className="size-5" />
            </span>
            {isExporting ? "Exporting..." : "Download"}
          </Button>

          {supportsShare && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleShare}
              disabled={!recap || isExporting}
              className="group h-auto flex-col gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors group-hover:bg-primary/90">
                <Share2 className="size-5" />
              </span>
              Share
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
