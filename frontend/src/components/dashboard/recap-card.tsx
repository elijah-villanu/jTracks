import type { Ref } from "react"
import logoOnDark from "@/assets/JourneyJobLogoDark.png"
import logoOnLight from "@/assets/JourneyJobLogoLight.png"
import type { RecapDesign, RecapFigures } from "@/components/dashboard/chart-summaries"

function Foot({ dates, logo }: { dates: string; logo: string }) {
  return (
    <div className="card-foot">
      <span className="soft">{dates}</span>
      <img src={logo} alt="" width="78" height="15" />
    </div>
  )
}

/**
 * One 9:16 recap card, the node the dialog exports as a PNG. Its colours are
 * literals (app.css, `.card`), never theme tokens, because the image leaves the
 * app and has no theme. Nothing inside it animates, so the export always
 * matches what's on screen.
 */
export function RecapCard({ r, design, label, ref }: { r: RecapFigures; design: RecapDesign; label: string; ref?: Ref<HTMLDivElement> }) {
  if (design === "ink") {
    return (
      <div className="card card-ink" role="img" aria-label={label} ref={ref}>
        <div className="card-head">{r.title}</div>
        <div className="stats">
          <div>
            <div className="n-l">{r.total}</div>
            <span className="soft">Applications</span>
          </div>
          <div>
            <div className="n-l">{r.interviews}</div>
            <span className="soft">Interviews</span>
          </div>
          <div>
            <div className="n-l">{r.offers}</div>
            <span className="soft">{r.offerWord}</span>
          </div>
        </div>
        <div className="cbar">
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
        <Foot dates={r.dates} logo={logoOnDark} />
      </div>
    )
  }

  if (design === "field") {
    return (
      <div className="card card-field" role="img" aria-label={label} ref={ref}>
        <div className="card-head">{r.title}</div>
        <div>
          <div className="n-xl">{r.total}</div>
          <span>applications sent</span>
        </div>
        <div className="tiles">
          <div>
            <span className="n-m">{r.interviews}</span>
            <span className="soft">Interviews</span>
          </div>
          <div>
            <span className="n-m">{r.offers}</span>
            <span className="soft">{r.offerWord}</span>
          </div>
          <div>
            <span className="n-m">{r.responseRate}%</span>
            <span className="soft">Response</span>
          </div>
          <div>
            <span className="n-m">{r.ghostRate}%</span>
            <span className="soft">Ghosted</span>
          </div>
        </div>
        <Foot dates={r.dates} logo={logoOnLight} />
      </div>
    )
  }

  const ranked: [string, string | number][] = [
    ["Applications", r.total],
    ["Interviews", r.interviews],
    ["Response rate", `${r.responseRate}%`],
    ["Ghost rate", `${r.ghostRate}%`],
    ["Rejection/fail rate", `${r.rejectionFailRate}%`],
    [r.offerWord, r.offers],
  ]
  return (
    <div className="card card-paper" role="img" aria-label={label} ref={ref}>
      <div className="card-head">{r.title}</div>
      <ol className="rank">
        {ranked.map(([name, value], i) => (
          <li key={name}>
            <span className="soft">{i + 1}</span>
            <span>{name}</span>
            <b>{value}</b>
          </li>
        ))}
      </ol>
      <Foot dates={r.dates} logo={logoOnLight} />
    </div>
  )
}
