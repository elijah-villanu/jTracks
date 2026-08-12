import { http, HttpResponse } from "msw"
import { API_BASE_URL } from "@/lib/api-client"
import type { AutofillResponse } from "@/types/api"

const url = (path: string) => new URL(path, API_BASE_URL).toString()

/**
 * v1-supported platforms per PRD.md. Anything else (including
 * LinkedIn/Glassdoor, which are explicitly called out as never
 * parsing) falls through to `{ unsupported: true }`.
 */
const SUPPORTED_HOSTNAME_SUBSTRINGS = ["greenhouse.io", "myworkdayjobs.com"]

/**
 * Turns a Greenhouse/Workday job URL's path into a plausible company
 * name for the mock, e.g. `/acme-co/jobs/12345` -> "Acme Co". Falls
 * back to "Unknown Company" if the URL has no usable path segment --
 * this is fabricated demo data, not real parsing.
 */
function fabricateCompanyName(parsed: URL): string {
  const segments = parsed.pathname.split("/").filter(Boolean)
  const slug = segments[0] ?? parsed.hostname.split(".")[0]

  if (!slug) {
    return "Unknown Company"
  }

  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function daysAgoIsoDate(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

/**
 * Mock `POST /applications/autofill` for F5, mirroring the real
 * backend's `AutofillParsed` / `AutofillUnsupported` / `AutofillFailed`
 * discriminated union (backend/API_SPEC_V1.md #3.4/#6.12-6.14) --
 * `status` is the discriminator, not boolean flags, and there's no real
 * parser here (that's BACKEND_TASKS.md's B10-B13, still
 * unbuilt/unspiked). This deterministically fabricates a response keyed
 * off the pasted URL's hostname/path so the paste-a-link flow can be
 * built and demoed end-to-end against all three response shapes:
 *
 * - Success (fabricated fields): any Greenhouse/Workday URL, e.g.
 *     https://boards.greenhouse.io/acme-co/jobs/12345
 *     https://acme.wd1.myworkdayjobs.com/en-US/careers/job/Remote/Software-Engineer_R12345
 * - Failed (supported platform, "parse" blows up): same as above but
 *   with "broken" anywhere in the URL, e.g.
 *     https://boards.greenhouse.io/broken-co/jobs/12345
 * - Unsupported: anything else, including the platforms PRD.md says
 *   never parse, e.g.
 *     https://linkedin.com/jobs/view/12345
 *     https://glassdoor.com/job-listing/12345
 *     https://example.com/careers/12345
 */
export const autofillHandlers = [
  http.post(url("/applications/autofill"), async ({ request }) => {
    const body = (await request.json()) as { url?: string }
    const rawUrl = (body.url ?? "").trim()

    let parsed: URL | null = null
    try {
      parsed = new URL(rawUrl)
    } catch {
      parsed = null
    }

    const hostname = parsed?.hostname ?? ""
    const source = hostname.includes("myworkdayjobs.com") ? "workday" : "greenhouse"
    const isSupportedPlatform = SUPPORTED_HOSTNAME_SUBSTRINGS.some((substring) =>
      hostname.includes(substring)
    )

    if (!isSupportedPlatform) {
      const response: AutofillResponse = { status: "unsupported", url: rawUrl }
      return HttpResponse.json(response)
    }

    if (rawUrl.includes("broken")) {
      const response: AutofillResponse = { status: "failed", url: rawUrl, reason: "no_data" }
      return HttpResponse.json(response)
    }

    const company = fabricateCompanyName(parsed as URL)
    const response: AutofillResponse = {
      status: "parsed",
      source,
      fields: {
        company,
        title: "Software Engineer",
        location: "Remote",
        salary: source === "workday" ? null : "$120,000 - $150,000",
        date_posted: daysAgoIsoDate(3),
        job_url: rawUrl,
        suggested_status: "applied",
      },
    }
    return HttpResponse.json(response)
  }),
]
