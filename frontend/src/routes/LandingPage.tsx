import { ChevronLeft, ChevronRight, CircleAlert, Moon, Sun } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate } from "react-router"
import logoOnDark from "@/assets/JourneyJobLogoDark.png"
import logoOnLight from "@/assets/JourneyJobLogoLight.png"
import { Logo } from "@/components/layout/logo"
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"
import { useTheme } from "@/hooks/useTheme"
import {
  DEMO_GHOST_ROWS,
  DEMO_MONTH,
  DEMO_RANGES,
  type DemoRecap,
  type RangeKey,
} from "@/routes/landing/demo-data"
import "@/routes/landing/landing.css"

// Keep in sync with index.html, which carries the same pair for crawlers.
const PAGE_TITLE = "JourneyJob — track the search, share the month"
const PAGE_DESCRIPTION =
  "JourneyJob keeps every job application on one private board, marks the quiet ones as Ghosted, and turns any range into a Stories recap card."

/** Marks an element to rise once as it scrolls in, `i` steps of 70ms after the first of its group (landing.css). */
const rise = (i = 0) => ({ "data-rise": "", style: { "--i": i } as CSSProperties })

const offerWord = (n: number) => (n === 1 ? "Offer" : "Offers")
const spoken = (rate: string) => rate.replace("%", " percent")
const SAMPLE = "Sample recap, August 2026"

/**
 * The landing page at `/`, built from docs/wireframes/landing-v5.html.
 * It does no authenticated work: it never reads the auth context or mounts
 * ApplicationsProvider, which is why App.tsx can declare it outside both route guards.
 */
export default function LandingPage() {
  useDocumentMetadata(PAGE_TITLE, PAGE_DESCRIPTION)
  const rootRef = useRef<HTMLDivElement>(null)

  // Entrances: each part rises once as its section arrives (only when motion is welcome; see landing.css).
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const el = e.target as HTMLElement
          el.dataset.in = ""
          io.unobserve(el)
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    )
    rootRef.current?.querySelectorAll("[data-rise]").forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="landing" ref={rootRef}>
      <a className="btn btn-solid btn-sm skip" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="frame">
          <Logo className="logo" />
          <nav className="nav" aria-label="Main">
            <ThemeButton />
            <a className="nav-link" href="#how">
              How it works
            </a>
            <a className="nav-link" href="#recaps">
              Recaps
            </a>
            <Link className="nav-login" to="/login">
              Log in
            </Link>
            <Link className="btn btn-solid btn-sm" to="/signup">
              Start your journey
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* Hero: the shared artifact, one card at a time */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="frame hero-grid">
            <div className="hero-copy">
              <h1 id="hero-title" {...rise()}>
                <span>Track the search.</span> <span>Share the month.</span>
              </h1>
              <p className="lede" {...rise(1)}>
                Every application on one private board. Any month becomes a card you can post.
              </p>
              <div className="actions" {...rise(2)}>
                <Link className="btn btn-solid" to="/signup">
                  Start your journey
                </Link>
                <Link className="btn btn-soft" to="/login">
                  Log in
                </Link>
              </div>
            </div>
            <HeroCarousel />
          </div>
        </section>

        {/* How it works: what you give, what comes back */}
        <section id="how" className="section" aria-labelledby="how-title">
          <div className="frame">
            <h2 id="how-title" className="how-head" {...rise()}>
              How the card gets made
            </h2>
            <div className="rows">
              <PasteStep />
              <GhostStep />
              <div className="row row-wide">
                <div className="row-text">
                  <h3 className="order" {...rise()}>
                    Visualize your progress
                  </h3>
                </div>
                <Funnel />
              </div>
            </div>
          </div>
        </section>

        <RangeShowcase />

        {/* Close: the first step, already open */}
        <section className="close" aria-labelledby="close-title">
          <div className="frame close-grid">
            <div className="close-copy">
              <h2 id="close-title" {...rise()}>
                Start with one link
              </h2>
              <p {...rise(1)}>As easy as pasting a link. Start tracking now</p>
            </div>
            <StartForm />
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="frame">
          <span>JourneyJob</span>
          <nav aria-label="Footer">
            <Link to="/app">Open the app</Link>
            <Link to="/login">Log in</Link>
            <Link to="/signup">Sign up</Link>
          </nav>
          <span className="end">© 2026</span>
        </div>
      </footer>
    </div>
  )
}

/** One button: it shows the mode you're in (sun or moon), and a press switches to the other. */
function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  return (
    <button className="icon-btn" type="button" aria-label="Dark mode" aria-pressed={dark} onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
    </button>
  )
}

/* ---------- recap cards: pictures of the exported image, fixed palette in both themes ---------- */

function Ticks({ on }: { on: number }) {
  return (
    <div className="ticks">
      {[0, 1, 2].map((i) => (
        <i key={i} className={i === on ? "on" : undefined} />
      ))}
    </div>
  )
}

function CardFoot({ dates, logo }: { dates: string; logo: string }) {
  return (
    <div className="card-foot">
      <span className="soft">{dates}</span>
      <img src={logo} alt="" width="78" height="15" />
    </div>
  )
}

/** The dark card: three figures, then the outcome bar sitting on the footer. Also the Recaps section's live card. */
function InkCard({ r, label, tick }: { r: DemoRecap; label: string; tick?: number }) {
  return (
    <div className="card card-ink" role="img" aria-label={label}>
      {tick !== undefined && <Ticks on={tick} />}
      <div className="card-head">{r.title}</div>
      <div className="stats">
        <div>
          <div className="n-l">{r.applications}</div>
          <span className="soft">Applications</span>
        </div>
        <div>
          <div className="n-l">{r.interviews}</div>
          <span className="soft">Interviews</span>
        </div>
        <div>
          <div className="n-l">{r.offers}</div>
          <span className="soft">{offerWord(r.offers)}</span>
        </div>
      </div>
      <div className="bar">
        <span className="seg-int" style={{ flex: r.interviews }} />
        <span className="seg-rej" style={{ flex: r.rejected }} />
        <span className="seg-gho" style={{ flex: r.ghosted }} />
        <span className="seg-wait" style={{ flex: r.waiting }} />
      </div>
      <div className="bar-key soft">
        <span>{r.interviews} interviewed</span>
        <span>{r.rejected} rejected</span>
        <span>{r.ghosted} ghosted</span>
        <span>{r.waiting} waiting</span>
      </div>
      <CardFoot dates={r.dates} logo={logoOnDark} />
    </div>
  )
}

const m = DEMO_MONTH
const HERO_CARDS: ReactNode[] = [
  <InkCard
    key="ink"
    r={m}
    tick={0}
    label={`Card 1 of 3. ${SAMPLE}: ${m.applications} applications, ${m.interviews} interviews, ${m.offers} ${offerWord(m.offers).toLowerCase()}.`}
  />,
  <div
    key="field"
    className="card card-field"
    role="img"
    aria-label={`Card 2 of 3. ${SAMPLE}: ${m.applications} applications sent, ${m.interviews} interviews, ${m.offers} ${offerWord(m.offers).toLowerCase()}, ${spoken(m.responseRate)} response rate, ${spoken(m.ghostRate)} ghost rate.`}
  >
    <Ticks on={1} />
    <div className="card-head">{m.title}</div>
    <div>
      <div className="n-xl">{m.applications}</div>
      <span>applications sent</span>
    </div>
    <div className="tiles">
      <div>
        <span className="n-m">{m.interviews}</span>
        <span className="soft">Interviews</span>
      </div>
      <div>
        <span className="n-m">{m.offers}</span>
        <span className="soft">{offerWord(m.offers)}</span>
      </div>
      <div>
        <span className="n-m">{m.responseRate}</span>
        <span className="soft">Response</span>
      </div>
      <div>
        <span className="n-m">{m.ghostRate}</span>
        <span className="soft">Ghosted</span>
      </div>
    </div>
    <CardFoot dates={m.dates} logo={logoOnLight} />
  </div>,
  <div
    key="paper"
    className="card card-paper"
    role="img"
    aria-label={`Card 3 of 3. ${SAMPLE}, ranked: ${m.applications} applications, ${m.interviews} interviews, ${spoken(m.responseRate)} response rate, ${spoken(m.ghostRate)} ghost rate, ${spoken(m.rejectionFailRate)} rejection or fail rate, ${m.offers} ${offerWord(m.offers).toLowerCase()}.`}
  >
    <Ticks on={2} />
    <div className="card-head">{m.title}</div>
    <ol className="rank">
      {(
        [
          ["Applications", m.applications],
          ["Interviews", m.interviews],
          ["Response rate", m.responseRate],
          ["Ghost rate", m.ghostRate],
          ["Rejection/fail rate", m.rejectionFailRate],
          ["Offers", m.offers],
        ] as const
      ).map(([name, value], i) => (
        <li key={name}>
          <span className="soft">{i + 1}</span>
          <span>{name}</span>
          <b>{value}</b>
        </li>
      ))}
    </ol>
    <CardFoot dates={m.dates} logo={logoOnLight} />
  </div>,
]

/** One card at a time. Native scroll-snap does the swiping; the arrows scroll to a card. */
function HeroCarousel() {
  const reduce = usePrefersReducedMotion()
  const viewRef = useRef<HTMLUListElement>(null)
  const prevRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const [current, setCurrent] = useState(0)
  const [status, setStatus] = useState("")
  const currentRef = useRef(0)
  const byArrow = useRef(false)
  const arrowTimer = useRef(0)
  const last = HERO_CARDS.length - 1

  const show = useCallback(
    (i: number) => {
      const focused = document.activeElement
      currentRef.current = i
      setCurrent(i)
      setStatus(`Card ${i + 1} of ${last + 1}`)
      // A hidden arrow cannot keep keyboard focus, so hand it to the other one.
      if (focused === nextRef.current && i === last) prevRef.current?.focus()
      if (focused === prevRef.current && i === 0) nextRef.current?.focus()
    },
    [last]
  )

  const go = (i: number) => {
    const view = viewRef.current
    if (!view || i < 0 || i > last) return
    show(i) // the bars and arrows answer on press, not when the scroll lands
    byArrow.current = true
    window.clearTimeout(arrowTimer.current)
    arrowTimer.current = window.setTimeout(() => {
      byArrow.current = false
    }, 700)
    const s = view.children[i] as HTMLElement
    view.scrollTo({ left: s.offsetLeft - (view.clientWidth - s.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" })
  }

  // Swiping and trackpads move the strip natively; whichever card sits nearest the middle becomes current.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (byArrow.current) return
        const middle = view.scrollLeft + view.clientWidth / 2
        const away = (s: Element) => Math.abs((s as HTMLElement).offsetLeft + (s as HTMLElement).offsetWidth / 2 - middle)
        const slides = Array.from(view.children)
        const nearest = slides.reduce((best, s, n) => (away(s) < away(slides[best]) ? n : best), 0)
        if (nearest !== currentRef.current) show(nearest)
      })
    }
    const onScrollEnd = () => {
      byArrow.current = false
      window.clearTimeout(arrowTimer.current)
    }
    view.addEventListener("scroll", onScroll, { passive: true })
    view.addEventListener("scrollend", onScrollEnd)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(arrowTimer.current)
      view.removeEventListener("scroll", onScroll)
      view.removeEventListener("scrollend", onScrollEnd)
    }
  }, [show])

  return (
    <div
      className="carousel"
      data-ui
      {...rise(3)}
      role="group"
      aria-roledescription="carousel"
      aria-label="One sample month as a recap card, in three designs"
    >
      <button
        ref={prevRef}
        className={`car-arrow car-prev${current === 0 ? " is-off" : ""}`}
        type="button"
        aria-label="Previous card"
        aria-controls="car-view"
        onClick={() => go(currentRef.current - 1)}
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <ul className="car-view" id="car-view" ref={viewRef} tabIndex={0} aria-label="Recap cards">
        {HERO_CARDS.map((card, n) => (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- pointer shortcut onto a peeking card; keyboard users have the arrows and the scrollable list
          <li
            key={n}
            className={`slide ${n === current ? "is-current" : n < current ? "is-before" : "is-after"}`}
            onClick={() => n !== currentRef.current && go(n)}
          >
            {card}
          </li>
        ))}
      </ul>
      <button
        ref={nextRef}
        className={`car-arrow car-next${current === last ? " is-off" : ""}`}
        type="button"
        aria-label="Next card"
        aria-controls="car-view"
        onClick={() => go(currentRef.current + 1)}
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </div>
  )
}

/* ---------- how it works ---------- */

function PasteStep() {
  return (
    <div className="row">
      <div className="row-text">
        <h3 className="order" {...rise()}>
          Paste the posting
        </h3>
        <p {...rise(1)}>Greenhouse and Workday links fill in the form.</p>
        <div className="call" {...rise(2)}>
          <label htmlFor="posting-1">Job posting link</label>
          {/* A picture of the step, so it shows a link rather than taking one. */}
          <input id="posting-1" type="url" defaultValue="https://boards.greenhouse.io/northwind/jobs/4182093" spellCheck={false} readOnly />
        </div>
      </div>
      <div className="ui" data-ui {...rise(3)}>
        <p className="ui-title">
          New application <small>Autofilled from Greenhouse</small>
        </p>
        <div className="ui-form">
          <div className="ui-2">
            <div className="ui-field">
              <span>Company</span>
              <div className="filled">Northwind</div>
            </div>
            <div className="ui-field">
              <span>Location</span>
              <div className="filled">Remote (US)</div>
            </div>
          </div>
          <div className="ui-field">
            <span>Job title</span>
            <div className="filled">Software Engineer, New Grad</div>
          </div>
          <div className="ui-2">
            <div className="ui-field">
              <span>Status</span>
              <div>Applied</div>
            </div>
            <div className="ui-field">
              <span>Date applied</span>
              <div>Nov 4, 2026</div>
            </div>
          </div>
          <div className="ui-actions">
            <span className="ui-btn ui-btn-ghost">Cancel</span>
            <span className="ui-btn ui-btn-blue">Save application</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The ghost threshold re-sorts the rows on screen, and the count is taken from those same rows. */
function GhostStep() {
  const [limit, setLimit] = useState(14)
  const ghosted = DEMO_GHOST_ROWS.filter((r) => r.days >= limit).length
  return (
    <div className="row row-flip">
      <div className="row-text">
        <h3 className="order" {...rise()}>
          Then choose when silence counts
        </h3>
        <p {...rise(1)}>Quiet past your limit turns Ghosted. Interviews never do.</p>
        <div className="call" {...rise(2)}>
          <label htmlFor="ghost-days">
            Ghost after <output htmlFor="ghost-days">{limit}</output> days
          </label>
          <input
            id="ghost-days"
            type="range"
            min={7}
            max={30}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            aria-describedby="ghost-sum"
          />
        </div>
      </div>
      <div className="ui" data-ui {...rise(3)}>
        <table className="ui-table">
          <caption>Waiting to hear back</caption>
          <thead>
            <tr>
              <th scope="col">Company</th>
              <th scope="col" className="role">
                Role
              </th>
              <th scope="col">Quiet for</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_GHOST_ROWS.map((r) => {
              const isGhosted = r.days >= limit
              return (
                <tr key={r.company}>
                  <td className="co">{r.company}</td>
                  <td className="role">{r.role}</td>
                  <td className="quiet">{r.days} days</td>
                  <td>
                    <span className={isGhosted ? "pill pill-ghosted" : "pill pill-applied"}>
                      {isGhosted ? "Ghosted" : "Applied"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="ui-sum" id="ghost-sum" aria-live="polite">
          <b>{ghosted}</b> of {DEMO_GHOST_ROWS.length} ghosted
        </p>
      </div>
    </div>
  )
}

type Band = readonly [number, number]

/** A ribbon from the band a0-a1 at x0 into the band b0-b1 at x1. */
function ribbon(x0: number, x1: number, [a0, a1]: Band, [b0, b1]: Band) {
  const c = (x0 + x1) / 2
  return `M${x0} ${a0} C${c} ${a0} ${c} ${b0} ${x1} ${b0} L${x1} ${b1} C${c} ${b1} ${c} ${a1} ${x0} ${a1} Z`
}

/**
 * The month's pipeline, drawn from the same numbers as its labels.
 * shortcut: 8px per application fills the 860x320 box at 37 applications; scale it down if the sample month grows past that.
 */
function Funnel() {
  const top = 24
  const band = (from: number, n: number): Band => [from, from + n * 8]
  const labelTop = ([a, b]: Band) => (a + b) / 2 - 8
  const rect = (x: number, [y0, y1]: Band) => ({ x, y: y0, width: 14, height: y1 - y0 })
  // Applied, stacked: the outcomes so far, then the ones still waiting.
  const toInt = band(top, m.interviews)
  const toRej = band(toInt[1], m.rejected)
  const toGho = band(toRej[1], m.ghosted)
  const waiting = band(toGho[1], m.waiting)
  // The middle column spaces its outcomes apart.
  const rej = band(toInt[1] + 20, m.rejected)
  const gho = band(rej[1] + 20, m.ghosted)
  // Interviewing splits into Offer and Failed; the rest are still interviewing.
  const toOffer = band(top, m.offers)
  const toFail = band(toOffer[1], m.failed)
  const still = band(toFail[1], m.stillInterviewing)
  const fail = band(toOffer[1] + 24, m.failed)

  return (
    <figure className="ui ui-flow" data-ui {...rise(1)}>
      <p className="ui-title">
        Pipeline · {m.dates} <small>{m.applications} applications</small>
      </p>
      <div className="flow">
        <div className="flow-plot">
          <svg viewBox="0 0 860 320" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <pattern id="landing-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" className="hatch-bg" />
                <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2" className="hatch-line" />
              </pattern>
            </defs>
            <path className="f-int" d={ribbon(14, 423, toInt, toInt)} />
            <path className="f-rej" d={ribbon(14, 423, toRej, rej)} />
            <path className="f-gho" d={ribbon(14, 423, toGho, gho)} />
            <path className="f-offer" d={ribbon(437, 846, toOffer, toOffer)} />
            <path className="f-fail" d={ribbon(437, 846, toFail, fail)} />
            <rect className="f-node" {...rect(0, [top, toGho[1]])} />
            <rect fill="url(#landing-hatch)" {...rect(0, waiting)} />
            <rect className="f-node" {...rect(423, [top, toFail[1]])} />
            <rect fill="url(#landing-hatch)" {...rect(423, still)} />
            <rect className="f-mid" {...rect(423, rej)} />
            <rect className="f-mid" {...rect(423, gho)} />
            <rect className="f-offer" {...rect(846, toOffer)} />
            <rect className="f-node" {...rect(846, fail)} />
          </svg>
          <span className="lab" style={{ left: 0, top: 2 }}>
            <b>Applied</b> {m.applications}
          </span>
          <span className="lab" style={{ left: 22, top: labelTop(waiting) }}>
            {m.waiting} waiting
          </span>
          <span className="lab" style={{ left: "calc(50% - 7px)", top: 2 }}>
            <b>Interviewing / OA</b> {m.interviews}
          </span>
          <span className="lab" style={{ left: "calc(50% + 14px)", top: still[1] + 2 }}>
            {m.stillInterviewing} still interviewing
          </span>
          <span className="lab" style={{ left: "calc(50% + 16px)", top: labelTop(rej) }}>
            <b>Rejected</b> {m.rejected}
          </span>
          <span className="lab" style={{ left: "calc(50% + 16px)", top: labelTop(gho) }}>
            <b>Ghosted</b> {m.ghosted}
          </span>
        </div>
        <div className="flow-out">
          <span className="lab" style={{ left: 0, top: labelTop(toOffer) }}>
            <b>Offer</b> {m.offers}
          </span>
          <span className="lab" style={{ left: 0, top: labelTop(fail) }}>
            <b>Failed Interview/OA</b> {m.failed}
          </span>
        </div>
      </div>
      <dl className="flow-legend">
        <dt>Applied</dt>
        <dd>{m.applications}</dd>
        <dt className="sub">Interviewing / OA</dt>
        <dd>{m.interviews}</dd>
        <dt className="sub">Rejected</dt>
        <dd>{m.rejected}</dd>
        <dt className="sub">Ghosted</dt>
        <dd>{m.ghosted}</dd>
        <dt className="sub">Still waiting</dt>
        <dd>{m.waiting}</dd>
        <dt>From Interviewing / OA</dt>
        <dd>{m.interviews}</dd>
        <dt className="sub">Offer</dt>
        <dd>{m.offers}</dd>
        <dt className="sub">Failed Interview/OA</dt>
        <dd>{m.failed}</dd>
        <dt className="sub">Still interviewing</dt>
        <dd>{m.stillInterviewing}</dd>
      </dl>
      <figcaption className="flow-note">Striped: still open</figcaption>
    </figure>
  )
}

/* ---------- showcase: any range becomes a card ---------- */

const RANGE_KEYS: RangeKey[] = ["week", "month", "year", "all"]

function RangeShowcase() {
  const reduce = usePrefersReducedMotion()
  const [range, setRange] = useState<RangeKey>("month")
  const [shown, setShown] = useState<RangeKey>("month")
  const [swapping, setSwapping] = useState(false)
  const rangeRef = useRef<RangeKey>("month")
  const timer = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  const select = useCallback(
    (k: RangeKey) => {
      if (k === rangeRef.current) return
      rangeRef.current = k
      setRange(k)
      window.clearTimeout(timer.current)
      if (reduce) {
        setShown(k)
        setSwapping(false)
        return
      }
      setSwapping(true)
      timer.current = window.setTimeout(() => {
        setShown(k)
        setSwapping(false)
      }, 120)
    },
    [reduce]
  )

  // Pinned story on wide screens: the step crossing the middle of the screen drives the card.
  useEffect(() => {
    const wide = matchMedia("(min-width: 1120px)")
    const steps = new IntersectionObserver(
      (entries) => {
        if (!wide.matches) return
        for (const e of entries) if (e.isIntersecting) select((e.target as HTMLElement).dataset.step as RangeKey)
      },
      { rootMargin: "-45% 0px -45% 0px" }
    )
    listRef.current?.querySelectorAll("[data-step]").forEach((el) => steps.observe(el))
    return () => steps.disconnect()
  }, [select])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const r = DEMO_RANGES[shown]
  return (
    <section id="recaps" className="section" aria-labelledby="recaps-title">
      <div className="frame show-grid">
        <div className="show-index">
          <h2 id="recaps-title" {...rise()}>
            Any range becomes a card
          </h2>
          <ul className="ranges" ref={listRef} {...rise(1)}>
            {RANGE_KEYS.map((k) => (
              <li key={k} data-step={k}>
                <button className="range-btn" type="button" aria-pressed={range === k} aria-controls="sheet" onClick={() => select(k)}>
                  {DEMO_RANGES[k].title}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="stage-col">
          <div className="stage-pin">
            <div className="stage">
              <div className={swapping ? "sheet is-swapping" : "sheet"} id="sheet" data-ui aria-live="polite">
                <InkCard
                  r={r}
                  label={`Recap for ${r.title.toLowerCase()}: ${r.applications} applications, ${r.interviews} interviews, ${r.offers} ${offerWord(r.offers).toLowerCase()}.`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- close: the first step ---------- */

const LINK_ERROR = "That is not a full link. It should start with https://"
const isLink = (value: string) => {
  try {
    return /^https?:$/.test(new URL(value.trim()).protocol)
  } catch {
    return false
  }
}
// The link is optional, so an empty field is fine.
const isOk = (value: string) => !value.trim() || isLink(value)

/** The link is checked when the visitor leaves the field or submits; a good one rides along to /signup. */
function StartForm() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [posting, setPosting] = useState("")
  const [error, setError] = useState(false)

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isOk(posting)) {
      setError(true)
      inputRef.current?.focus()
      return
    }
    const params = new URLSearchParams()
    if (posting.trim()) params.set("posting", posting.trim())
    params.set("status", String(new FormData(e.currentTarget).get("status")))
    navigate(`/signup?${params}`)
  }

  return (
    <form className="start-form" data-ui noValidate onSubmit={submit} {...rise(2)}>
      <div>
        <label className="field-label" htmlFor="posting">
          Job posting link
        </label>
        <input
          ref={inputRef}
          className="start-input"
          id="posting"
          name="posting"
          type="url"
          inputMode="url"
          placeholder="https://boards.greenhouse.io/…"
          spellCheck={false}
          aria-describedby="posting-note"
          aria-invalid={error || undefined}
          value={posting}
          onChange={(e) => {
            setPosting(e.target.value)
            if (error && isOk(e.target.value)) setError(false)
          }}
          onBlur={() => setError(!isOk(posting))}
        />
        <p className={error ? "field-note is-error" : "field-note"} id="posting-note" aria-live="polite">
          <CircleAlert aria-hidden="true" />
          <span>{error ? LINK_ERROR : ""}</span>
        </p>
      </div>
      <div className="start-row">
        <fieldset>
          <legend>Status</legend>
          <div className="seg">
            <label>
              <input type="radio" name="status" value="applied" defaultChecked />
              Applied
            </label>
            <label>
              <input type="radio" name="status" value="saved" />
              Saved
            </label>
          </div>
        </fieldset>
        <button className="btn" type="submit">
          Start your journey
        </button>
      </div>
    </form>
  )
}
