import { Briefcase, Ghost, Share2, Workflow } from "lucide-react"
import { Link } from "react-router"
import { RecapCard } from "@/components/dashboard/recap-card"
import { SankeyChart } from "@/components/dashboard/sankey-chart"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { DEMO_RECAP, DEMO_SANKEY } from "@/routes/landing/demo-data"

const PAGE_TITLE = "jTracks — see where your job search stalls"
const PAGE_DESCRIPTION =
  "jTracks is a job application tracker that keeps every application in one place, marks the ones that go quiet, and turns your search into a funnel you can read at a glance."

/**
 * F43's feature trio. Every entry here is a claim about shipped V2
 * behaviour and has to stay one -- the acceptance criterion is "every
 * feature claim maps to a shipped behavior", so each carries the code
 * that backs it:
 *
 * 1. Auto-ghosting after a configurable threshold -- `SettingsPage.tsx`'s
 *    "Default ghost days" field ("Applications with no status update for
 *    this many days are automatically marked Ghosted. Individual
 *    applications can override this in their own edit form.").
 * 2. Pre- vs post-interview failure -- `Rejected` and `Failed
 *    Interview/OA` are separate statuses (`components/StatusBadge.tsx`)
 *    and separate sinks in the pipeline flow (`sankey-chart.tsx`).
 * 3. The Stories-format recap -- `recap-dialog.tsx` exports a 270x480
 *    card at `pixelRatio: 4` (1080x1920) over the full
 *    week/month/year/all/custom range set, with Download always available
 *    and Share gated on `navigator.share`, across the three designs in
 *    `recap-skins/`.
 *
 * **"Failed Interview/OA" is never shortened to "Failed"** here, per
 * R10.3 and the V2 shared contract -- the whole point of feature 2 is
 * that the two outcomes are distinct, so softening the label in the copy
 * that sells it would be self-defeating.
 */
const FEATURES = [
  {
    icon: Ghost,
    title: "Ghosting handled for you",
    body: "Pick how long silence counts as ghosted. Anything that goes quiet past your threshold is marked Ghosted automatically, so a dead lead stops sitting in your list looking alive. Individual applications can override the default.",
  },
  {
    icon: Workflow,
    title: "A funnel that separates the two ways you lose",
    body: "Rejected and Failed Interview/OA are different outcomes, and the pipeline flow keeps them apart. You can see whether applications are dying before you get an interview or after one — which are two completely different problems to fix.",
  },
  {
    icon: Share2,
    title: "A recap worth posting",
    body: "Turn any week, month, year or custom range into a 9:16 card in one of three designs, then download it or share it straight from your phone. It exports at 1080×1920, the size Stories want.",
  },
] as const

/** The product lockup, reused by the header and the footer. */
function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-semibold ${className ?? ""}`}>
      <Briefcase className="size-5 text-primary" aria-hidden="true" />
      jTracks
    </span>
  )
}

/**
 * F41 + F42 + F43 + F44: the public landing page at `/`.
 *
 * **The rule that shapes this file: it does no authenticated work.**
 * (F41 / R10.2, and a stated V2.1 success metric.) It is declared in
 * `App.tsx` outside both `ProtectedRoute` and `GuestRoute`, so it renders
 * identically signed in or out -- that stable-URL property is the entire
 * reason V2.1 moved the app to `/app` (routing option B). Concretely,
 * nothing in this module or anything it imports may:
 *   - mount `ApplicationsProvider` (it fires `GET /applications` on mount);
 *   - call any authenticated endpoint;
 *   - read `useAuth().isLoading` as a render gate. `AuthProvider`'s
 *     boot-time `POST /auth/refresh` still fires -- that's its job -- but
 *     this page must paint before it settles, so it never touches the auth
 *     context at all. That is also why the header links to `/login` and
 *     `/signup` unconditionally rather than swapping in a "Go to app"
 *     link for a signed-in visitor: knowing which to show would mean
 *     reading `user`, and waiting on `isLoading` to know it.
 *
 * **No MagicUI or Motion here.** F43 says so explicitly -- landing-page
 * motion is F45 (milestone FV10), and adding entrance animation now would
 * pre-empt the conventions pass that owns the timing decisions. Plain
 * shadcn primitives and Tailwind only.
 *
 * **Colors are tokens.** `frontend/src/index.css`'s variables, per
 * `.claude/rules/shadcn-ui.md`. The one fixed-literal palette on this page
 * belongs to `RecapCard`, which is theme-independent by contract (F28) --
 * that is a documented, scoped exception owned by the card, not a licence
 * for landing chrome to hardcode anything.
 */
export default function LandingPage() {
  useDocumentMetadata(PAGE_TITLE, PAGE_DESCRIPTION)

  /*
    The product visual's two cards share a grid row, and the recap column
    sets that row's height: `RecapCard` is a fixed 480px card plus its
    framing, which comes to ~614px. A fixed-height Sankey beside it left
    318px of measured dead space inside the pipeline card -- over half of
    it empty -- because the grid stretches both columns to the taller one
    while the chart stayed at its narrow-width size.

    So the chart's height tracks the layout rather than being a constant:
    the taller value applies only from `lg` up, which is exactly where
    `lg:grid-cols-12` turns this into two columns and creates the
    stretching in the first place. Below `lg` the grid is a single column,
    each card is content-sized, and 220px is the right size for the chart
    at those widths (F15/F36's legibility work is calibrated there).
    A media query rather than CSS because `SankeyChart` takes a numeric
    `height` prop -- it draws an SVG, it does not lay one out.
  */
  const isTwoColumnVisual = useMediaQuery("(min-width: 1024px)")

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/*
        A11y (WCAG 2.4.1): the app's skip link lives in `AppLayout`, which
        this route deliberately does not render, so `/` needs its own --
        F44 asks for that call to be made rather than inherited. It earns
        one: the header puts five focusable controls (three theme buttons,
        two CTAs) ahead of the content, and the hero's primary CTA is not
        the first tab stop. Same markup and same visually-hidden-until-
        focused treatment as AppLayout's, so the behaviour is identical
        across the two shells.
      */}
      <a
        href="#landing-main"
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to main content
      </a>

      <header className="border-b border-border">
        {/*
          `flex-wrap` is a deliberate safety net rather than a layout
          choice: the widths below are measured, not observed in a real
          375px browser, so if a future label change pushes the row past
          the viewport it wraps to a second line instead of putting the
          whole page into a horizontal scroll (R13.1 / F44).
        */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          {/*
            Not a link: this lockup is already on the page it would point
            at. F40 flagged the equivalent decision in `AppLayout` -- the
            footer's lockup below *is* a link, and it points at `/app`,
            deliberately.
          */}
          <Wordmark />

          <div className="flex items-center gap-2 sm:gap-3">
            {/*
              R11.1's second half: F26's exported `ThemeToggle`, unchanged,
              in the landing header. `ThemeProvider` sits above
              `BrowserRouter` in `main.tsx`, so the choice made here is the
              same provider state (and the same `jtracks_theme` localStorage
              key) the authenticated app reads -- it carries into `/app`
              with no extra wiring.
            */}
            <ThemeToggle />
            {/*
              Hidden below `sm` for the same reason `AppLayout` gates its
              action cluster at `lg` (F33/R13.1): measured at 375px the
              wordmark (~83px) plus the theme group (92px), "Log in"
              (~62px), "Get started" (~88px), their gaps and the container's
              `px-4` come to ~385px, which is a horizontal scroll on the
              page F44 forbids one on. Dropping this one control brings it
              to ~315px. Nothing is lost: the hero's secondary CTA and the
              footer both link to `/login`, both above the fold on a phone.
            */}
            <Button variant="ghost" className="hidden sm:inline-flex" render={<Link to="/login" />}>
              Log in
            </Button>
            <Button render={<Link to="/signup" />}>Get started</Button>
          </div>
        </div>
      </header>

      <main
        id="landing-main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 outline-none"
      >
        {/*
          Hero, following the Linear reference's restraint: one confident
          headline, one supporting line, and the product visual immediately
          underneath rather than a wall of copy before it.
        */}
        <section aria-labelledby="hero-heading" className="py-16 sm:py-24">
          {/*
            `text-muted-foreground`, not `text-primary`, even though the
            incident.io reference colours its equivalent line in the accent.
            docs/decisions/magicui-conventions.md's F27/F29 record measures
            `--primary` as body text at 3.44:1 in light mode -- under the
            4.5:1 floor -- and explicitly says to flag it "before either
            gets used." An accent-coloured eyebrow here would have been the
            app's first live instance of exactly that. The accent still
            carries the page via the primary CTAs (measured 5.75:1) and the
            `aria-hidden` icons, which take the 3:1 non-text floor.
          */}
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Job application tracker
          </p>
          <h1
            id="hero-heading"
            className="mt-4 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            Know exactly where your job search stalls.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
            jTracks keeps every application in one place, marks the ones that go quiet, and turns
            the whole search into a funnel you can read at a glance.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button className="h-11 px-6 text-base" render={<Link to="/signup" />}>
              Create your account
            </Button>
            <Button
              variant="outline"
              className="h-11 px-6 text-base"
              render={<Link to="/login" />}
            >
              Log in
            </Button>
          </div>
        </section>

        {/*
          F42's product visual. Both panels are *live renders of the real
          components* (`SankeyChart`, `RecapCard`) against
          `landing/demo-data.ts`, never screenshots -- R10.4's point being
          that the landing page then cannot drift from the product, because
          a change to either component changes this page too.

          Both are rendered rather than one because they answer different
          questions and the section has room for both side by side: the
          flow is the analytical story (the Amplitude/Mixpanel references),
          the card is the shareable artefact (Spotify Wrapped/Polarsteps).
          The framing follows the Mixpanel dashboard-embed pattern -- each
          visual sits in a titled card with a subtitle naming the data
          behind it, so nobody reads the sample numbers as a real user's.
        */}
        <section aria-labelledby="visual-heading" className="border-t border-border py-16 sm:py-20">
          <h2
            id="visual-heading"
            className="max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
          >
            One search, two views
          </h2>
          <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">
            The pipeline flow shows where applications actually end up. The recap turns any stretch
            of that search into something you can post.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-12">
            <Card className="lg:col-span-7">
              <CardHeader>
                <h3 className="font-medium">Pipeline flow</h3>
                <p className="text-sm text-muted-foreground">
                  Sample search · 128 applications, all time
                </p>
              </CardHeader>
              <CardContent>
                {/*
                  Omitting `width` makes the chart measure this card's own
                  width via ResizeObserver (F36), which is what keeps it
                  legible from 375px up without a scaled viewBox.
                  `interactive` (F38) is on so the visual behaves like the
                  real dashboard rather than a picture of it; it also
                  renders the `ChartDataTable` fallback, so the funnel is
                  readable to a screen reader here exactly as it is in-app.
                */}
                <SankeyChart
                  data={DEMO_SANKEY}
                  height={isTwoColumnVisual ? 500 : 220}
                  fontSize={10}
                  className="w-full"
                  interactive
                />
              </CardContent>
            </Card>

            <Card className="lg:col-span-5">
              <CardHeader>
                <h3 className="font-medium">Shareable recap</h3>
                <p className="text-sm text-muted-foreground">
                  Sample month · exported at 1080×1920
                </p>
              </CardHeader>
              <CardContent>
                {/*
                  Skin choice is deliberate. `RecapCard` is theme-
                  independent by contract (F28) and must stay that way --
                  making it follow `.dark` is explicitly not allowed -- so
                  the risk here is the opposite one: a fixed-palette card
                  looking stranded on a themed landing section.

                  "beli" is the honest pick of the three. It is opaque, so
                  it composites onto nothing: the Strava skin is
                  *transparent* by design (F48 scoped transparency to it
                  alone) and would take on whatever surface sits behind it,
                  which on a light landing section means a card with no
                  card. Duolingo is opaque too, but it's painted in the
                  app's own teal accent (F27) and would read as more page
                  chrome rather than as an artefact the product made. The
                  Beli card's warm paper palette belongs to neither theme,
                  which is exactly what an exported image is.

                  The inset panel below is the framing treatment F42
                  permits, taken from the Polarsteps reference (a portrait
                  card sitting on a plain sheet, actions outside it): a
                  bordered `bg-muted` surface gives the card a defined edge
                  in light mode, where cream-on-white would otherwise float,
                  and a dark backdrop in dark mode.
                */}
                {/*
                  `px-2` at the narrow end is not cosmetic: the card is a
                  fixed 270px (the export contract's width, not a
                  suggestion), and at a 375px viewport the surrounding
                  chrome -- `main`'s `px-4`, the card content's `px-4` and
                  this panel's own padding -- is what decides whether it
                  fits. At `px-2` the card has ~291px to sit in; at `px-4`
                  it would have ~279px and no margin for error.
                */}
                <div className="flex justify-center rounded-lg border border-border bg-muted px-2 py-4 sm:px-3 sm:py-5">
                  <RecapCard recap={DEMO_RECAP} skin="beli" />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/*
          Feature trio, following the incident.io reference: a bordered
          icon tile, a short bold heading, a few lines of muted body, and a
          single accent colour used sparingly. Three columns at `md`,
          stacked below it.
        */}
        <section aria-labelledby="features-heading" className="border-t border-border py-16 sm:py-20">
          <h2
            id="features-heading"
            className="max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
          >
            Three things jTracks does for you
          </h2>

          <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon
              return (
                <div key={feature.title}>
                  <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-card">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-medium text-balance">{feature.title}</h3>
                  <p className="mt-2 text-sm text-pretty text-muted-foreground">{feature.body}</p>
                </div>
              )
            })}
          </div>
        </section>
      </main>

      {/*
        Footer, following the Visitors reference: a short blurb column on
        the left, one narrow link column, and plain small legal text --
        no link farm.
      */}
      <footer className="border-t border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2">
          <div>
            {/*
              F40 noted the logo-lockup-as-link decision was F43's to make.
              This one is a link and it points at `/app`, not `/` -- from
              the bottom of the landing page the useful destination is the
              product, and `/app` is the one URL that does the right thing
              either way: straight in for a signed-in visitor,
              `ProtectedRoute` -> `/login` -> back to `/app` for everyone
              else. The header lockup stays unlinked because it would only
              point at the page you're already on.
            */}
            <Link
              to="/app"
              className="inline-flex rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Wordmark />
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              A job application tracker that keeps score of your search, so you can tell what's
              working from what isn't.
            </p>
          </div>

          <nav aria-label="Footer" className="sm:justify-self-end">
            <h2 className="text-sm font-medium">Product</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link to="/app" className="text-muted-foreground hover:text-foreground">
                  Open the app
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-muted-foreground hover:text-foreground">
                  Log in
                </Link>
              </li>
              <li>
                <Link to="/signup" className="text-muted-foreground hover:text-foreground">
                  Create an account
                </Link>
              </li>
            </ul>
          </nav>

          <p className="text-xs text-muted-foreground sm:col-span-2">
            © 2026 jTracks. A personal project — not affiliated with any employer or job board.
            Built with React, Tailwind CSS and shadcn/ui.
          </p>
        </div>
      </footer>
    </div>
  )
}
