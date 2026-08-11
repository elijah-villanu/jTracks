"""B13 — autofill dispatcher.

Routes a pasted URL to the Greenhouse or Workday parser by hostname and returns
one of three structured shapes — parsed / unsupported / failed — never a 500 and
never a raised exception. Unknown domains (incl. LinkedIn/Glassdoor, which are
intentionally unparsed per the PRD) return `unsupported`; a recognized platform
that we couldn't extract (bad structure, timeout, HTTP error, parser exception)
returns `failed`. Both fall-backs preserve the URL so the frontend can drop the
user into the manual review form.
"""
from __future__ import annotations

import logging
from urllib.parse import urlsplit

import httpx

from app.core.config import settings
from app.schemas.autofill import AutofillFailed, AutofillParsed, AutofillUnsupported
from app.services.autofill import greenhouse, workday
from app.services.autofill.net_guard import BlockedOutboundRequest, ssrf_request_hook

logger = logging.getLogger("jtracks.autofill")

AutofillResult = AutofillParsed | AutofillUnsupported | AutofillFailed

# (name, parser_module). Modules are referenced dynamically at call time (not
# their functions captured here) so `matches`/`parse` stay monkeypatchable.
_PARSERS = [
    ("greenhouse", greenhouse),
    ("workday", workday),
]


def _hostname(url: str) -> str | None:
    try:
        host = urlsplit(url).netloc.lower()
    except ValueError:
        return None
    if not host:
        return None
    return host.split(":")[0]  # strip any port


async def autofill(
    url: str, client: httpx.AsyncClient | None = None
) -> AutofillResult:
    url = url.strip()
    host = _hostname(url)
    if host is None:
        return AutofillUnsupported(url=url)

    for name, parser in _PARSERS:
        if not parser.matches(host):
            continue
        # Recognized platform: attempt parse, but any failure => "failed".
        owns_client = client is None
        if owns_client:
            client = httpx.AsyncClient(
                timeout=settings.AUTOFILL_TIMEOUT_SECONDS,
                # SECURITY (audit H1): redirects are how an allowlisted host
                # bounces us into 169.254.169.254 or localhost. Don't follow
                # them; a job board that 302s simply fails to autofill.
                follow_redirects=False,
                headers={"User-Agent": settings.AUTOFILL_USER_AGENT},
                # Transport-level SSRF check on every request this client makes,
                # whichever parser built the URL.
                event_hooks={"request": [ssrf_request_hook]},
            )
        try:
            fields = await parser.parse(url, client)
        except BlockedOutboundRequest as exc:
            # Expected when someone probes the endpoint — log, don't alarm.
            logger.warning("Autofill blocked outbound request for %s: %s", url, exc)
            return AutofillFailed(url=url, reason="blocked_host")
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("Autofill %s parser error for %s: %s", name, url, exc)
            return AutofillFailed(url=url, reason="parser_error")
        except Exception as exc:  # defensive: never propagate to a 500
            logger.exception("Autofill %s unexpected error for %s: %s", name, url, exc)
            return AutofillFailed(url=url, reason="unexpected_error")
        finally:
            if owns_client and client is not None:
                await client.aclose()

        if fields is None:
            return AutofillFailed(url=url, reason="no_data")
        return AutofillParsed(source=name, fields=fields)

    # No parser recognized the host.
    return AutofillUnsupported(url=url)
