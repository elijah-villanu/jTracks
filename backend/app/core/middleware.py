"""Transport-level guards applied to every request (audit M2, L2).

Both are plain ASGI middleware rather than `BaseHTTPMiddleware`: they need to
act *before* the request body is read (size limit) and *while* the response
headers are being sent (security headers), and neither needs the request/
response object model.
"""
from __future__ import annotations

import json
import logging

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("jtracks.middleware")

# Methods that carry a body worth bounding. GET/DELETE/HEAD/OPTIONS bodies are
# not read by any handler in this app.
_BODY_METHODS = frozenset({"POST", "PUT", "PATCH"})

_TOO_LARGE_BODY = json.dumps(
    {"detail": "Request body too large."}
).encode()
_BAD_LENGTH_BODY = json.dumps(
    {"detail": "Invalid Content-Length header."}
).encode()

# Paths whose HTML/JS is loaded from a CDN by Swagger UI. A `default-src 'none'`
# CSP would blank them out. They are development-only anyway (audit L1).
_DOCS_PATHS = frozenset({"/docs", "/redoc", "/docs/oauth2-redirect"})


async def _send_json(send: Send, status: int, body: bytes) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class BodySizeLimitMiddleware:
    """Reject request bodies larger than `max_body_bytes` with a 413.

    SECURITY (audit M2): Starlette/uvicorn impose no body cap of their own, so
    a single authenticated `POST /applications` carrying a 5 MB `notes` value
    was accepted (confirmed by PoC) — and nothing stopped it being 5 GB. The
    per-field `max_length` on `notes` is the other half of this fix; this is
    the half that runs before pydantic ever sees the payload, and so also
    covers any future endpoint that forgets a bound.

    Two paths:
      * `Content-Length` present — check it and refuse before reading a byte.
      * absent (chunked transfer-encoding, the obvious bypass) — buffer the
        body here, aborting as soon as the cap is passed, then replay the
        buffered messages downstream.
    """

    def __init__(self, app: ASGIApp, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in _BODY_METHODS:
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        content_length = headers.get("content-length")

        if content_length is not None:
            try:
                declared = int(content_length)
            except ValueError:
                await _send_json(send, 400, _BAD_LENGTH_BODY)
                return
            if declared > self.max_body_bytes:
                logger.warning(
                    "Rejected %s %s: Content-Length %d exceeds %d",
                    scope.get("method"),
                    scope.get("path"),
                    declared,
                    self.max_body_bytes,
                )
                await _send_json(send, 413, _TOO_LARGE_BODY)
                return
            await self.app(scope, receive, send)
            return

        # No Content-Length: the client is streaming. Buffer with a ceiling.
        buffered: list[Message] = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                buffered.append(message)
                break
            total += len(message.get("body", b""))
            if total > self.max_body_bytes:
                logger.warning(
                    "Rejected streamed %s %s: body exceeded %d bytes",
                    scope.get("method"),
                    scope.get("path"),
                    self.max_body_bytes,
                )
                await _send_json(send, 413, _TOO_LARGE_BODY)
                return
            buffered.append(message)
            if not message.get("more_body", False):
                break

        queue = iter(buffered)

        async def replay() -> Message:
            try:
                return next(queue)
            except StopIteration:
                # Downstream asked for more than we buffered; the body is done.
                return {"type": "http.disconnect"}

        await self.app(scope, replay, send)


class SecurityHeadersMiddleware:
    """Attach conservative response headers (audit L2).

    This is a JSON API with no server-rendered HTML, so these are defence in
    depth rather than primary controls — the point is that a browser told to
    treat a response as HTML, frame it, or sniff its type refuses to.
    """

    def __init__(self, app: ASGIApp, *, hsts: bool) -> None:
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        is_docs = scope.get("path", "") in _DOCS_PATHS

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("x-content-type-options", "nosniff")
                headers.setdefault("x-frame-options", "DENY")
                headers.setdefault("referrer-policy", "no-referrer")
                if not is_docs:
                    headers.setdefault(
                        "content-security-policy",
                        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
                    )
                if self.hsts:
                    headers.setdefault(
                        "strict-transport-security",
                        "max-age=31536000; includeSubDomains",
                    )
            await send(message)

        await self.app(scope, receive, send_with_headers)
