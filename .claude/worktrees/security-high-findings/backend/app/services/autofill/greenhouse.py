"""B10 — Greenhouse parser.

Greenhouse exposes a public, unauthenticated Job Board JSON API:
    https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}
We derive `board_token` and `job_id` from the pasted posting URL (boards.
greenhouse.io / job-boards.greenhouse.io / *.greenhouse.io) and read the JSON —
no HTML scraping. Salary is included only when the board configured pay ranges.
"""
from __future__ import annotations

import re

import httpx

from app.services.autofill.base import ParsedFields, make_parsed, parse_iso_date

_API = "https://boards-api.greenhouse.io/v1/boards/{token}/jobs/{job_id}?questions=false"

# .../{token}/jobs/{numeric_id}  (works for boards. and job-boards. hosts)
_PATH_RE = re.compile(r"/(?P<token>[^/]+)/jobs/(?P<job_id>\d+)")


def matches(host: str) -> bool:
    host = host.lower()
    return host.endswith("greenhouse.io") or host.endswith("greenhouse.io.")


def _extract_token_and_id(url: str) -> tuple[str, str] | None:
    m = _PATH_RE.search(url)
    if not m:
        return None
    return m.group("token"), m.group("job_id")


def _format_salary(job: dict) -> str | None:
    ranges = job.get("pay_input_ranges") or []
    for r in ranges:
        mn, mx = r.get("min_cents"), r.get("max_cents")
        cur = r.get("currency_type") or "USD"
        if mn and mx:
            return f"{cur} {int(mn) // 100:,} - {int(mx) // 100:,}"
        if mn:
            return f"{cur} {int(mn) // 100:,}+"
    return None


async def parse(url: str, client: httpx.AsyncClient) -> ParsedFields | None:
    parsed = _extract_token_and_id(url)
    if parsed is None:
        return None
    token, job_id = parsed

    resp = await client.get(_API.format(token=token, job_id=job_id))
    if resp.status_code != 200:
        return None
    job = resp.json()
    if not isinstance(job, dict) or "title" not in job:
        return None

    location = None
    loc = job.get("location")
    if isinstance(loc, dict):
        location = loc.get("name")

    company = job.get("company_name") or token.replace("-", " ").title()

    return make_parsed(
        url,
        company=company,
        title=job.get("title"),
        location=location,
        salary=_format_salary(job),
        # first_published is when the posting went live.
        date_posted=parse_iso_date(job.get("first_published") or job.get("updated_at")),
    )
