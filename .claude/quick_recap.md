# Quick Recap — v2.1 work on `v2-execute`

**Scope:** PR #5 (`v2-execute` → `main`, merged 2026-09-11, 15 commits) plus the 3 commits on `v2-execute` since. All of it is the **V2.1 UI overhaul** (`PRD_V2_1.md`, tasks in `FRONTEND_TASKS.md`), followed by a security pass and an accessibility pass before an Azure App Service deploy.

Where to look for decisions: `PRD_V2_1.md` (requirements R10–R18), `FRONTEND_TASKS.md` (tasks F25–F68), and `docs/decisions/` (`magicui-conventions.md`, `typography.md`, `sankey-library.md`).

---

## Part 1 — PR #5 (merged to main)

### 1. `70dee44` — Revamp Sankey thickness + MagicUI rule created (2026-08-27)
Follow-up to V2 based on user feedback, recorded as **R9** in `PRD_V2.md`. The dashboard Sankey was shrunk from 343×260 to 343×170. Its `Applied` node always fills its whole column, so the taller size made the chart look top-heavy. The recap card was also redesigned, using a Strava screenshot as reference.

It also added `.claude/rules/magicui-ui.md`, which makes MagicUI a decorative-only layer on top of shadcn, and updated the `shadcn-ui-builder` agent to match.

### 2. `7d507d5` — Animate pages (component fades + border beam) (2026-08-28)
First MagicUI install: `blur-fade` (entrance fades), `number-ticker` (stat tiles count up), and `border-beam` (a looping border light, removed later in commit 18).
- Applied to Analytics, Login, Signup, Applications and Settings.
- Wrapped the app in `<MotionConfig reducedMotion="user">` in `main.tsx`.
- Created `docs/decisions/magicui-conventions.md`: approved components, timing values, a "one looping accent per view" rule, and a per-page inventory. Every later motion change updates this doc.

### 3. `c6522e8` — V2.1 planning + frontend tasks documented (2026-08-28)
Docs only. Created `PRD_V2_1.md` and `FRONTEND_TASKS.md`, which define the V2.1 scope:
- **R10** — public landing page
- **R11** — working light/dark theme
- **R12** — Sankey and recap visual restructure
- **R13** — applications table with no horizontal scroll at 375px
- **R14** — motion layer

These map to milestones FV6–FV10.

### 4. `4e8a78e` — Animated header on mount (2026-08-28)
Small change: the `AppLayout` header now fades in once with `BlurFade` when it mounts, and the conventions doc was updated.

### 5. `dd51d13` — Agent workflow: Mobbin MCP rule + server (2026-08-28)
Tooling only. Added `.claude/rules/mobbin-ui.md` and the Mobbin MCP server. This set up the 3-stage UI pipeline the rules still describe: **Mobbin** (design references) → **shadcn** (structure) → **MagicUI** (accents).

### 6. `caa038d` — Mobbin design discovery + restructured frontend plan (2026-08-31)
Docs only. Mobbin research added new scope as **R16 / milestone FV11**:
- an optional Kanban-style pipeline board
- polish for the add-application flow
- a Settings layout refinement
- a stat-tile restyle based on Monarch's cards

### 7. `8876ca5` — Theme + colors, dark-mode toggle (2026-08-31)
Shipped R11 (tasks F25–F29):
- `lib/theme-context.tsx` and `useTheme` add a light / dark / system theme, saved in `localStorage` (`jtracks_theme`).
- An inline script in `index.html` sets the theme before the page renders, so the wrong theme never flashes on load.
- `theme-toggle.tsx` adds the switch to the app shell.

`--primary` / `--ring` got a real accent color, and status colors now come from a single theme-aware source shared by the badge, charts and recap. The palette choices are recorded in `magicui-conventions.md`.

### 8. `d63cb6a` — Mobile-friendly applications table (2026-08-31)
Shipped R13 (F30–F33). At medium widths the table hides lower-priority columns (Location, then Date Applied). Below the `sm` breakpoint it switches to a stacked card list (`applications-card-list.tsx`), so there's no horizontal scroll at 375px.

The table and the card list share `status-control.tsx` and `staleness-indicator.tsx`, so they can't drift apart. A new `useMediaQuery` hook drives the switch.

### 9. `3255fc9` — Sankey visual restructure (2026-09-01)
Shipped R12 (F35–F39). The Sankey now measures its container and lays out at real pixel sizes, so label text no longer grows and shrinks with a scaled `viewBox`. Applications still in flight are drawn as a dashed "N in flight" cap instead of blank space.

Labels no longer overlap, and hovering or keyboard focus shows node details. Reference screenshots of the recap export were captured first (`frontend/reference/recap-baseline-*.png`) so later changes to the exported image could be compared against them.

### 10. `2ff6ab4` — Shareable analytics: recap skins (2026-09-08)
F48–F50. The recap dialog now offers three selectable designs: **Strava** (transparent background), **Duolingo** (one big hero stat), and **Beli** (ranked stats).
- Code lives in `recap-skins/`, with a registry in `index.ts`.
- They're browsed in a shadcn `carousel`.
- The choice is saved by `useRecapSkin` (`jtracks_recap_skin`).

Download/Share buttons were restyled and the reference screenshots were retaken for each design.

### 11. `cb15fe6` — Landing page + auth routes moved under `/app` (2026-09-08)
Shipped R10 (F40–F44). `/` is now a public `LandingPage` (hero, three-feature section, footer, theme toggle) that uses hard-coded demo data from `routes/landing/demo-data.ts` and makes no authenticated calls.

The logged-in app moved to `/app`, `/app/analytics` and `/app/profile`. `/login` and `/signup` stay at the top level, and after login users go to `/app`. `useDocumentMetadata` sets each page's title and meta tags. Mobbin was formally adopted as **R15**.

### 12. `68566a2` — MagicUI on new surfaces + animation updates (2026-09-08)
R14 / FV10 (F45–F47). The existing motion conventions were applied to the landing page (most of the diff is `LandingPage.tsx`), and timings were adjusted on the stat tiles and auth forms.

The conventions doc's per-page inventory was updated, and F47 re-checked all of V2.1 at the end (both themes, 375px, accessibility).

### 13. `fe59346` — Kanban board + responsive mobile table (2026-09-09)
Shipped R16 / FV11 (F51–F54):
- **Board view** (`board/applications-board.tsx`): an optional Kanban grouped by status. You toggle Table/Board, and the choice is saved by `useViewMode` (`jtracks_view_mode`).
  - No drag-and-drop, on purpose: cards change status through the same `StatusSelect` dropdown as the table, which keeps the board keyboard-accessible.
  - The board scrolls sideways on mobile, which is accepted because it's opt-in.
- Polished the add-application and autofill dialogs, the Settings layout, and the stat tiles.

Also added **R17** (typeface overhaul) to the PRD for the next commit.

### 14. `b9d1963` — Typeface overhaul (2026-09-10)
Shipped R17 (F55–F62). Fonts are now self-hosted `woff2` files in `src/assets/fonts/` with their licenses:
- **Hedvig Letters Sans** for display text: the hero, section headings and the wordmark.
- **Roboto** (400–700) for body text.

`--font-display` / `--font-sans` tokens were added to `index.css`. Stat numbers use bold Roboto, and the recap export waits for `document.fonts.ready` before rendering. Full rationale is in `docs/decisions/typography.md`.

### 15. `aa9c3d7` — Logo integration + accent recolor (2026-09-11)
**R18: the product was renamed jTracks → JourneyJob**, but only in user-visible frontend text. New light and dark logo PNGs go through `layout/logo.tsx` and appear in the navbar, landing page, login and signup.
- Docs, code comments, `localStorage` keys and the cookie name still say "jtracks", on purpose.
- The accent color changed from teal to blue across `index.css`, the buttons, badges and recap designs.

---

## Part 2 — Commits on `v2-execute` since PR #5

### 16. `ef58dfa` — Typeface cleanup + testing (2026-09-14)
A correctness review (**FV13, F63–F68**) for bugs that build, `tsc` and visual checks had all missed:
- **F63:** the frontend mocks and landing demo data gave the Sankey's `interviewing_oa` node the wrong value. It must be the node's inflow, not its current count, so the "in flight" cap never showed for that stage. The chart now has a dev-only check for this.
- **F64:** the font tokens moved to a plain `@theme`.
- **F65:** fixed a circular import; table columns now live in `columns.ts`.
- **F66:** you can sort by hidden columns again, through the new `sort-select.tsx`.
- **F67:** fixed invalid `<dl>` markup in board cards.
- **F68:** a failed page load no longer hides later status-change errors.

Recap reference screenshots were retaken, and `docs/decisions/sankey-library.md` was added.

### 17. `44f899f` — Security audit pass + JWT refactor (2026-09-15)
Pre-deploy hardening for Azure App Service. The main change is **refresh-token rotation with reuse detection** (`PRD_V2.md` R7.5, migration `0005`, `refresh_token_service.py`):
- Each refresh token can be used once. Tokens from the same login share a `family_id`.
- If an already-rotated token comes back, its whole family is revoked.
- A 30s grace window covers two tabs refreshing at once.
- Rotating doesn't extend the session: it still ends 14 days after login.
- Logout revokes the family.

Other fixes, covered by `tests/test_security_regression_predeploy.py` and `test_refresh_token_rotation.py`:
- Rate limiting reads the client IP from the right end of `X-Forwarded-For` and ignores the port. Proxy hops are configurable, so attackers can't dodge the login limit or lock out other users.
- A password set on an unverified signup stops working once the real owner signs in with Google.
- Config is validated at startup: token lifetimes have upper bounds, CORS origins must be valid HTTPS outside localhost, and development mode refuses to start on App Service. Startup errors no longer print secrets.
- Each user has a cap on live sessions (the oldest is revoked), and logout is rate-limited.
- Dangerous `job_url` schemes such as `javascript:` are rejected, and an explicit `null` on a required field returns 422 instead of 500.

### 18. `a505cbf` — Accessibility pass (2026-09-15)
A second accessibility audit (`frontend/ACCESSIBILITY_AUDIT.md`, issues #23–40) and its fixes:
- **Focus:** focus no longer gets lost when moving a board card, confirming Saved → Applied, clicking buttons that disable themselves mid-request, deleting, or finishing autofill.
- **`border-beam` removed project-wide:** it looped forever with no pause control (WCAG 2.2.2).
- **Reduced motion:** `MotionConfig` only skips movement animations, so the new `usePrefersReducedMotion` hook gates the other animations, such as the counting numbers.

Other fixes:
- Each page gets its own title.
- Focus outlines and input borders now meet contrast minimums, and the light-mode error banner passes AA.
- The recap image has a text alternative, and `chart-summaries.ts` adds text summaries for the charts.
- Auth fields have `autocomplete`, and required fields are marked.
- Sankey node targets are larger.
- The mobile menu's name now says it's a menu.

`application-form-dialog.tsx` was mostly restructured, and the MagicUI rule and conventions doc were updated.

---

**Not yet committed:** 19 modified files (about +242 / −344 lines), mostly cleanup:
- New shared hooks `useStoredState` and `useRangedFetch`, used by `useViewMode`, `useRecapSkin`, theme and dashboard code.
- Backend tidy-ups in `clock.py` (`as_utc`), `deps.py`, auth, cookies and transitions.
