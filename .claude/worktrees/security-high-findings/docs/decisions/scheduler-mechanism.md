# ADR: Scheduler mechanism for daily auto-ghosting (B8)

Status: Accepted — 2026-07-22
Deciders: Backend (solo developer)
Related tasks: B8 (spike), B9 (daily ghosting job), B17 (deployment)

## Context

The PRD requires a scheduled background process that transitions stale
`Applied`/`Interviewing` applications to `Ghosted` **at least once daily**, with
"zero missed or duplicate status transitions" as a technical success metric. The
PRD also flags the hosting/deployment target as *undecided*, and that choice
normally drives the scheduler choice.

Candidate mechanisms:

1. **In-process APScheduler** — a `BackgroundScheduler`/`AsyncIOScheduler`
   started inside the FastAPI process.
2. **Platform-native cron** — a separate scheduled invocation (OS cron, a
   platform "scheduled job", or GitHub Actions cron) that runs a management
   command hitting the DB.
3. **Celery + Redis (beat)** — a dedicated task queue with a beat scheduler.

## Decision

**Use in-process APScheduler.**

The ghosting job is idempotent by design (see B9: it only ever reads rows whose
computed deadline has passed and whose status is still `Applied`/`Interviewing`,
then flips them; a second run finds nothing to do). Correctness therefore does
**not** depend on exactly-once delivery from the scheduler — it depends on the
job's own idempotency and a `WHERE status IN ('applied','interviewing')` guard.
That removes the main reason one would reach for a durable queue.

Given the PRD's stated constraints — *single developer, new-grad skill level,
portfolio project, no hard deadline, favor well-documented common patterns over
novel architecture* — APScheduler is the simplest option that satisfies the
requirement:

- No extra infrastructure (no Redis, no separate worker process, no broker) —
  Celery+Redis would roughly double the moving parts to deploy and monitor for a
  single daily job.
- Runs anywhere the API runs, including a single container — which keeps B17
  deployment trivial and hosting-target-agnostic (the PRD's open question).
- Well-documented, extremely common FastAPI pattern; reads well in a code review.

## Consequences

- **Single-instance assumption.** If the API is ever horizontally scaled to N
  replicas, N schedulers would each fire the job. Mitigations, in order of
  simplicity: (a) run the scheduler only when an env flag `RUN_SCHEDULER=true`
  is set on exactly one instance (implemented — see `app/core/config.py`);
  (b) later, take a Postgres advisory lock at the top of the job. For a v1
  single-instance portfolio deployment this is a non-issue, and the idempotent
  job means even a double-fire cannot produce duplicate/incorrect transitions.
- The job is also exposed as a plain callable (`run_ghosting_sweep`) and a
  script entrypoint, so if the deployment target later favors platform cron, we
  can switch to option 2 **without changing any business logic** — only how it's
  triggered. This keeps the door open on the undecided hosting question.
- Missed runs (process was down at the scheduled minute) self-heal: because the
  job scans by absolute deadline rather than "what changed today", the next run
  after downtime still catches everything overdue. `misfire_grace_time` is set
  generously and `coalesce=True` so a backlog collapses into one run.

## Interval

Runs daily. Configurable via `GHOSTING_JOB_HOUR` (default 03:00 server time) so
it lands in a low-traffic window. A run is also invoked once at startup so a
freshly-booted instance immediately reconciles state.
