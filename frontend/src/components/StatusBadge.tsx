import type { ApplicationStatus } from "@/types/api"

/**
 * Canonical pipeline order (Saved -> Applied -> Interviewing/OA -> Offer /
 * Rejected / Failed Interview/OA / Ghosted), per PRD_V2.md's R1.3 status
 * vocabulary. Shared by the status filter toolbar and each row's
 * status-change control so there's a single source of truth for "every
 * status, in order."
 */
export const ALL_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "interviewing_oa",
  "offer",
  "rejected",
  "failed",
  "ghosted",
]

/**
 * "Failed Interview/OA" is a deliberate, verbose label (per PRD_V2.md) --
 * it must never be shortened to just "Failed" anywhere in the UI, since
 * that would risk being confused with a rejection.
 */
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing_oa: "Interviewing / OA",
  offer: "Offer",
  rejected: "Rejected",
  failed: "Failed Interview/OA",
  ghosted: "Ghosted",
}
