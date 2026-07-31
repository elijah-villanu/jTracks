"""Bounded JSON fetch for the autofill parsers (audit M3).

`await client.get(url)` followed by `resp.json()` buffers whatever the remote
sends. `AUTOFILL_TIMEOUT_SECONDS` bounds how *long* that takes, not how *many
bytes* arrive — a host that streams 8 seconds of zeroes at line rate, or simply
declares a multi-gigabyte body, exhausts the API server's memory. Paired with
H1/M1 (where an attacker influenced which host we contacted) that was a remote
memory-exhaustion primitive; even against the real Greenhouse/Workday it is a
sensible bound on a third party we don't control.

Everything here fails soft: a `None` return means "couldn't get usable JSON",
which the dispatcher turns into a `failed` autofill result and the UI turns into
manual entry.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger("jtracks.autofill")


def _is_json_content_type(raw: str | None) -> bool:
    if not raw:
        return False
    media_type = raw.split(";", 1)[0].strip().lower()
    return media_type in {"application/json", "text/json"} or media_type.endswith(
        "+json"
    )


async def fetch_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    max_bytes: int | None = None,
) -> Any | None:
    """GET `url` and decode JSON, or return None.

    Refuses to buffer more than `max_bytes` (default
    `settings.AUTOFILL_MAX_RESPONSE_BYTES`), checked both against the declared
    `Content-Length` and against bytes actually received — a declared length is
    a hint, not a promise. The response is streamed so the connection is torn
    down at the ceiling rather than after the fact.
    """
    limit = max_bytes if max_bytes is not None else settings.AUTOFILL_MAX_RESPONSE_BYTES
    request_headers = {"Accept": "application/json", **(headers or {})}

    async with client.stream("GET", url, headers=request_headers) as resp:
        if resp.status_code != 200:
            return None

        if not _is_json_content_type(resp.headers.get("content-type")):
            logger.warning(
                "Autofill response for %s was %r, not JSON — discarded",
                url,
                resp.headers.get("content-type"),
            )
            return None

        declared = resp.headers.get("content-length")
        if declared is not None:
            try:
                if int(declared) > limit:
                    logger.warning(
                        "Autofill response for %s declared %s bytes (> %d) — discarded",
                        url,
                        declared,
                        limit,
                    )
                    return None
            except ValueError:
                return None

        chunks: list[bytes] = []
        total = 0
        async for chunk in resp.aiter_bytes():
            total += len(chunk)
            if total > limit:
                logger.warning(
                    "Autofill response for %s exceeded %d bytes — aborted", url, limit
                )
                return None
            chunks.append(chunk)

    try:
        return json.loads(b"".join(chunks))
    except ValueError:
        return None
