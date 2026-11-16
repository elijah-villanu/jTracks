# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is an individual job seeker managing a private board. It started with new-grad software engineers applying to dozens or hundreds of roles over weeks or months. They open the board to log an application, check what has gone quiet, and see how the search is going. They use both desktop and phone browsers.

When audiences conflict, design decisions favor this job seeker. JourneyJob is also a portfolio piece, and the public landing page (`/`) is read by recruiters, portfolio visitors, and prospective users who arrive cold. Its portfolio value comes from being a genuinely good tool, not from showcase moments built for evaluators.

## Product Purpose

JourneyJob replaces the spreadsheet-and-inbox way of tracking a job search. It keeps one board of every application. It marks applications that go quiet as Ghosted without manual upkeep. It turns the search into a funnel that shows where applications stall.

Its deeper purpose is social and emotional. The job search should feel less overbearing and even somewhat enjoyable, something a person shares with friends instead of hiding. Today that happens through shareable recaps. The planned social system (see Capabilities and Constraints) brings it into the product. Success looks like this: the user keeps the board current with little effort, understands where the search is stalling, and wants to share how it's going.

## Positioning

- **The recap is the social heart.** Any week, month, year, all-time, or custom range can become a 9:16 Stories-format card (exported at 1080×1920) in one of three skins, then downloaded or shared through the device's native share sheet.
- **It separates the two ways you lose.** Rejected (before an interview) and Failed Interview/OA (after one) are different terminal outcomes. The Sankey funnel keeps them apart, so the user can tell a screening problem from an interviewing problem.
- **Silence is handled for you.** Auto-ghosting turns quiet applications into an outcome instead of a lingering "maybe."
- **Planned: a search you go through with friends.** Friends follow each other's job journeys through aggregate stats each user chooses to share, and milestones turn effort into something to show on a profile. The board itself stays private. This is the intended destination of the social purpose. It is not built yet.

## Operating Context

- **Daily logging:** the user pastes a posting URL or fills the form manually, then updates status from a per-row control.
- **Periodic review:** the user opens Analytics, picks a range, and reads the status breakdown, the applications-over-time trend, and the Sankey.
- **Sharing:** the user opens the recap dialog, pages through the skins, and downloads or shares the image, usually to social Stories.
- Today, sharing happens outside the product. The in-app friends and milestones system is planned (see Capabilities and Constraints).

## Capabilities and Constraints

- **Statuses (seven):** Saved, Applied, Interviewing / OA, Offer, Rejected, Failed Interview/OA, Ghosted. Copy must not soften "Failed Interview/OA" to "Failed," including in marketing.
- **Saved → Applied:** this transition asks the user to confirm the date applied. That date starts the ghosting clock.
- **Auto-ghosting:** a global, user-editable threshold (14-day default) with a per-application override. It applies to Applied only. An interview that goes quiet is the user's call. Offer, Rejected, and Failed are never auto-changed.
- **Autofill:** supported for Greenhouse and Workday URLs. Other links (including LinkedIn and Glassdoor) and parse failures fall back to the manual form with the URL pre-filled. Nothing is ever saved without user review.
- **Analytics:** status breakdown, applications over time, and the Sankey funnel. Ranges are week, month, year, all-time, and custom. Analytics derive from current status only, with no status-history log. In-flight applications are a legitimate unfilled remainder in the funnel, never a phantom node.
- **Recap export:** 1080×1920 PNG via `html-to-image`. No animation may sit inside the exported subtree. Fonts and images are awaited before capture. Each skin's palette is fixed and independent of the app's light/dark theme.
- **Surfaces:** a public landing page at `/` (hard-coded demo data, no authenticated requests), login and signup, and the authenticated app under `/app`: Pipeline (table, with an optional board view), Analytics, and Settings. The theme can be light, dark, or system.
- **Auth:** email + password and Google OAuth. Each user sees only their own board.
- **Planned, not implemented: social system.** It is key to the product's direction.
  - **Friends:** users can add friends and see how their job journeys are going.
  - **Milestones:** achievements such as a number of interviews done or applications sent, which a user can showcase on a profile.
  - **Privacy (decided):** boards stay fully private, always. Friends see only the aggregate stats the user chooses to share, plus milestones. No application, company, role, note, or per-application status is ever visible to anyone else.
  - **Undecided:** how friends are added, the full milestone set and thresholds, which aggregate stats are available to share, and what else a profile contains.
  - **Until it ships:** no surface, including the landing page, may present friends, profiles, or milestones as existing features. New work may leave room for them.
- **Out of scope:** no team/collaborative boards where users edit each other's applications; no native app or browser extension; no resume storage; no CSV import/export (deferred); no marketing infrastructure (CMS, pricing, analytics scripts, email capture).
- **UI building conventions:** these live in `.claude/rules/` (Mobbin → shadcn → MagicUI) and `docs/decisions/magicui-conventions.md`, which allows at most one looping accent per view. Colors come only from tokens in `frontend/src/index.css`.

## Brand Commitments

- **Name:** JourneyJob, renamed from jTracks. Internal identifiers such as `jtracks_*` storage keys stay as they are.
- **Logo:** `frontend/src/assets/JourneyJobLogoLight.png` (navy ink) and `JourneyJobLogoDark.png` (white ink), both trimmed. The `-original` files are unused.
- **Accent:** #0F57FE blue on a neutral base is binding.
- **Recap skins:** the trio of selectable designs (layouts after Strava, Duolingo, and Beli recaps) is a binding product feature.
- **Typography:** Hedvig Letters Sans and Roboto currently ship but are not binding. They are open for v3.
- **Voice:** candid but kind. State outcomes directly and never sugarcoat a rejection or a ghosting. Give empty states and bad-news moments a little warmth and depth, because the search is already heavy. No cheerleading, and no hype.

## Evidence on Hand

- **No live users, testimonials, usage metrics, press, or customer logos exist.** Future work must not fabricate any of them, or any claim the shipped product does not perform.
- **Demo data:** `frontend/src/routes/landing/demo-data.ts` (landing page, hard-coded) and `backend/scripts/seed.py` (seeded dev account).
- **Recap reference exports:** `frontend/reference/recap-baseline-{strava,duolingo,beli,empty-total,inflight-only}.png`, plus the `strava_reference.PNG` layout sketch.
- **Requirements of record:** `PRD.md` (V1), `PRD_V2.md`, `PRD_V2_1.md`, and the decisions in `docs/decisions/`.

## Product Principles

1. **Serve the person searching.** Scanning speed, low upkeep, and honest data outrank showcase value. The portfolio benefits only when the tool is good.
2. **Tell the truth, kindly.** Name every outcome plainly and keep the real labels. Put warmth where the news is bad or the board is empty, not in the numbers.
3. **Make the journey social.** A recap should be worth posting even in a rough month, and milestones should make effort visible, not just outcomes. The goal is to turn a lonely grind into something a person goes through with friends. Sharing never costs privacy: the board is never shared, only the aggregates and milestones the user chooses.
4. **The tool does the bookkeeping.** Autofill, auto-ghosting, and derived analytics exist so the user does less, never more.
5. **Never invent data.** Charts show only what the data supports. Demo data stays clearly demo, and no feature or claim gets ahead of the product.

## Accessibility & Inclusion

- WCAG AA contrast for text and UI components in both light and dark themes, verified rather than assumed.
- Reduced motion is honored everywhere through the app-root `<MotionConfig reducedMotion="user">` and the shared `usePrefersReducedMotion` hook for non-positional animation.
- 375px is the floor for every surface. The default Pipeline table has no horizontal scroll at that width, and no value becomes unreachable.
- Status color is never the only carrier of meaning. Every chart's `aria-hidden` SVG is backed by a `ChartDataTable` text alternative.
- The V2 accessibility audit's fixes act as a regression suite: `aria-sort`, sortable-header naming, the staleness warning's role, live regions, route-change focus and announcement, and the skip link.
