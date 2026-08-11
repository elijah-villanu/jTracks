# ADR: Recap image generation approach (B15)

Status: Accepted — Client-side rendering — 2026-07-22
Deciders: Backend (solo developer)
Related tasks: B15 (spike), B16 (recap endpoint), FRONTEND_TASKS.md F8

## Context

The PRD wants a user-triggered, shareable **recap image**: transparent
background, portrait/Instagram-Stories aspect ratio, downloadable and shareable
via the mobile native share sheet. The PRD leaves the render location open:
client-side (HTML/canvas → image) vs. server-side (render a PNG on the backend).

## Options

1. **Server-side render** — backend produces the final transparent PNG (e.g.
   Pillow, or HTML→image via a headless browser / `imgkit`/Playwright).
   - Pros: one canonical asset; identical everywhere.
   - Cons: adds a heavy dependency (system libs, fonts, or a headless Chromium)
     to the API image; font/emoji rendering and pixel-perfect layout in Pillow
     is fiddly; a headless browser roughly triples container size and memory and
     complicates B17 deployment. Transparent-background PNG export and precise
     Stories layout are exactly where server-side raster libraries are most
     painful.

2. **Client-side render** — backend returns only the **stats payload**; the
   frontend renders a styled DOM/canvas node and exports it to a transparent PNG
   (e.g. `html-to-image` / `dom-to-image`) and shares it via the Web Share API.
   - Pros: the recap is *already* HTML/CSS the frontend team owns (F7 dashboard
     styling carries straight over); transparent background and 9:16 aspect are
     trivial in CSS; native share sheet (`navigator.share` with a `File`) is a
     browser API and must happen client-side anyway; **zero** new backend infra,
     keeping the API image small and B17 simple.
   - Cons: rendering fidelity depends on the browser (acceptable — the share
     target is the user's own device).

## Decision

**Client-side rendering.** `GET /dashboard/recap?range=week|month` returns a
JSON **recap payload** (the numbers + a few pre-formatted highlight strings and a
period label), and the frontend (F8) renders and exports the image with
`html-to-image` and shares it with the Web Share API.

Rationale, weighed against the PRD's "single developer, portfolio project, favor
simplicity":

- The two hard requirements — **transparent background** and **Stories aspect
  ratio** — are *easy* in CSS and *hard* in server-side raster libraries. This
  inverts the usual "server is more reliable" intuition for this specific case.
- Native share-sheet integration is inherently a client-side browser API, so the
  frontend is in the loop regardless; returning JSON avoids doing layout work
  twice.
- Keeps the backend deployable as a single small container (supports B17 and the
  APScheduler decision in scheduler-mechanism.md) with no headless-browser or
  native-image dependency.

## Consequences

- **B16 scope** is reduced to a stats/recap **data** endpoint, not an image
  endpoint. It reuses the B14 dashboard computation and adds period framing +
  a few human-readable highlight lines tuned for the recap card.
- **F8 owns** the actual image export and share-sheet call. This ADR is the
  hand-off contract for that task.
- If a future need arises for a canonical server-rendered asset (e.g.
  server-generated Open Graph preview images), it can be added additively
  without changing this endpoint's JSON shape.
