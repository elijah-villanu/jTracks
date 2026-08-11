# ADR: Workday parsing feasibility (B11)

Status: Accepted — GO — 2026-07-22
Deciders: Backend (solo developer)
Related tasks: B11 (spike), B12 (Workday parser), B13 (autofill endpoint)

## Context

The PRD wants autofill from a pasted posting URL for **Workday** and
**Greenhouse**. Greenhouse is easy (documented public Job Board JSON API).
Workday is the risk: no official public API, postings are server-rendered, and
the PRD explicitly asks for a feasibility spike before committing.

## Investigation

Workday career sites are all hosted under the `*.myworkdayjobs.com` domain with a
predictable structure. A public posting URL looks like:

```
https://{tenant}.{dc}.myworkdayjobs.com/{lang}/{site}/job/{location-slug}/{title}_{JR-id}
        └─ tenant   └─ data center (wd1, wd3, wd5, ...)     └─ site (e.g. External)
```

Crucially, the human-facing page is a React SPA that hydrates itself from a
**Workday CXS (Career eXperience Service) JSON endpoint** at a deterministic URL
derived from the posting URL:

```
https://{tenant}.{dc}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{path-after-/job/}
```

A `GET` (some tenants prefer no trailing content negotiation; a plain GET with a
browser-like `User-Agent` works) returns JSON shaped like:

```jsonc
{
  "jobPostingInfo": {
    "title": "Software Engineer",
    "jobDescription": "<p>…</p>",
    "location": "San Francisco, CA",
    "additionalLocations": ["Austin, TX"],
    "startDate": "2026-06-01",        // date posted
    "timeType": "Full time",
    "jobReqId": "JR-0012345",
    "externalUrl": "…"
  },
  "hiringOrganization": { "name": "Acme Corp" }
}
```

This is the same JSON the official site consumes, so it is far more stable than
scraping rendered HTML: `title`, `location` (+`additionalLocations`),
`startDate` (→ `date_posted`), and the org name map cleanly onto our output
contract. Salary is usually **absent** (Workday rarely exposes comp in this
payload) — that field will simply come back null, which the review form handles.

Confirmed current (2026) via public references documenting the
`/wday/cxs/{tenant}/{site}/job/...` endpoint and the `jobPostingInfo` envelope
(see Sources).

### Brittleness assessment

- The `/wday/cxs/.../job/...` path is uniform across tenants — the derivation
  from the posting URL is mechanical, not per-company. This is the single
  biggest reason the spike lands on GO rather than no-go.
- Field *keys* inside `jobPostingInfo` are stable across tenants (unlike the
  faceted *search* endpoint, whose filter field IDs vary per tenant — we don't
  need search, only single-job detail).
- Failure modes (tenant blocks non-browser UA, path shape changes, network
  timeout) are all recoverable: per the PRD, any parse failure must fall back to
  the manual review form with the URL preserved. So even a brittle parser
  degrades safely rather than breaking the feature.

## Decision

**GO.** Implement a best-effort Workday parser that:

1. Recognizes `*.myworkdayjobs.com` hostnames.
2. Derives the CXS JSON URL from the posting URL.
3. Fetches with a short timeout + browser-like `User-Agent`.
4. Maps `jobPostingInfo` → our `ParsedPosting` contract (company, title,
   location, salary=None unless present, date_posted from `startDate`).
5. Returns a structured "failed" result (never raises) on any anomaly, so B13
   can hand off to manual entry.

## Consequences / ToS note

Consuming a site's own hydration JSON is lower-risk than headless-browser
scraping, but it is still automated access. Per the PRD's own risk note, this is
acceptable for a personal/portfolio tool used at low volume; we send a single
request per user-initiated paste, set a real `User-Agent`, and never crawl. This
is **not** a bulk scraper.

## Sources

- https://jobspipe.dev/blog/workday-api-guide
- https://jobspipe.dev/sources/workday
