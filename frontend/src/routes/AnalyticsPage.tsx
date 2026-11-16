import { useState } from "react"
import {
  ActivityCalendar,
  ColumnChart,
  FlowChart,
  InfoButton,
  KpiStrip,
  StageConversion,
  type KpiValues,
} from "@/components/dashboard/analytics-panels"
import { DateRangeControl } from "@/components/dashboard/date-range-control"
import { RecapDialog } from "@/components/dashboard/recap-dialog"
import { RecapGlyph } from "@/components/layout/app-ui"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { useDashboardStats } from "@/hooks/useDashboardStats"
import { useDocumentTitle } from "@/hooks/useDocumentMetadata"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import {
  calendarWeeks,
  funnelOf,
  HEAR_BINS,
  periodText,
  priorWindow,
  replyDays,
  resolveWindow,
  weekdayCounts,
} from "@/lib/analytics"
import { validateCustomRange } from "@/lib/date-range"
import { dayOf, isoOf, plural, todayDay } from "@/lib/days"
import type { Application, DashboardRange, DashboardStats } from "@/types/api"

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

function kpisOf(stats: DashboardStats): KpiValues {
  const f = funnelOf(stats.status_breakdown, stats.total)
  return {
    total: stats.total,
    responseRate: Math.round(stats.response_rate),
    interviews: f.interviews,
    offers: f.offer,
    ghostRate: Math.round(stats.ghost_rate),
    avgDays: stats.avg_time_to_response_days,
  }
}

/**
 * Analytics: headline numbers against the period before, where applications
 * went, how each stage converts, how long replies take, and when you apply.
 * The headline numbers and the flow are the backend's (`GET /dashboard/stats`);
 * the deltas come from a second call for the same number of days just before.
 * Time to hear back, activity and weekdays are worked out here from your
 * applications, over the same window the backend uses.
 */
export function AnalyticsPage() {
  useDocumentTitle("Analytics")
  const { applications } = useApplicationsContext()
  const narrow = useMediaQuery("(max-width: 860px)")
  const today = todayDay()

  const [range, setRange] = useState<DashboardRange>("month")
  const [customStart, setCustomStart] = useState<string | null>(null)
  const [customEnd, setCustomEnd] = useState<string | null>(null)
  const [isRecapOpen, setIsRecapOpen] = useState(false)

  const customRangeError = range === "custom" ? validateCustomRange(customStart, customEnd) : null
  const w = customRangeError ? null : resolveWindow(range, customStart, customEnd, today)
  const pw = w && priorWindow(w)

  const { stats, isLoading, error } = useDashboardStats(range, customStart, customEnd)
  const { stats: prevStats } = useDashboardStats("custom", pw ? isoOf(pw.start!) : null, pw ? isoOf(pw.end) : null, pw !== null)

  function changeRange(next: DashboardRange) {
    // Custom starts from the window on screen, so it's never blank.
    if (next === "custom" && !customStart && !customEnd && w) {
      const earliest = Math.min(...applications.filter((a) => a.date_applied).map((a) => dayOf(a.date_applied!)), w.end)
      setCustomStart(isoOf(Math.max(w.start ?? earliest, w.end - 365)))
      setCustomEnd(isoOf(w.end))
    }
    setRange(next)
  }

  const applied = applications.filter((a) => a.date_applied)
  const earliest = applied.length ? Math.min(...applied.map((a) => dayOf(a.date_applied!))) : null
  const period = w ? periodText(w, earliest) : ""
  const baseline = pw ? periodText(pw, earliest) : ""

  return (
    <section className="an" aria-labelledby="an-title">
      <div className={isLoading && stats ? "frame is-loading" : "frame"}>
        <div className="title-row">
          <h1 id="an-title">Analytics</h1>
          <div className="title-end">
            <DateRangeControl
              range={range}
              onRangeChange={changeRange}
              start={customStart}
              end={customEnd}
              onStartChange={setCustomStart}
              onEndChange={setCustomEnd}
              ariaLabel="Range"
              error={customRangeError}
            />
            <button className="btn btn-accent recap-btn" type="button" aria-haspopup="dialog" onClick={() => setIsRecapOpen(true)}>
              <RecapGlyph />
              Generate recap
            </button>
          </div>
        </div>

        {error && !customRangeError && <p role="alert" className="alert">{error}</p>}
        {/* Changing the range swaps every number on the page; this says when the new ones are in. */}
        <p role="status" aria-live="polite" className="sr-only">
          {isLoading ? "Loading analytics..." : stats ? `Analytics updated: ${plural(stats.total, "application")} in this range.` : ""}
        </p>

        {!stats || !w ? (
          isLoading && <p className="loading">Loading analytics...</p>
        ) : (
          <Panels
            applications={applications}
            stats={stats}
            prevStats={pw ? prevStats : null}
            baseline={baseline}
            period={period}
            w={w}
            today={today}
            narrow={narrow}
          />
        )}
      </div>

      <RecapDialog
        open={isRecapOpen}
        onOpenChange={setIsRecapOpen}
        initialRange={range}
        initialStart={customStart}
        initialEnd={customEnd}
      />
    </section>
  )
}

function Panels({
    applications,
    stats,
    prevStats,
    baseline,
    period,
    w,
    today,
    narrow,
  }: {
    applications: Application[]
    stats: DashboardStats
    prevStats: DashboardStats | null
    baseline: string
    period: string
    w: NonNullable<ReturnType<typeof resolveWindow>>
    today: number
    narrow: boolean
  }) {
    const f = funnelOf(stats.status_breakdown, stats.total)
    const days = replyDays(applications, w)
    const counts = HEAR_BINS.map(([lo, hi]) => days.filter((d) => d >= lo && d <= hi).length)
    const sorted = [...days].sort((a, b) => a - b)
    const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null
    const medianBin = median === null ? -1 : HEAR_BINS.findIndex(([lo, hi]) => median >= lo && median <= hi)
    const byWeekday = weekdayCounts(applications, w)
    const sent = byWeekday.reduce((a, b) => a + b, 0)
    const topDay = byWeekday.indexOf(Math.max(...byWeekday))

    return (
      <>
        <KpiStrip cur={kpisOf(stats)} prev={prevStats ? kpisOf(prevStats) : null} baseline={baseline} />
        <div className="an-grid">
          <section className="panel span-12" aria-labelledby="flow-title">
            <div className="panel-head">
              <h2 id="flow-title">Where your applications went</h2>
              <span className="aside">{`${plural(f.total, "application")} · ${period}`}</span>
            </div>
            <FlowChart f={f} narrow={narrow} />
          </section>

          <section className="panel span-6" aria-labelledby="conv-title">
            <div className="panel-head">
              <h2 id="conv-title">Stage conversion</h2>
              <InfoButton
                about="stage conversion"
                title={period}
                body="A rejection counts as hearing back. Interviews include offers and failed interviews/OAs."
              />
            </div>
            <StageConversion f={f} />
          </section>

          <section className="panel span-6" aria-labelledby="hear-title">
            <div className="panel-head">
              <h2 id="hear-title">Time to hear back</h2>
              <InfoButton
                about="time to hear back"
                title={median === null ? "No replies in this range" : `Median ${plural(median, "day")} · ${plural(sorted.length, "reply", "replies")}`}
                body="Days from applying to the last status change. JourneyJob keeps no status history, so this is the closest measure it has."
              />
            </div>
            <ColumnChart
              values={counts}
              labels={HEAR_BINS.map((b) => b[2])}
              highlight={medianBin}
              label={`Replies by days to hear back: ${HEAR_BINS.map((b, i) => `${b[2]} days ${counts[i]}`).join(", ")}.`}
            />
          </section>

          <section className="panel span-8" aria-labelledby="act-title">
            <div className="panel-head">
              <h2 id="act-title">Activity</h2>
              <InfoButton
                about="activity"
                title={`Last ${calendarWeeks(w)} weeks`}
                body="Each square is a day. The darker it is, the more you sent that day. A streak counts weeks, Monday to Sunday, with at least one application."
              />
            </div>
            <ActivityCalendar apps={applications} w={w} today={today} />
          </section>

          <section className="panel span-4" aria-labelledby="wk-title">
            <div className="panel-head">
              <h2 id="wk-title">Weekday rhythm</h2>
              <InfoButton
                about="weekday rhythm"
                title={plural(sent, "application")}
                body={sent ? `You apply most on ${WEEKDAYS[topDay]}s.` : "Nothing sent in this range."}
              />
            </div>
            <ColumnChart
              values={byWeekday}
              labels={["M", "T", "W", "T", "F", "S", "S"]}
              highlight={sent ? topDay : -1}
              label={`Applications by weekday: ${WEEKDAYS.map((d, i) => `${d} ${byWeekday[i]}`).join(", ")}.`}
            />
          </section>
        </div>
      </>
    )
}
