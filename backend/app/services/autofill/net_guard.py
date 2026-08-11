"""SSRF guard for outbound autofill requests (audit H1).

The autofill feature fetches a URL derived from user input, which makes the API
server a proxy into whatever network it runs in — cloud metadata
(169.254.169.254), container-internal services, localhost admin ports. This
module is the chokepoint that decides whether an outbound request is allowed.

Three independent checks, because each is individually bypassable:

  1. **Scheme** must be https. The Workday parser used to echo the user's scheme
     back, so `http://` (or `file://`, `gopher://`) went straight through.
  2. **Host** must be an exact match or a true subdomain of an allowed domain.
     A bare `endswith("myworkdayjobs.com")` also accepts the registerable
     `notmyworkdayjobs.com`.
  3. **Resolved address** must be publicly routable. Even a legitimately-named
     host can resolve to 127.0.0.1 if an attacker controls its DNS.

Known limitation: between our resolution here and httpx's own resolution there
is a small DNS-rebinding window. Closing it fully means pinning the resolved IP
into the connection; for this project's blast radius, resolve-then-validate plus
an exact-host allowlist is the proportionate control.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

import httpx

# Every domain the autofill feature is permitted to contact. Parsers narrow
# further; this is the transport-level backstop that applies to any request the
# dispatcher's own client makes, whichever parser built the URL.
ALLOWED_OUTBOUND_DOMAINS: tuple[str, ...] = (
    "greenhouse.io",
    "myworkdayjobs.com",
)

ALLOWED_SCHEMES: frozenset[str] = frozenset({"https"})


class BlockedOutboundRequest(Exception):
    """An outbound autofill request was refused by the SSRF guard."""


def host_matches_domain(host: str | None, domains: tuple[str, ...]) -> bool:
    """True if `host` is one of `domains` or a true subdomain of one.

    The dot boundary is the whole point: "evilgreenhouse.io" must not match
    "greenhouse.io".
    """
    if not host:
        return False
    host = host.lower().rstrip(".")
    if not host:
        return False
    return any(host == domain or host.endswith("." + domain) for domain in domains)


def _normalize(ip):
    """Unwrap IPv4-mapped IPv6 so ::ffff:127.0.0.1 is judged as 127.0.0.1."""
    mapped = getattr(ip, "ipv4_mapped", None)
    return mapped if mapped is not None else ip


def is_blocked_address(ip) -> bool:
    ip = _normalize(ip)
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local  # includes 169.254.169.254 cloud metadata
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
        or not ip.is_global
    )


def assert_public_host(host: str) -> None:
    """Resolve `host` and refuse if any answer is not publicly routable.

    *Any* — not "the first one" — because a hostname with both a public and a
    private A record would otherwise be a coin flip.
    """
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise BlockedOutboundRequest(f"could not resolve host {host!r}") from exc

    if not infos:
        raise BlockedOutboundRequest(f"host {host!r} resolved to no addresses")

    for info in infos:
        raw = info[4][0]
        try:
            ip = ipaddress.ip_address(raw)
        except ValueError as exc:  # pragma: no cover - getaddrinfo shouldn't
            raise BlockedOutboundRequest(f"unparseable address {raw!r}") from exc
        if is_blocked_address(ip):
            raise BlockedOutboundRequest(
                f"host {host!r} resolves to non-public address {ip}"
            )


def assert_safe_outbound_url(
    url: str, domains: tuple[str, ...] = ALLOWED_OUTBOUND_DOMAINS
) -> None:
    """Raise BlockedOutboundRequest unless `url` is safe to fetch."""
    parts = urlsplit(url)

    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise BlockedOutboundRequest(f"scheme {parts.scheme!r} is not allowed")

    # `.hostname` (not `.netloc`) drops userinfo and port, so
    # "https://evil.com@internal/" is judged on "internal".
    try:
        host = parts.hostname
    except ValueError as exc:
        raise BlockedOutboundRequest(f"malformed host in {url!r}") from exc

    if not host_matches_domain(host, domains):
        raise BlockedOutboundRequest(f"host {host!r} is not an allowed domain")

    # Host is on the allowlist; last check is that it hasn't been pointed at
    # something internal. Ordered last so blocked hosts never trigger DNS.
    assert_public_host(host)


async def ssrf_request_hook(request: httpx.Request) -> None:
    """httpx event hook: validate every request the dispatcher's client makes.

    Applied at the transport layer so it covers whatever URL a parser builds,
    including any request issued after a redirect (redirects are disabled, but
    this stays correct if that ever changes).
    """
    assert_safe_outbound_url(str(request.url))
