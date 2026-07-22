# jTracks — Frontend Tasks

**Owns:** everything under `frontend/`
**Do not edit:** anything under `backend/`

## Shared contract (do not diverge without updating DATABASE_TASKS.md and BACKEND_TASKS.md)

Same `applications`/`users` entity fields as in DATABASE_TASKS.md, and the same API surface listed in BACKEND_TASKS.md. Build against a mocked API (e.g. MSW) seeded with fixture data matching this contract so frontend work isn't blocked on the backend being live — swap the mock for the real base URL once endpoints ship.

---

## Milestone F0: Foundation

- [x] **F1 — React + Vite + Tailwind scaffolding** (S)
  Routing (e.g. react-router), base layout, API client wrapper reading `VITE_API_URL`, and a mock API layer (MSW) seeded with fixtures matching the shared contract.
  Acceptance: app runs and renders a seeded list of mock applications with no backend running.
  Depends on: none

## Milestone F1: Auth

- [ ] **F2 — Signup/login UI** (M)
  Email/password forms + "Sign in with Google" button; stores the JWT; protected-route wrapper redirecting unauthenticated users.
  Acceptance: works end-to-end against the mock API; swaps to the real API once B2/B3 ship with no component changes.
  Depends on: F1

## Milestone F2: Board

- [ ] **F3 — Kanban board layout & application card** (M)
  Columns for Saved, Applied, Interviewing, Offer, Rejected, Ghosted; card shows company/title/key dates; move between columns via drag-and-drop or a menu.
  Acceptance: moving a card calls the (mocked) `PATCH /applications/{id}` and the board updates without a full reload.
  Depends on: F1

- [ ] **F4 — Manual add/edit application form** (M)
  Form covering every field in the shared contract. Moving Saved→Applied prompts for/defaults `date_applied` to today per the PRD.
  Depends on: F3

## Milestone F3: Autofill

- [ ] **F5 — Autofill URL paste flow** (M)
  "Paste a link" entry point; loading state while `POST /applications/autofill` resolves; always routes into F4's review/edit form, pre-filled with whatever came back — including the unsupported/failed case, which pre-fills only the URL.
  Acceptance: verified against mocked success, unsupported-domain, and parse-failure responses — all three land on the same review screen with no dead ends.
  Depends on: F4

## Milestone F4: Settings

- [ ] **F6 — Ghost-time settings UI** (S)
  Global default field (settings page) + per-application override field inside F4's form.
  Depends on: F4

## Milestone F5: Dashboard

- [ ] **F7 — Dashboard charts** (M)
  Status breakdown, applications-over-time, response/ghost rate, avg time-to-response, using a charting library (e.g. Recharts); range toggle (week/month/all).
  Acceptance: renders correctly against F1's mock fixtures; wire to the real `GET /dashboard/stats` once B14 ships.
  Depends on: F1

## Milestone F6: Recap

- [ ] **F8 — Shareable recap UI** (M, scope set by backend's B15 decision)
  "Generate recap" button. If backend chose client-side rendering (B15): implement the transparent-background, Stories-aspect image export here (e.g. via html-to-image/canvas) from the `GET /dashboard/recap` data. If server-side: fetch and display/download the returned image. Include native share-sheet integration on mobile (Web Share API).
  Depends on: F7, and BACKEND_TASKS.md's B15/B16

## Milestone F7: Polish

- [ ] **F9 — Responsive pass** (S)
  Verify and fix layout down to ~375px viewport width across the board, forms, and dashboard.
  Depends on: F3, F4, F7

## Notes for parallel work
- F1–F4 and F7 need nothing from the other two files to start — build against the mocked API and the shared contract above.
- F8 is the one task genuinely blocked on a backend decision (B15) — sequence it last, or start its non-decision-dependent UI shell early and slot in the image-generation approach once B15 lands.
