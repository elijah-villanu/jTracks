import { useEffect, useRef, useState } from "react"
import { toBlob } from "html-to-image"
import { Check, ChevronLeft, ChevronRight, Download, Share, X } from "lucide-react"
import { RECAP_DESIGNS, recapFigures, recapTextSummary, type RecapDesign } from "@/components/dashboard/chart-summaries"
import { DateRangeControl } from "@/components/dashboard/date-range-control"
import { RecapCard } from "@/components/dashboard/recap-card"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useRecap } from "@/hooks/useRecap"
import { useRecapSkin } from "@/hooks/useRecapSkin"
import { validateCustomRange } from "@/lib/date-range"
import { plural } from "@/lib/days"
import type { DashboardRange } from "@/types/api"

/** The export is always 1080 wide (9:16, so 1920 tall), whatever size the card is on screen. */
const EXPORT_WIDTH = 1080

/**
 * Every face the cards use. `document.fonts.ready` only settles loads already
 * in flight, so each face is asked for by name first; otherwise a face nothing
 * has rendered yet is skipped and the PNG silently gets a fallback font.
 */
const REQUIRED_RECAP_FONTS = ['400 1rem "Switzer"', '500 1rem "Switzer"', '600 1rem "Switzer"'] as const

interface RecapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The dialog opens on the range Analytics is showing. */
  initialRange: DashboardRange
  initialStart: string | null
  initialEnd: string | null
}

/**
 * Generate recap: pick a range and one of three designs, then download the card
 * as a 1080 x 1920 PNG or hand it to the share sheet. The numbers come from
 * `GET /dashboard/recap`; the image is drawn in the browser (html-to-image) and
 * never uploaded. On phones it is one large card with arrows and dots.
 */
export function RecapDialog({ open, onOpenChange, initialRange, initialStart, initialEnd }: RecapDialogProps) {
  const [range, setRange] = useState<DashboardRange>(initialRange)
  const [customStart, setCustomStart] = useState(initialStart)
  const [customEnd, setCustomEnd] = useState(initialEnd)
  const [design, setDesign] = useRecapSkin()
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const cardRefs = useRef<Partial<Record<RecapDesign, HTMLDivElement | null>>>({})

  // Each time it opens, start from the range on the Analytics page.
  useEffect(() => {
    if (!open) return
    setRange(initialRange)
    setCustomStart(initialStart)
    setCustomEnd(initialEnd)
  }, [open, initialRange, initialStart, initialEnd])

  const customRangeError = range === "custom" ? validateCustomRange(customStart, customEnd) : null
  const { recap, isLoading, error } = useRecap(range, customStart, customEnd, open)
  const figures = recap && !isLoading ? recapFigures(recap, range) : null
  const summary = recap ? recapTextSummary(recap, range) : ""
  const supportsShare = typeof navigator !== "undefined" && typeof navigator.share === "function"
  const index = Math.max(0, RECAP_DESIGNS.findIndex((d) => d.id === design))
  const unavailable = !figures || isExporting

  function handleOpenChange(next: boolean) {
    if (!next) {
      setExportError(null)
      setExportStatus(null)
    }
    onOpenChange(next)
  }

  function step(by: number) {
    setDesign(RECAP_DESIGNS[(index + by + RECAP_DESIGNS.length) % RECAP_DESIGNS.length].id)
  }

  async function exportCardToBlob(): Promise<Blob> {
    const card = cardRefs.current[design]
    if (!card) throw new Error("Recap card isn't ready yet.")
    try {
      await Promise.all(REQUIRED_RECAP_FONTS.map((font) => document.fonts.load(font)))
      await document.fonts.ready
      // An <img> that hasn't decoded yet exports as a blank box.
      await Promise.all(Array.from(card.querySelectorAll("img")).map((img) => img.decode()))
    } catch (err) {
      // An export with a fallback font beats no export, but say so.
      setExportError(`The recap's font or logo may not have loaded${err instanceof Error ? ` (${err.message})` : ""}; exporting anyway.`)
    }
    // The on-screen "selected" outline is the picker's, not the picture's.
    const blob = await toBlob(card, { pixelRatio: EXPORT_WIDTH / card.offsetWidth, style: { outline: "none" } })
    if (!blob) throw new Error("Couldn't export the recap image. Please try again.")
    return blob
  }

  const fileName = `journeyjob-recap-${range}-${design}.png`

  async function handleDownload() {
    if (unavailable) return
    setExportError(null)
    setExportStatus(null)
    setIsExporting(true)
    try {
      const blob = await exportCardToBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setExportStatus(`Recap image downloaded as ${fileName}.`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Couldn't export the recap image.")
    } finally {
      setIsExporting(false)
    }
  }

  async function handleShare() {
    if (unavailable) return
    setExportError(null)
    setExportStatus(null)
    setIsExporting(true)
    try {
      const file = new File([await exportCardToBlob()], fileName, { type: "image/png" })
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        setExportError("This device can't share images. Use Download instead.")
        return
      }
      await navigator.share({ files: [file], title: "JourneyJob recap", text: summary })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setExportError(err instanceof Error ? err.message : "Couldn't share the recap image.")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="app dlg recap" showCloseButton={false}>
        <div className="dlg-head">
          <DialogTitle>Recap</DialogTitle>
          <DialogClose render={<button className="btn btn-ghost x" type="button" aria-label="Close" />}>
            <X className="i" aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="recap-body">
          <div className="recap-range">
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
            {figures && <span className="muted">{`${figures.dates} · ${plural(figures.total, "application")}`}</span>}
          </div>

          <div className="design-stage">
            <fieldset className="designs">
              <legend className="sr-only">Design</legend>
              {RECAP_DESIGNS.map((d) => (
                <label className="design" key={d.id}>
                  <input type="radio" name="recap-design" value={d.id} checked={design === d.id} onChange={() => setDesign(d.id)} aria-label={d.label} />
                  <div className="card-slot">
                    {figures ? (
                      <RecapCard
                        r={figures}
                        design={d.id}
                        label={`${d.label} recap image. ${summary}`}
                        ref={(node) => {
                          cardRefs.current[d.id] = node
                        }}
                      />
                    ) : (
                      // Same size as a card, so the dialog doesn't jump when the numbers arrive.
                      <div className="card-ghost">{error && !customRangeError ? "Couldn't load" : "Loading..."}</div>
                    )}
                  </div>
                  <span className="name">
                    {design === d.id && <Check className="i i-sm" aria-hidden="true" />}
                    {d.label}
                  </span>
                </label>
              ))}
            </fieldset>
          </div>

          <div className="design-nav">
            <button className="btn btn-line arrow" type="button" aria-label="Previous design" onClick={() => step(-1)}>
              <ChevronLeft className="i" aria-hidden="true" />
            </button>
            <div className="design-mid">
              <div className="dots" role="group" aria-label="Recap design">
                {RECAP_DESIGNS.map((d, n) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-label={`${d.label}, design ${n + 1} of ${RECAP_DESIGNS.length}`}
                    aria-current={design === d.id || undefined}
                    onClick={() => setDesign(d.id)}
                  />
                ))}
              </div>
              <span className="design-name" aria-live="polite">{RECAP_DESIGNS[index].label}</span>
            </div>
            <button className="btn btn-line arrow" type="button" aria-label="Next design" onClick={() => step(1)}>
              <ChevronRight className="i" aria-hidden="true" />
            </button>
          </div>
        </div>

        {error && !customRangeError && <p role="alert" className="dlg-alert">{error}</p>}
        {exportError && <p role="alert" className="dlg-alert">{exportError}</p>}
        <p role="status" aria-live="polite" className="sr-only">
          {isExporting ? "Preparing your recap image..." : exportStatus ?? (isLoading ? "Loading recap..." : recap ? "Recap ready." : "")}
        </p>

        <div className="dlg-foot">
          <span className="muted">1080 × 1920 PNG</span>
          {/* aria-disabled, not disabled: a disabled button drops focus to <body> mid-export. */}
          <button className="btn btn-line" type="button" aria-disabled={unavailable} onClick={handleDownload}>
            <Download className="i" aria-hidden="true" />
            {isExporting ? "Exporting..." : "Download"}
          </button>
          {supportsShare && (
            <button className="btn btn-accent" type="button" aria-disabled={unavailable} onClick={handleShare}>
              <Share className="i" aria-hidden="true" />
              Share
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
