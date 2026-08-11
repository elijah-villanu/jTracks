"""B10/B12/B13 — autofill parsers + dispatcher graceful behavior."""
from __future__ import annotations

import asyncio

import httpx

import app.services.autofill.dispatcher as dispatcher_mod
from app.services.autofill.dispatcher import autofill

GH_JOB = {
    "id": 123,
    "title": "Software Engineer, Backend",
    "location": {"name": "Remote - US"},
    "company_name": "Acme Corp",
    "first_published": "2026-06-01T12:00:00Z",
    "pay_input_ranges": [
        {"min_cents": 12000000, "max_cents": 18000000, "currency_type": "USD"}
    ],
}

WD_JOB = {
    "jobPostingInfo": {
        "title": "Senior Data Engineer",
        "location": "San Francisco, CA",
        "additionalLocations": ["Austin, TX", "San Francisco, CA"],
        "startDate": "2026-05-15",
        "jobReqId": "JR-0001",
    },
    "hiringOrganization": {"name": "Globex"},
}


def _run(coro):
    return asyncio.run(coro)


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ---------- B10 Greenhouse ----------

def test_greenhouse_parse_success():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "boards-api.greenhouse.io" in str(request.url)
        assert "/boards/acme/jobs/123" in str(request.url)
        return httpx.Response(200, json=GH_JOB)

    url = "https://boards.greenhouse.io/acme/jobs/123"

    async def go():
        async with _client(handler) as c:
            return await autofill(url, c)

    res = _run(go())
    assert res.status == "parsed"
    assert res.source == "greenhouse"
    assert res.fields.company == "Acme Corp"
    assert res.fields.title == "Software Engineer, Backend"
    assert res.fields.location == "Remote - US"
    assert res.fields.date_posted.isoformat() == "2026-06-01"
    assert "USD" in res.fields.salary
    assert res.fields.suggested_status.value == "applied"


def test_greenhouse_http_error_is_failed():
    def handler(request):
        return httpx.Response(404)

    url = "https://boards.greenhouse.io/acme/jobs/999"

    async def go():
        async with _client(handler) as c:
            return await autofill(url, c)

    res = _run(go())
    assert res.status == "failed"


# ---------- B12 Workday ----------

def test_workday_parse_success():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(200, json=WD_JOB)

    url = "https://globex.wd1.myworkdayjobs.com/en-US/External/job/San-Francisco/Senior-Data-Engineer_JR-0001"

    async def go():
        async with _client(handler) as c:
            return await autofill(url, c)

    res = _run(go())
    assert res.status == "parsed"
    assert res.source == "workday"
    # CXS endpoint correctly derived.
    assert "/wday/cxs/globex/External/job/San-Francisco/Senior-Data-Engineer_JR-0001" in seen["url"]
    assert res.fields.company == "Globex"
    assert res.fields.title == "Senior Data Engineer"
    # De-duped multi-location.
    assert res.fields.location == "San Francisco, CA; Austin, TX"
    assert res.fields.date_posted.isoformat() == "2026-05-15"
    assert res.fields.salary is None


def test_workday_malformed_json_is_failed():
    def handler(request):
        return httpx.Response(200, json={"unexpected": "shape"})

    url = "https://globex.wd1.myworkdayjobs.com/en-US/External/job/x/Role_JR1"

    async def go():
        async with _client(handler) as c:
            return await autofill(url, c)

    assert _run(go()).status == "failed"


# ---------- B13 dispatcher graceful fallback ----------

def test_unsupported_domains_fall_back():
    for url in (
        "https://www.linkedin.com/jobs/view/123",
        "https://www.glassdoor.com/job-listing/456",
        "https://example.com/careers/1",
        "not-even-a-url",
    ):
        res = _run(autofill(url))
        assert res.status == "unsupported", url
        assert res.url == url.strip()


def test_parser_exception_is_failed_not_500(monkeypatch):
    async def boom(url, client):
        raise RuntimeError("simulated parser explosion")

    monkeypatch.setattr(dispatcher_mod.greenhouse, "parse", boom)
    res = _run(autofill("https://boards.greenhouse.io/acme/jobs/1"))
    assert res.status == "failed"
    assert res.reason == "unexpected_error"


# ---------- endpoint level (never 500) ----------

def test_autofill_endpoint_graceful(client, auth_headers, monkeypatch):
    # unsupported domain
    r = client.post("/applications/autofill", json={"url": "https://linkedin.com/x"}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "unsupported"


def test_autofill_endpoint_requires_auth(client):
    assert client.post("/applications/autofill", json={"url": "https://x.com"}).status_code == 401
