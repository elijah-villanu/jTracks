import { useRef, useState } from "react"
import { toBlob } from "html-to-image"
import { DateRangeControl } from "@/components/dashboard/date-range-control"
import { RecapCard } from "@/components/dashboard/recap-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useRecap } from "@/hooks/useRecap"
import { validateCustomRange } from "@/lib/date-range"
import type { DashboardRange } from "@/types/api"

// The on-screen card (recap-card.tsx) is 270x480 -- pixelRatio 4 exports
// a clean 1080x1920 PNG, the standard Instagram-Stories resolution.
const EXPORT_PIXEL_RATIO = 4

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
 * from recap-card.tsx and exported entirely in the browser via
 * html-to-image, and never touches the network.
 */
export function RecapDialog({ open, onOpenChange }: RecapDialogProps) {
  const [range, setRange] = useState<DashboardRange>("week")
  const [customStart, setCustomStart] = useState<string | null>(null)
  const [customEnd, setCustomEnd] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  /** Announced (only) to assistive tech once an export finishes. */
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

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

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setExportError(null)
      setExportStatus(null)
    }
    onOpenChange(nextOpen)
  }

  async function exportCardToBlob(): Promise<Blob> {
    if (!cardRef.current) {
      throw new Error("Recap card isn't ready yet.")
    }
    // `backgroundColor` is intentionally omitted: html-to-image only
    // fills the exported canvas's background when it's explicitly set,
    // so leaving it out keeps the *outer* PNG canvas transparent. The
    // card's own gradient background (recap-card.tsx) is what actually
    // renders, so the result composites cleanly over whatever the user
    // shares it onto.
    const blob = await toBlob(cardRef.current, { pixelRatio: EXPORT_PIXEL_RATIO })
    if (!blob) {
      throw new Error("Couldn't export the recap image. Please try again.")
    }
    return blob
  }

  async function handleDownload() {
    setExportError(null)
    setExportStatus(null)
    setIsExporting(true)
    try {
      const blob = await exportCardToBlob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = `jtracks-recap-${range}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      // A programmatic <a download> click produces no perceivable feedback
      // at all outside the browser's own download chrome, which many
      // screen readers don't surface -- say so explicitly.
      setExportStatus(`Recap image downloaded as jtracks-recap-${range}.png.`)
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
      const file = new File([blob], `jtracks-recap-${range}.png`, { type: "image/png" })

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
            A shareable, Stories-shaped snapshot of your pipeline -- transparent background, ready to
            post.
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

        <div className="flex justify-center py-1">
          {isLoading || !recap ? (
            <div
              className="flex w-[270px] items-center justify-center rounded-[20px] border border-dashed border-border text-sm text-muted-foreground"
              style={{ aspectRatio: "9 / 16" }}
            >
              Loading recap...
            </div>
          ) : (
            <RecapCard ref={cardRef} recap={recap} />
          )}
        </div>

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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleDownload} disabled={!recap || isExporting}>
            {isExporting ? "Exporting..." : "Download"}
          </Button>
          {supportsShare && (
            <Button type="button" onClick={handleShare} disabled={!recap || isExporting}>
              Share
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
