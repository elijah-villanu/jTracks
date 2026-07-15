# jTracks — Job Application Tracking Board

## Summary
jTracks is a web application that helps job seekers (primarily new-grad software engineers) track applications through a Kanban-style pipeline, automatically flags applications as "Ghosted" after a configurable time limit, and gives users a stats dashboard — including a shareable, Instagram-Stories-style recap image — so they can see how their job search is actually going.

## Problem Statement
Job seekers applying to dozens or hundreds of roles typically track them in spreadsheets or emails, which makes it hard to see application status at a glance, easy to forget to follow up, and impossible to answer basic questions like "what's my response rate?" or "how many companies never got back to me?" jTracks centralizes this into one board with automatic ghost-detection and built-in analytics.

## Goals
- Give users a single board to track every application's status through its lifecycle.
- Automatically transition stale applications to "Ghosted" without manual upkeep.
- Let users add a job by pasting its posting URL, auto-filling the entry when the source is a supported platform, falling back to manual entry otherwise.
- Surface meaningful stats about the user's job search on a dashboard.
- Let users generate a shareable recap image of their stats, styled for social sharing (transparent background, Stories-style), similar to Strava's activity recap.
- Support multiple users, each with their own private, authenticated board.
- Work well on both desktop and mobile browsers.

## Non-Goals (v1)
- No browser extension or automatic scraping of job boards (LinkedIn, Indeed, etc.) — applications are entered manually.
- No automatic/scheduled recap generation or push notifications — recaps are generated on demand only.
- No resume/cover-letter storage or ATS-style document management.
- No team/recruiter-facing or collaborative features.
- No native mobile app — mobile support is via responsive web only.

## Target Users
Primary persona: an individual job seeker (e.g., a new CS grad) managing their own job search, applying to many roles over weeks/months and wanting visibility into their pipeline. Each user has their own private account and board — no shared/team boards in v1.

## Requirements

### Must-Have (v1)
**Auth & accounts**
- Sign up / log in via email + password
- Sign up / log in via Google OAuth
- Per-user data isolation — a user only ever sees their own applications

**Application tracking**
- Create/edit/delete job applications with fields: company, role/title, date saved, date applied, status, job posting link/URL, location, salary/compensation, date posted, notes
- Status pipeline: **Saved → Applied → Interviewing → Offer / Rejected / Ghosted**
  - **Saved**: jobs the user is considering but hasn't submitted an application for yet
  - Moving an entry from Saved to Applied prompts the user to confirm/set the "date applied" (defaults to today); this date is what starts the ghosting clock, not the date the job was saved
- Kanban board view with a column per status; users can move an application between statuses manually
- Per-application ghost-time override (in addition to the global default, described below)

**Autofill from job link**
- When adding a new job, the user can paste a posting URL instead of filling the form manually
- If the URL is from a supported platform (v1: **Workday, Greenhouse**), the backend fetches and parses the posting to extract: company name, job title, location, salary/compensation (if listed), and date posted
- Parsed data pre-fills a review/edit form — the entry is never saved automatically; the user always confirms or corrects the fields before saving
- A successfully-parsed entry defaults to **Applied** status with "date applied" pre-filled to today (pasting a link means the user is submitting/has submitted the application); the user can change the status to **Saved** in the review form instead if they're just tracking the job, not applying yet
- If the URL isn't from a supported platform, or parsing fails for any reason (site structure changed, request blocked, timeout, etc.), the user is dropped into the same review/edit form with only the URL pre-filled and must complete the rest manually
- LinkedIn and Glassdoor links are **not parsed in v1** (they require login and actively block automated access) — pasting one of those links simply falls back to manual entry

**Auto-ghosting**
- A global, user-editable default time limit (e.g. 14 days) after which an application with no status update automatically transitions to "Ghosted"
- Per-application override of that time limit
- Only non-terminal statuses (Applied, Interviewing) are eligible to auto-transition to Ghosted; Offer and Rejected are terminal and are never auto-changed
- A scheduled background process checks and applies these transitions at least once daily

**Dashboard**
- Status breakdown (counts/percentages across Applied, Interviewing, Offer, Rejected, Ghosted)
- Applications-over-time trend (daily/weekly/monthly view)
- Response rate and ghost rate (% of applications that got any response vs. were rejected vs. went ghost)
- Average time-to-response (time between applying and first status change away from Applied)

**Shareable recap**
- User-triggered ("Generate recap") export of an image summarizing stats for a selected period (e.g. this week)
- Transparent background, portrait aspect ratio suited to Instagram Stories
- Downloadable / shareable via the device's native share sheet on mobile

**Platform**
- Responsive layout usable from mobile viewport widths up through desktop

### Nice-to-Have (post-v1)
- Automatic scheduled recap generation with a push/email notification
- Browser extension or integration to auto-import applications from job boards
- Reminders/notifications for upcoming interviews
- CSV export of application data
- Dark mode

## Non-Functional Requirements
- **Performance**: dashboard and stats queries should load in under ~1 second for a typical user (low hundreds of applications)
- **Security**: passwords hashed with a strong algorithm (e.g. bcrypt/argon2); OAuth via standard provider flow; strict per-user data isolation in every query
- **Reliability**: the daily ghosting job must run consistently without missing or double-applying transitions
- **Resilience**: autofill parsing must fail gracefully (timeout, unrecognized structure, blocked request) and always hand off to the manual-entry form rather than erroring out or losing the pasted URL
- **Responsiveness**: usable down to ~375px-wide mobile viewports
- **Code quality**: FastAPI backend with OpenAPI/Swagger docs; clean, typed React components — this is a portfolio piece and should read well in a code review

## Success Metrics
- **Personal use**: the user actually tracks their real job applications in jTracks instead of a spreadsheet
- **Portfolio**: the full flow — sign up, add applications, watch auto-ghosting work, view dashboard, generate a shareable recap — can be demoed end-to-end in an interview setting
- **Technical**: the auto-ghosting job produces zero missed or duplicate status transitions under test

## Constraints & Assumptions
- **Stack**: React + Tailwind CSS (frontend), FastAPI (backend), PostgreSQL (database)
- **Team**: single developer, new-grad skill level — favor well-documented, common patterns over novel architecture
- **Timeline**: no hard deadline
- Assumes Offer and Rejected are permanently terminal statuses (no auto-transition away from them)
- Assumes users can manually revert a Ghosted application's status if they later hear back

## Open Questions / Risks
- **Hosting/deployment target is undecided** — affects how the scheduled ghosting job is implemented (e.g. platform-native cron, in-process scheduler like APScheduler, or a task queue like Celery + Redis)
- **Recap image generation approach is undecided** — client-side (HTML/canvas → image) vs. server-side rendering; needs a short technical spike before committing
- **Autofill parsing approach is undecided** — Greenhouse exposes a public Job Board JSON API for many customers, which is straightforward to consume; Workday postings are typically server-rendered with embedded JSON but have no official public API, so parsing may be brittle and could break when a company changes its Workday configuration. Needs a technical spike to confirm feasibility and pick an HTML-parsing strategy before committing to full support.
- Even for Workday/Greenhouse, scraping postings may be subject to each site's Terms of Service — worth a quick review before relying on it for a public-facing portfolio project
- No defined data retention/deletion policy for old or closed applications yet

## Out of Scope (v1)
- Browser extension / job-board scraping
- Autofill parsing for LinkedIn, Glassdoor, or any platform beyond Workday and Greenhouse (these fall back to manual entry)
- Automatic/scheduled recap notifications
- Resume/cover-letter management
- Multi-user collaboration or team boards
- Native mobile app
