import { useId, useLayoutEffect, useRef, type ReactNode } from "react"
import { Info } from "lucide-react"
import { Note } from "@/components/layout/app-ui"
import { monthName, plural, shortDate, weekdayOf } from "@/lib/days"
import { calendarWeeks, perDay, streaks, type DayWindow, type Funnel } from "@/lib/analytics"
import type { Application } from "@/types/api"

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

/** A panel's "i" button: the note holds what used to be its corner text and footnote. */
export function InfoButton({ about, title, body }: { about: string; title?: string; body: string }) {
  return (
    <Note title={title} body={body}>
      <button className="btn info" type="button" aria-label={`About ${about}`}>
        <Info className="i" aria-hidden="true" />
      </button>
    </Note>
  )
}

/* ---------- KPI strip ---------- */
export interface KpiValues {
  total: number
  responseRate: number
  interviews: number
  offers: number
  ghostRate: number
  avgDays: number | null
}

function Delta({
  cur,
  prev,
  baseline,
  unit = "",
  good = "up",
  dec = 0,
  newWhenZero = false,
}: {
  cur: number | null
  prev: number | null | undefined
  baseline: string
  unit?: string
  good?: "up" | "down"
  dec?: number
  newWhenZero?: boolean
}) {
  if (prev === null || prev === undefined || cur === null) return <span className="delta">—</span>
  const d = Math.round((cur - prev) * 10 ** dec) / 10 ** dec
  // The comparison period lives in a tooltip and in screen-reader text, not on screen.
  const vs = <span className="sr-only"> compared with {baseline}</span>
  if (d === 0) {
    return (
      <span className="delta" title={`vs ${baseline}`}>
        No change{vs}
      </span>
    )
  }
  const better = good === "up" ? d > 0 : d < 0
  return (
    <span className={`delta ${better ? "good" : "bad"}`} title={`vs ${baseline}`}>
      {`${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(dec)}${unit}${newWhenZero && prev === 0 ? " (new)" : ""}`}
      {vs}
    </span>
  )
}

/** Six headline numbers in one divided strip; each delta is the difference of the values as shown. */
export function KpiStrip({ cur, prev, baseline }: { cur: KpiValues; prev: KpiValues | null; baseline: string }) {
  const items: [string, ReactNode, string, ReactNode][] = [
    ["Applications", cur.total, "", <Delta key="d" cur={cur.total} prev={prev?.total} baseline={baseline} newWhenZero />],
    ["Response rate", cur.responseRate, "%", <Delta key="d" cur={cur.responseRate} prev={prev?.responseRate} baseline={baseline} unit=" pts" />],
    ["Interviews", cur.interviews, "", <Delta key="d" cur={cur.interviews} prev={prev?.interviews} baseline={baseline} newWhenZero />],
    ["Offers", cur.offers, "", <Delta key="d" cur={cur.offers} prev={prev?.offers} baseline={baseline} newWhenZero />],
    ["Ghost rate", cur.ghostRate, "%", <Delta key="d" cur={cur.ghostRate} prev={prev?.ghostRate} baseline={baseline} unit=" pts" good="down" />],
    [
      "Avg. time to hear back",
      cur.avgDays === null ? "—" : cur.avgDays.toFixed(1),
      cur.avgDays === null ? "" : "days",
      <Delta key="d" cur={cur.avgDays} prev={prev?.avgDays} baseline={baseline} dec={1} good="down" />,
    ],
  ]
  return (
    <dl className="kpis">
      {items.map(([label, value, unit, delta]) => (
        <div className="kpi" key={label}>
          <dt>{label}</dt>
          <dd>
            <span className="v">
              {value}
              {unit && <small>{unit}</small>}
            </span>
            {delta}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------- Where your applications went (the flow) ---------- */
function ribbon(x0: number, x1: number, [a0, a1]: number[], [b0, b1]: number[]) {
  const xm = (x0 + x1) / 2
  return `M${x0} ${a0} C${xm} ${a0} ${xm} ${b0} ${x1} ${b0} L${x1} ${b1} C${xm} ${b1} ${xm} ${a1} ${x0} ${a1} Z`
}

interface Label {
  y: number
  content: ReactNode
}

/**
 * Applied on the left; what came back in the middle (interview, rejected,
 * ghosted); what came out of interviews on the right. Applications still in
 * flight are hatched remainders, not nodes of their own. With no offers or
 * failed interviews yet, the middle column moves to the right edge.
 */
export function FlowChart({ f, narrow }: { f: Funnel; narrow: boolean }) {
  const hatchId = useId()
  const H = narrow ? 260 : 420
  const top = 30
  const gap = 26
  const NW = 12
  const { interviews: I, rejected: Rj, ghosted: G, applied: W, offer: O, failed: F, interviewing: S, total } = f
  const has3 = O + F > 0
  const x1 = 0
  const x2 = has3 ? 494 : 1000 - NW
  const x3 = 1000 - NW
  const k = total ? (H - top - 6 - 2 * gap) / total : 0

  let y = top
  const take = (v: number) => {
    const r = [y, y + v * k]
    y += v * k
    return r
  }
  const c1 = { I: take(I), R: take(Rj), G: take(G), W: take(W) }
  const yI = top
  const yR = yI + I * k + gap
  const yG = yR + Rj * k + gap
  const c2 = { I: [yI, yI + I * k], R: [yR, yR + Rj * k], G: [yG, yG + G * k] }
  const iO = [yI, yI + O * k]
  const iF = [iO[1], iO[1] + F * k]
  const iS = [iF[1], iF[1] + S * k]
  const yF = yI + O * k + (O ? gap : 0)
  const c3 = { O: [yI, yI + O * k], F: [yF, yF + F * k] }

  const pc = (n: number) => <span className="pc">{pct(n, total)}%</span>
  const mid = (r: number[]) => (r[0] + r[1]) / 2 - 9
  // Labels keep at least 20px apart on each side.
  const spread = (ls: Label[]) => {
    ls.sort((a, b) => a.y - b.y)
    for (let i = 1; i < ls.length; i++) ls[i].y = Math.max(ls[i].y, ls[i - 1].y + 20)
    return ls
  }
  const left: Label[] = []
  const middle: Label[] = []
  const right: Label[] = []
  if (W) left.push({ y: mid(c1.W), content: `${W} still waiting` })
  if (has3) {
    if (S) middle.push({ y: mid(iS), content: `${S} still interviewing` })
    if (Rj) middle.push({ y: mid(c2.R), content: <><b>Rejected</b>{Rj}{pc(Rj)}</> })
    if (G) middle.push({ y: mid(c2.G), content: <><b>Ghosted</b>{G}{pc(G)}</> })
    spread(middle)
  } else {
    // Second column on the right edge: each label sits above its node, right-aligned.
    if (I) right.push({ y: 2, content: <><b>Interviewing / OA</b>{I}{pc(I)}{S ? ` · ${S} still interviewing` : ""}</> })
    if (Rj) right.push({ y: c2.R[0] - 22, content: <><b>Rejected</b>{Rj}{pc(Rj)}</> })
    if (G) right.push({ y: c2.G[0] - 22, content: <><b>Ghosted</b>{G}{pc(G)}</> })
  }
  const out: Label[] = []
  if (O) out.push({ y: c3.O[0] - 22, content: <><b>Offer</b>{O}</> })
  if (F) out.push({ y: c3.F[0] - 22, content: <><b>Failed Interview/OA</b>{F}</> })
  if (out.length === 2 && out[1].y < out[0].y + 20) out[1].y = out[0].y + 20

  const summary = `Applied ${total}: ${I} reached an interview, ${Rj} rejected, ${G} ghosted, ${W} still waiting. Of the interviews: ${O} offer, ${F} failed, ${S} still interviewing.`

  return (
    <>
      <div className="flow-plot" role="img" aria-label={summary}>
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="hatch-bg" />
              <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" strokeWidth="2" />
            </pattern>
          </defs>
          {I > 0 && <path className="f-int" d={ribbon(x1 + NW, x2, c1.I, c2.I)} />}
          {Rj > 0 && <path className="f-rej" d={ribbon(x1 + NW, x2, c1.R, c2.R)} />}
          {G > 0 && <path className="f-gho" d={ribbon(x1 + NW, x2, c1.G, c2.G)} />}
          {O > 0 && <path className="f-offer" d={ribbon(x2 + NW, x3, iO, c3.O)} />}
          {F > 0 && <path className="f-fail" d={ribbon(x2 + NW, x3, iF, c3.F)} />}
          <rect x={x1} y={top} width={NW} height={(I + Rj + G) * k} className="f-node" />
          {W > 0 && <rect x={x1} y={c1.W[0]} width={NW} height={W * k} fill={`url(#${hatchId})`} />}
          {O + F > 0 && <rect x={x2} y={yI} width={NW} height={(O + F) * k} className="f-node" />}
          {S > 0 && <rect x={x2} y={iS[0]} width={NW} height={S * k} fill={`url(#${hatchId})`} />}
          {Rj > 0 && <rect x={x2} y={yR} width={NW} height={Rj * k} className="f-int" />}
          {G > 0 && <rect x={x2} y={yG} width={NW} height={G * k} className="f-int" />}
          {O > 0 && <rect x={x3} y={yI} width={NW} height={O * k} className="f-offer" />}
          {F > 0 && <rect x={x3} y={yF} width={NW} height={F * k} className="f-node" />}
        </svg>
        <span className="lab" style={{ left: 0, top: 2 }}>
          <b>Applied</b>
          {total}
        </span>
        {I > 0 && has3 && (
          <span className="lab" style={{ left: "calc(49.4% - 2px)", top: 2 }}>
            <b>Interviewing / OA</b>
            {I}
            {pc(I)}
          </span>
        )}
        {spread(left).map((l, i) => (
          <span key={`l${i}`} className="lab" style={{ left: 22, top: l.y }}>{l.content}</span>
        ))}
        {middle.map((l, i) => (
          <span key={`m${i}`} className="lab" style={{ left: "calc(49.4% + 22px)", top: l.y }}>{l.content}</span>
        ))}
        {[...right, ...out].map((l, i) => (
          <span key={`r${i}`} className="lab r" style={{ right: 0, top: Math.max(l.y, 2) }}>{l.content}</span>
        ))}
        {!total && <span className="lab" style={{ left: 0, top: 40 }}>No applications in this range.</span>}
      </div>
      {/* Narrow screens drop the labels for this list. */}
      <dl className="flow-legend">
        <dt>Applied</dt><dd>{total}</dd>
        <dt className="sub">Interviewing / OA</dt><dd>{I}</dd>
        <dt className="sub">Rejected</dt><dd>{Rj}</dd>
        <dt className="sub">Ghosted</dt><dd>{G}</dd>
        <dt className="sub">Still waiting</dt><dd>{W}</dd>
        <dt>From Interviewing / OA</dt><dd>{I}</dd>
        <dt className="sub">Offer</dt><dd>{O}</dd>
        <dt className="sub">Failed Interview/OA</dt><dd>{F}</dd>
        <dt className="sub">Still interviewing</dt><dd>{S}</dd>
      </dl>
      <p className="flow-note">
        <span><i className="sw" style={{ background: "var(--blue)" }} />Offer</span>
        <span>
          <i className="sw" style={{ background: "repeating-linear-gradient(45deg,var(--hatch-line) 0 2px,var(--hatch-bg) 2px 5px)" }} />
          Still open
        </span>
      </p>
    </>
  )
}

/* ---------- Stage conversion ---------- */
export function StageConversion({ f }: { f: Funnel }) {
  const steps: [string, number, string | null][] = [
    ["Applied", f.total, null],
    ["Heard back", f.responded, "of applied"],
    ["Interview", f.interviews, "of those who replied"],
    ["Offer", f.offer, "of interviews"],
  ]
  // The pill names the step that loses the most applications (a count, so three interviews can't outweigh forty replies).
  let worst = -1
  let worstLost = 0
  steps.forEach(([, n], i) => {
    const lost = i ? steps[i - 1][1] - n : 0
    if (lost > worstLost) {
      worst = i
      worstLost = lost
    }
  })
  return (
    <div className="steps">
      {steps.map(([name, n, of], i) => {
        const width = f.total ? (n / f.total) * 100 : 0
        const prev = i ? steps[i - 1][1] : 0
        return (
          <div className="step" key={name}>
            <span className="step-name">{name}</span>
            <span className="step-bar" aria-hidden="true">
              <i className={name === "Offer" ? "offer" : undefined} style={{ width: `${width}%` }} />
              <span className={width < 12 ? "out" : undefined} style={width < 12 ? { left: `calc(${width}% + 8px)` } : undefined}>
                {n}
              </span>
            </span>
            <span className="step-rate">
              {i === 0 ? (
                <><b>{n}</b> sent</>
              ) : (
                <><b>{pct(n, prev)}%</b> {of}</>
              )}
              {worst === i && (
                <>
                  <br />
                  <span className="drop">Most lost here</span>
                </>
              )}
            </span>
            <span className="sr-only">{`${name}: ${n}`}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Small column charts (time to hear back, weekdays) ---------- */
export function ColumnChart({ values, labels, highlight, label }: { values: number[]; labels: string[]; highlight: number; label: string }) {
  const max = Math.max(1, ...values)
  const step = max <= 4 ? 1 : max <= 8 ? 2 : max <= 20 ? 5 : max <= 40 ? 10 : 20
  const topTick = Math.ceil((max + 0.01) / step) * step
  const ticks: number[] = []
  for (let t = 0; t <= topTick; t += step) ticks.push(t)
  const at = (t: number) => `${100 - (t / topTick) * 100}%`
  return (
    <div className="colchart">
      <div className="cols" role="img" aria-label={label}>
        <div className="yax" aria-hidden="true">
          {ticks.map((t) => <span key={t} style={{ top: at(t) }}>{t}</span>)}
        </div>
        <div className="plot" aria-hidden="true">
          {ticks.map((t) => <span key={t} className={t === 0 ? "gl base" : "gl"} style={{ top: at(t) }} />)}
          {values.map((v, i) => (
            <span key={i} className={i === highlight ? "bar-c hl" : "bar-c"} style={{ height: `${(v / topTick) * 100}%` }} title={`${labels[i]}: ${v}`} />
          ))}
        </div>
        <div className="xax" aria-hidden="true">
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      </div>
    </div>
  )
}

/* ---------- Activity calendar ---------- */
const LEVEL = (n: number) => (n === 0 ? undefined : n === 1 ? "l1" : n === 2 ? "l2" : n === 3 ? "l3" : "l4")

export function ActivityCalendar({ apps, w, today }: { apps: Application[]; w: DayWindow; today: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const weeks = calendarWeeks(w)
  const lastMonday = w.end - weekdayOf(w.end)
  const firstMonday = lastMonday - (weeks - 1) * 7
  const per = perDay(apps)
  const { current, longest } = streaks(per, today)
  const lastDay = Math.min(w.end, today)
  let activeDays = 0
  for (let d = firstMonday; d <= lastDay; d++) if (per.get(d)) activeDays += 1

  // The newest weeks sit at the right; start scrolled there.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [weeks, w.end])

  const cells: ReactNode[] = []
  let lastMonth = ""
  for (let c = 0; c < weeks; c++) {
    const monday = firstMonday + c * 7
    const month = monthName(monday)
    cells.push(<span key={`m${c}`} className="mo">{month !== lastMonth && c < weeks - 2 ? month : ""}</span>)
    lastMonth = month
    for (let r = 0; r < 7; r++) {
      const d = monday + r
      const n = per.get(d) ?? 0
      cells.push(
        d > today ? <i key={d} className="out" /> : <i key={d} className={LEVEL(n)} title={`${shortDate(d)}: ${plural(n, "application")}`} />
      )
    }
  }

  return (
    <div className="act">
      <dl className="act-stats">
        <div>
          <dt>Current streak</dt>
          <dd>{current}<small>{current === 1 ? "week" : "weeks"}</small></dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd>{longest}<small>{longest === 1 ? "week" : "weeks"}</small></dd>
        </div>
        <div>
          <dt>Days you applied</dt>
          <dd>{activeDays}<small>of {lastDay - firstMonday + 1}</small></dd>
        </div>
      </dl>
      <div>
        <div className="cal-scroll" ref={scrollRef}>
          <div className="cal" role="img" aria-label={`Applications per day over the last ${weeks} weeks. ${activeDays} days with at least one application.`}>
            {cells}
          </div>
        </div>
        <div className="cal-key" aria-hidden="true">
          Less<i /><i className="l1" /><i className="l2" /><i className="l3" /><i className="l4" />More
        </div>
      </div>
    </div>
  )
}
