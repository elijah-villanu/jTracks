# Decision: Data retention for closed applications

## Context
The PRD leaves open whether Rejected/Ghosted applications are ever purged or
archived, or kept indefinitely (PRD.md, "Open Questions / Risks").

## Decision
Keep all applications — regardless of status — indefinitely. No purge or
archive job.

## Why
- **Dashboard/recap depend on full history.** Response rate, ghost rate, and
  the applications-over-time trend (PRD "Dashboard") are computed over the
  user's whole history, not just open applications. Purging Rejected/Ghosted
  rows would silently corrupt those stats.
- **Scale doesn't demand it.** Target user is a single job seeker with "low
  hundreds of applications" (PRD non-functional requirements) — a few hundred
  rows per user has no meaningful storage or query-performance cost. This
  isn't a multi-tenant-at-scale problem.
- **No stated compliance/legal driver.** Nothing in the PRD calls for a
  deletion guarantee (e.g. GDPR-style right-to-erasure at the row level);
  account-level deletion is the only retention control actually needed, and
  that already falls out of `ON DELETE CASCADE` on `applications.user_id`
  (D3) — deleting a user removes all of their applications, open or closed.

## What this rules out (for now)
- No scheduled purge/archive job for Rejected/Ghosted rows.
- No separate "archived_applications" table or soft-delete flag.

## Revisit if
- Per-user row counts grow enough to matter (thousands+), which the stated
  scale doesn't project.
- A user-facing "delete this application" action is added as a v2 feature —
  that's a normal per-row DELETE, not a retention *policy*, but note it here
  since it touches the same question.
