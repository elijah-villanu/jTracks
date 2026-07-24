import { useRef, useState } from "react"
import { toBlob } from "html-to-image"
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
import type { RecapRange } from "@/types/api"

const RECAP_RANGE_OPTIONS: { value: RecapRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
]

// The on-screen card (recap-card.tsx) is 270x480 -- pixelRatio 4 exports
// a clean 1080x1920 PNG, the standard Instagram-Stories resolution.
const EXPORT_PIXEL_RATIO = 4

interface RecapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * F8's "Generate recap" flow: a week/month toggle (recap only supports
 * those two ranges per the backend contract -- deliberately its own
 * state, not coupled to AnalyticsPage's week/month/all toggle), a live
 * preview of the exportable recap sticker, and Download/Share actions.
 *
 * Client-side render per docs/decisions/recap-image-approach.md (B15):
 * `GET /dashboard/recap` (mocked in src/mocks/handlers/recap.ts until
 * B16 ships) returns only the numbers -- the image itself is rendered
 * from recap-card.tsx and exported entirely in the browser via
 * html-to-image, and never touches the network.
 */
export function RecapDialog({ open, onOpenChange }: RecapDialogProps) {
  const [range, setRange] = useState<RecapRange>("week")
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const { recap, isLoading, error } = useRecap(range, open)

  // Feature-detect the Web Share API's file-sharing support up front so
  // unsupported browsers (most desktops) never see a Share button that
  // would just fail -- Download is always available as the fallback, so
  // there's no dead end either way.
  const supportsShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setExportError(null)
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
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Couldn't export the recap image.")
    } finally {
      setIsExporting(false)
    }
  }

  async function handleShare() {
    setExportError(null)
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

        <div className="flex gap-1.5" role="group" aria-label="Recap range">
          {RECAP_RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={range === option.value ? "default" : "outline"}
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {error && (
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
