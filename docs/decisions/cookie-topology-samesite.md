# ADR: Deployment topology and the refresh cookie's `SameSite` attribute (B25)

Status: Accepted — 2026-08-21
Deciders: User (product owner), Backend
Related tasks: B25 (this spike), B26 (token config), B28 (`/auth/refresh`, `/auth/logout`), B29 (credentialed CORS), FRONTEND F19–F21
Related requirements: PRD_V2 R7.2, R7.7, and the "Deployment topology now constrains the cookie design" risk

## Context

V2 introduces a DB-backed refresh token carried in an httpOnly cookie (R7.3).
Cookies are the one part of the auth design whose correctness depends on where
the app is *deployed*, and hosting for jTracks is still undecided — it was an
open question in V1 and remains one.

`SameSite=Lax` cookies are **not sent on cross-site requests at all**. "Site"
here means registrable domain, so:

| Topology | Is it same-site? | Does a `Lax` refresh cookie arrive? |
|---|---|---|
| `localhost:5173` → `localhost:8000` | yes | yes |
| `app.example.com` → `api.example.com` | yes (same registrable domain) | yes |
| `jtracks.vercel.app` → `jtracks.fly.dev` | **no** | **no** |

The third row is the failure mode that motivated this spike: it works perfectly
in local development and in a same-domain staging setup, then silently breaks
in production, with no error — the cookie simply is not attached, `/auth/refresh`
sees no credential, and every session dies on page reload. That is an expensive
bug to discover after the fact, which is why the PRD insists this be settled
*before* R7 is implemented rather than after.

The two candidates:

**(a) Commit to a same-site deployment and keep `SameSite=Lax`.**
Requires buying a domain and hosting the frontend and API as subdomains of it.
Needs no CSRF defense: `Lax` already blocks cross-site `POST`.

**(b) Assume a cross-site deployment: `SameSite=None; Secure`, a strict origin
allowlist, and an explicit CSRF defense.**
Works in *all three* topologies above. Costs a CSRF defense, because a `None`
cookie is by definition attached to cross-site requests.

## Decision

**Option (b): `SameSite=None; Secure`, strict origin allowlist, plus a
custom-header CSRF check confined to the two cookie-reading endpoints.**

The deciding argument is that option (b) is topology-*independent* and option
(a) is not. `SameSite=None` behaves identically on `localhost`, on split
free-tier hosts, and on same-registrable-domain subdomains, so the auth design
survives a later hosting decision without a code change. Option (a) would
require committing to a paid custom domain now, purely to avoid a CSRF header —
and if that commitment were ever revisited (a move to free-tier hosting for a
portfolio project is a very plausible future), the failure would be silent and
production-only.

The cost is real but small and bounded: because the cookie is scoped
`Path=/auth`, the browser attaches it to exactly two endpoints, so the CSRF
surface is those two endpoints and nothing else.

### Exact cookie attributes to implement

```
Set-Cookie: jtracks_refresh=<opaque token>; HttpOnly; Secure; SameSite=None; Path=/auth; Max-Age=<REFRESH_TOKEN_EXPIRE_DAYS>
```

Configured in `app/core/config.py` as `REFRESH_COOKIE_NAME`,
`REFRESH_COOKIE_PATH`, `REFRESH_COOKIE_SAMESITE`, `REFRESH_COOKIE_SECURE` and
`REFRESH_TOKEN_EXPIRE_DAYS` (B26).

Notes on individual attributes:

- **`Secure` is unconditional.** It is *not* switched off in development.
  Chrome and Firefox both accept `Secure` cookies over `http://localhost`, so
  local development works as-is. A `Secure` flag that disables itself based on
  an environment variable is the standard way these end up shipping insecure,
  and `SameSite=None` is rejected outright by browsers without `Secure` anyway.
- **`Path=/auth`** is load-bearing, not cosmetic. It is what keeps the cookie
  off the other 13 authenticated endpoints and therefore what confines the CSRF
  surface to two routes.
- **Clearing must repeat the same attributes.** A `Set-Cookie` deletion that
  omits `Path`/`SameSite`/`Secure` targets a *different* cookie and the browser
  keeps the original. Logout sets the same name/path/samesite/secure/httponly
  with an immediate expiry.

### Token storage split (not reopened)

Confirmed by R7.2 and explicitly out of this spike's scope: the **access** token
lives in frontend memory and travels as `Authorization: Bearer`, unchanged from
V1. Only the **refresh** token is a cookie. This is what keeps `get_current_user`
and the `HTTPBearer` dependency untouched across every authenticated endpoint,
and it is the reason CSRF is a two-endpoint problem rather than an
every-mutation problem — a `Bearer` header is not an ambient credential and
cannot be attached by a cross-site page.

### CSRF: in scope, and scoped

CSRF work is **in scope**, on `POST /auth/refresh` and `POST /auth/logout` only.

The defense is the **custom-header** pattern: both endpoints require the request
header

```
X-Refresh-Request: 1
```

and reject the request with **`403`** if it is absent. This is sufficient
because a cross-origin page cannot set a custom header on a request without
triggering a CORS preflight, and B29's strict origin allowlist refuses the
preflight for any origin that is not explicitly allowed. The two mechanisms are
what make each other work: the header forces a preflight, and the allowlist
fails it.

A double-submit cookie token was considered and **rejected**. It would add a
second cookie and a second value to keep in sync while defending against exactly
the same attack the header already blocks, and it buys nothing extra given a
strict allowlist.

**No other endpoint gets a CSRF check.** Adding one elsewhere would be
cargo-culting: with no cookie in scope for those paths, there is no ambient
credential for a cross-site request to abuse.

### Interaction with logout's idempotency

R7.4 requires `POST /auth/logout` to be idempotent — always `204`, even with no
cookie or an invalid one. That requirement and the CSRF check are about
different things and are ordered deliberately:

1. **CSRF header check runs first.** No `X-Refresh-Request` header → `403`, and
   no session state is touched.
2. **Then logout runs and always returns `204`**, whatever the cookie's state
   (absent, malformed, unknown, already revoked).

Idempotency is a statement about *token state* — "logging out twice is not an
error" — not a licence to accept unauthenticated cross-site calls. A
cross-origin page that could reach logout without the header could log the user
out at will; harmless-ish, but it is a real forced-state-change and there is no
reason to permit it when the check costs one line.

### CORS consequences (B29)

- `allow_credentials=True` in `app/main.py`, reversing the MVP's deliberate
  `False`. Required for the browser to send the cookie at all.
- `X-Refresh-Request` must be added to `allow_headers`, or the preflight for
  the two endpoints fails.
- The wildcard guard in `config.py`'s `_validate_cors_origins` **stays and
  becomes genuinely load-bearing**. `SameSite=None` + credentialed CORS + a
  wildcard origin is an open door, and the CSRF defense above collapses entirely
  if any origin can pass the preflight. The startup failure on `CORS_ORIGINS=*`
  is not a lint — it is the backstop for this whole design, and must remain a
  hard failure.
- Deployment origins go in `CORS_ORIGINS` as an explicit, comma-separated list
  once hosting is chosen. Until then it holds the local dev origins only.

## Consequences

**Good**

- Auth works identically in local development, on split cross-site hosts, and
  on same-domain subdomains. The hosting decision can be deferred indefinitely
  without any risk of a silent production-only auth failure.
- The CSRF surface is two endpoints, both of which already needed bespoke
  handling.
- No CSRF token state, no second cookie, no per-request token minting.

**Bad / accepted**

- `SameSite=None` means the refresh cookie *is* attached to cross-site requests,
  so the custom-header check and the origin allowlist are load-bearing rather
  than defense-in-depth. If someone later relaxes `CORS_ORIGINS`, adds a
  wildcard, or drops the header requirement "because it's annoying in curl",
  the protection is gone. The startup wildcard guard and the tests in
  `tests/test_auth_refresh.py` exist specifically to make that regression loud.
- Any non-browser client (curl, a future CLI, integration tests) must send
  `X-Refresh-Request` explicitly. Documented in `API_SPEC_V2.md`.
- Safari's ITP has historically been aggressive about third-party cookies. In a
  genuinely cross-site deployment, a Safari user could lose silent refresh and
  be asked to log in again more often. Acceptable for a single-user portfolio
  app; a same-site deployment would remove the concern entirely, and this ADR
  does not preclude moving to one later — `SameSite=None` keeps working there.

## Alternatives rejected

- **Option (a), same-site + `Lax`.** Strictly better *if* the same-site
  deployment is guaranteed. It is not, and the failure mode when it turns out
  not to be is silent and production-only.
- **Access token in a cookie too.** Would push CSRF onto every state-changing
  endpoint and require touching `get_current_user` and all 13 authenticated
  routes. Explicitly excluded by R7.2 and out of this spike's scope.
- **Double-submit CSRF token.** Same protection as the custom header against
  this threat, more moving parts and more state.
- **Refresh token in `localStorage`.** The thing V2 exists to remove.
