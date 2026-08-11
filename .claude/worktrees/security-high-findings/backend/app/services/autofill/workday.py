"""B12 — Workday parser (strategy per docs/decisions/workday-parsing-feasibility.md).

Workday career sites hydrate from a deterministic CXS JSON endpoint derived from
the posting URL:

    posting:  https://{tenant}.{dc}.myworkdayjobs.com/{lang?}/{site}/job/{path...}
    cxs json: https://{tenant}.{dc}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{path...}

The JSON's `jobPostingInfo` envelope gives title, location(+additionalLocations),
and startDate (-> date_posted). Salary is usually absent (left null). Any
anomaly returns None so B13 falls back to manual entry.
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

import httpx

from app.services.autofill.base import ParsedFields, make_parsed, parse_iso_date

# locale segment like en-US / en_US / fr-FR
_LOCALE_RE = re.compile(r"^[a-z]{2}[-_][A-Z]{2}$")


def matches(host: str) -> bool:
    return host.lower().rstrip(".").endswith("myworkdayjobs.com")


def _build_cxs_url(url: str) -> str | None:
    parts = urlsplit(url)
    host = parts.netloc
    tenant = host.split(".")[0]
    if not tenant:
        return None

    segments = [s for s in parts.path.split("/") if s]
    # Drop a leading locale segment if present.
    if segments and _LOCALE_RE.match(segments[0]):
        segments = segments[1:]

    # Expect: {site}/job/{rest...}
    if len(segments) < 3 or "job" not in segments:
        return None
    job_idx = segments.index("job")
    if job_idx < 1:
        return None
    site = segments[job_idx - 1]
    rest = segments[job_idx + 1 :]
    if not rest:
        return None

    path = "/".join(rest)
    return f"{parts.scheme}://{host}/wday/cxs/{tenant}/{site}/job/{path}"


def _extract_location(info: dict) -> str | None:
    primary = info.get("location")
    extras = info.get("additionalLocations") or []
    parts = [p for p in [primary, *extras] if p]
    if not parts:
        return None
    # De-dupe while preserving order.
    seen: list[str] = []
    for p in parts:
        if p not in seen:
            seen.append(p)
    return "; ".join(seen)


async def parse(url: str, client: httpx.AsyncClient) -> ParsedFields | None:
    cxs_url = _build_cxs_url(url)
    if cxs_url is None:
        return None

    resp = await client.get(cxs_url, headers={"Accept": "application/json"})
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None

    info = data.get("jobPostingInfo")
    if not isinstance(info, dict) or not info.get("title"):
        return None

    org = data.get("hiringOrganization") or {}
    tenant = urlsplit(url).netloc.split(".")[0]
    company = (org.get("name") if isinstance(org, dict) else None) or tenant.replace(
        "-", " "
    ).title()

    return make_parsed(
        url,
        company=company,
        title=info.get("title"),
        location=_extract_location(info),
        salary=None,  # Workday CXS rarely exposes comp.
        date_posted=parse_iso_date(info.get("startDate")),
    )
