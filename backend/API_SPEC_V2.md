# jTracks API — v2 Specification

**This is the contract of record.** It supersedes
[`API_SPEC_V1.md`](./API_SPEC_V1.md), which remains in the repository as the historical
record of the shipped MVP. This document is standalone: every endpoint the app serves is
documented here, including the ones V2 did not change. You should never need to open the
V1 spec to use the V2 API.

Reference for the jTracks FastAPI backend. Every path, status code, field name and
constraint in this document was read out of `backend/app/**` and confirmed by executing
the running app (see [Verification](#10-verification)).

V2 is a **hard cutover**. There is no `/v2` namespace, no alias for the old
`interviewing` enum value, no alias for the removed `rejection_rate` field, and no
deprecation window. Frontend and backend ship together. See
[§11 Changelog](#11-changelog--status) for the complete list of breaking changes.

---

## 1. Overview

| Item | Value |
|---|---|
| Service | jTracks API (`APP_NAME`, default `"jTracks API"`) |
| Implementation | FastAPI (`fastapi>=0.141`) + Uvicorn, SQLAlchemy 2.0, PostgreSQL (prod) / SQLite (dev+test) |
| Base URL (local dev) | `http://127.0.0.1:8000` |
| Base URL (docker compose) | `http://localhost:8000` |
| Global path prefix | **None.** Routers mount at the root: `/health`, `/auth/*`, `/applications*`, `/settings`, `/dashboard/*` |
| Request content type | `application/json` (every body-taking endpoint) |
| Response content type | `application/json` for all responses except `204 No Content` (empty body) |
| Character encoding | UTF-8 |

### Versioning posture

There is **no version segment in any URL and no version request header**. The FastAPI app
declares `version="1.0.0"`, which surfaces only in the OpenAPI document (`info.version`),
and that document is not served in production (see [§9](#9-operational-limits-and-security-behaviors)).
This specification pins the surface as it exists on 2026-08-21 and calls it **v2**.

Practical consequence for integrators: the contract is unversioned at the transport level,
so any breaking change to a shape is silent from the client's point of view. Treat this
document as the contract of record and re-check it when the backend changes. The V1 → V2
transition is exactly this hazard in action — a client written against V1 will send
`status=interviewing` and read `rejection_rate`, and both now fail silently or loudly with
no version negotiation to catch it.

### Trailing slashes

Canonical paths carry **no** trailing slash. `GET /applications/` and `GET /settings/`
return `307 Temporary Redirect` with a `Location` pointing at the slash-less form.
`307` preserves method and body, but clients should just use the canonical path — a
cross-origin redirect adds a preflight round trip.

### Interactive documentation

`/docs` (Swagger UI), `/redoc` and `/openapi.json` are served **only when `ENVIRONMENT`
is one of** `development`, `dev`, `local`, `test`, `testing`. Anywhere else all three
return `404`. See [§9.5](#95-documentation-endpoints).

---

## 2. Authentication

V2 replaces V1's single long-lived token with a **two-token session** (PRD R7):

| Token | Lifetime | Storage | Transport | Revocable |
|---|---|---|---|---|
| **Access** | 30 minutes | Client memory — never `localStorage`, never a cookie | `Authorization: Bearer <access_token>` | no |
| **Refresh** | 14 days | httpOnly cookie set by the server | Cookie `jtracks_refresh`, `Path=/auth` | **yes**, DB-backed |

Every authenticated endpoint still takes the **access token as a Bearer header**, exactly
as in V1:

```
Authorization: Bearer <access_token>
```

The refresh cookie is scoped to `Path=/auth`, so the browser attaches it to
`POST /auth/refresh` and `POST /auth/logout` and to nothing else. No other endpoint reads
a cookie, and the API never authenticates a request from a cookie alone.

### 2.1 Access-token format

| Property | Value | Source |
|---|---|---|
| Type | JWT, compact serialization | `app/core/security.py` |
| Signing algorithm | `HS256` (`JWT_ALGORITHM`; the verifier passes an explicit single-element `algorithms` list, so `alg: none` and RS256→HS256 confusion are rejected) | `config.py`, `security.py` |
| Lifetime | `ACCESS_TOKEN_EXPIRE_MINUTES = 30` (**changed in V2** — was 7 days) | `config.py` |
| Secret | `JWT_SECRET`. Outside a development environment the app **refuses to start** without one that is ≥32 chars and not a known placeholder. In development an ephemeral random secret is generated per process, so tokens do not survive a restart. | `config.py` |

### 2.2 Access-token claims

| Claim | Type | Issued? | Required at verification? | Value |
|---|---|---|---|---|
| `sub` | string | yes | **yes** | The user's UUID, as a string |
| `iat` | int (epoch s) | yes | **yes** | Issue time (UTC) |
| `exp` | int (epoch s) | yes | **yes** | `iat + 30 minutes` |
| `iss` | string | yes | **yes** | `JWT_ISSUER`, default `jtracks` |
| `aud` | string | yes | **yes** | `JWT_AUDIENCE`, default `jtracks-api` |
| `jti` | string (32 hex) | yes | no | Unique per token |
| `typ` | string | yes | **yes** | Constant `"access"`. **New in V2** — a token without it, or with any other value, is rejected |

`jwt.decode(..., options={"require": ["sub", "exp", "iat", "iss", "aud"]})` — a token that
merely *omits* `exp` is rejected rather than treated as non-expiring. `iss` and `aud` are
also value-checked, so a token minted for a different service that happens to share the
secret does not validate here. The `typ` claim is checked after decoding, so the two
credentials can never be used interchangeably.

### 2.3 Refresh-token format

The refresh token is **not a JWT**. It is an opaque, high-entropy random string
(`secrets.token_urlsafe(48)` → 64 URL-safe characters) with no readable structure. It is
validated by looking its hash up in the `refresh_tokens` table, so a signature would buy
nothing and a self-describing token would only leak the user id and issue time to whoever
obtained it.

- The raw value is handed to the caller **exactly once**, as a `Set-Cookie` header, and is
  never persisted. Only a SHA-256 digest of it is stored.
- It never appears in any response body.
- It is validated on **every** use against three independent conditions: the row exists,
  `expires_at` is in the future, and `revoked_at` is null.

### 2.4 How 401s are produced

`get_current_user` (`app/api/deps.py`) raises a single `401` for every failure mode, with
`WWW-Authenticate: Bearer`:

- no `Authorization` header, or a non-Bearer scheme (`HTTPBearer(auto_error=False)`)
- signature invalid, expired, wrong/missing `iss`/`aud`/`sub`/`exp`/`iat`, `alg: none`
- `typ` missing or not `"access"`
- `sub` is not a parseable UUID
- `sub` parses but no user row exists

All of these return exactly:

```json
{ "detail": "Not authenticated" }
```

There is deliberately no distinction between "malformed token" and "unknown user".
`403` is returned by exactly one thing in this API — the missing-CSRF-header check on the
two refresh-cookie endpoints (§2.7) — and never by the auth dependency.

`POST /auth/refresh` produces its own, separate `401` with a different body; see §3.2.

### 2.5 Obtaining and maintaining a session

Four endpoints mint access tokens: `POST /auth/signup`, `POST /auth/login`,
`POST /auth/oauth/google` and `POST /auth/refresh`. The first three additionally set the
refresh cookie; `/auth/refresh` does not (it does not rotate — see §2.6).

```bash
BASE=http://localhost:8000

# Login: access token in the body, refresh token in the cookie jar.
TOKEN=$(curl -sS -c cookies.txt -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"dana.reyes@example.com","password":"correct-horse-9"}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -sS "$BASE/auth/me" -H "Authorization: Bearer $TOKEN"

# 30 minutes later: swap the cookie for a fresh access token.
TOKEN=$(curl -sS -b cookies.txt -X POST "$BASE/auth/refresh" \
  -H 'X-Refresh-Request: 1' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

# End the session for good.
curl -sS -i -b cookies.txt -X POST "$BASE/auth/logout" -H 'X-Refresh-Request: 1'
```

The expected client lifecycle:

1. **On app boot**, call `POST /auth/refresh` before deciding the user is logged out. The
   access token lives in memory and does not survive a page reload; the cookie does.
2. **On any `401`** from an authenticated call, attempt exactly **one** silent refresh and
   retry the original request. If the refresh also fails, clear state and route to login.
3. **Share in-flight refreshes.** Several concurrent `401`s must not each fire their own
   refresh call.
4. **On logout**, call `POST /auth/logout` and discard the in-memory access token.

### 2.6 Accepted trade-off: no refresh-token rotation

This section replaces V1 §2.5 ("Lifecycle gaps"), which documented the absence of logout.
Logout now exists. What remains deliberately absent, and is recorded here so it is not
rediscovered later as a defect:

- **No rotation.** A refresh token is static from issue until expiry or explicit
  revocation. `POST /auth/refresh` returns a new *access* token and leaves the cookie
  untouched.
- **No reuse detection and no token families.** Presenting the same refresh token twice is
  normal and expected, so there is no signal to detect theft from.
- **No "log out all devices", no session listing, no introspection endpoint.** Logout is
  single-session: it revokes the token presented on that request and no other.
- **Access tokens are not individually revocable.** A leaked access token stays valid for
  up to 30 minutes. Shortening that window from V1's seven days is the mitigation; the
  `jti` claim is the hook a denylist would use if that ever stops being enough.

The consequence, accepted knowingly: **a stolen refresh token is usable until it expires
(14 days) or the user logs out.** The prerequisite for improving this is rotation with
reuse detection, which was scoped and declined for V2.

### 2.7 CSRF protection on the refresh endpoints

The refresh cookie is `SameSite=None` (see §9.3 for why), which means the browser **does**
attach it to cross-site requests. Both endpoints that read it therefore require a custom
request header:

```
X-Refresh-Request: 1
```

Any value is accepted; only presence is checked. A request to `POST /auth/refresh` or
`POST /auth/logout` without the header returns:

```
403 Forbidden
{ "detail": "This endpoint requires the 'X-Refresh-Request' header." }
```

This is the standard custom-header CSRF defense. A cross-origin page cannot set an
arbitrary request header without triggering a CORS preflight, and the strict origin
allowlist (§9.3) refuses the preflight for any origin not explicitly configured. The two
mechanisms are load-bearing together — neither is sufficient alone.

**No other endpoint requires this header.** Everything else authenticates with an
`Authorization: Bearer` header, which a cross-site page has no way to attach, so there is
no ambient credential to abuse there.

The header check runs **before** logout's idempotency: a headerless logout is a `403`, not
a silent `204`. Idempotency is a statement about token state ("logging out twice is not an
error"), not permission to honour unauthenticated cross-site calls.

Non-browser clients (curl, integration tests, a future CLI) must send the header
explicitly.

### 2.8 Google OAuth path

`POST /auth/oauth/google` accepts a **Google-issued ID token** (the credential produced by
Google Identity Services in the browser), not an authorization code and not an access
token. The server verifies it with `google-auth` against `GOOGLE_CLIENT_ID` and then:

1. requires `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`};
2. requires both `sub` and `email` claims;
3. **requires `email_verified == true`** — an unverified address is rejected before any
   account lookup, because step 5 below treats the address as proof of identity;
4. looks up an existing user by Google `sub` → returns it;
5. otherwise looks up an existing user by email → links `google_id` onto that account;
6. otherwise creates a new OAuth-only user (`hashed_password` is null).

An OAuth-only user cannot subsequently log in through `/auth/login` (there is no password
hash, and that path returns `401` after burning an equivalent bcrypt comparison so timing
does not leak account existence). There is no endpoint to set a password on such an
account.

If `GOOGLE_CLIENT_ID` is unset, every call to this endpoint returns `401`.

**Changed in V2:** on success this endpoint now also sets the refresh cookie.

---

## 3. Endpoint reference

Complete inventory — **17 operations** (15 in V1, plus `/auth/refresh` and `/auth/logout`):

| Method | Path | Auth | Rate limited | CSRF header |
|---|---|---|---|---|
| `GET` | `/health` | no | no | no |
| `POST` | `/auth/signup` | no | 3/hour | no |
| `POST` | `/auth/login` | no | 5/minute | no |
| `POST` | `/auth/oauth/google` | no | 10/minute | no |
| `POST` | `/auth/refresh` | refresh cookie | 30/minute | **yes** |
| `POST` | `/auth/logout` | refresh cookie (optional) | no | **yes** |
| `GET` | `/auth/me` | **yes** | no | no |
| `GET` | `/applications` | **yes** | no | no |
| `POST` | `/applications` | **yes** | no | no |
| `POST` | `/applications/autofill` | **yes** | 10/minute | no |
| `GET` | `/applications/{app_id}` | **yes** | no | no |
| `PATCH` | `/applications/{app_id}` | **yes** | no | no |
| `DELETE` | `/applications/{app_id}` | **yes** | no | no |
| `GET` | `/settings` | **yes** | no | no |
| `PATCH` | `/settings` | **yes** | no | no |
| `GET` | `/dashboard/stats` | **yes** | no | no |
| `GET` | `/dashboard/recap` | **yes** | no | no |

"Auth: **yes**" means an `Authorization: Bearer <access_token>` header is required.

Every authenticated endpoint can additionally return `401` (see §2.4); every
body-taking endpoint can additionally return `413` (see §9.1) and `422` (see §7).
Those are not repeated in each endpoint's table below unless the trigger is
endpoint-specific.

---

### 3.1 Health

#### `GET /health`

Liveness probe. No auth, no rate limit, no parameters.

| Status | Body |
|---|---|
| `200` | `{"status": "ok"}` |

```bash
curl -sS -i http://localhost:8000/health
```

```json
{ "status": "ok" }
```

Note: this only proves the process is accepting requests. It does **not** touch the
database — it is not a readiness check.

---

### 3.2 Auth

#### `POST /auth/signup`

Create an email/password account, return an access token and set the refresh cookie.
Rate limit **3/hour per client IP**.

Request body — [`SignupRequest`](#61-signuprequest):

| Field | Type | Required | Constraints |
|---|---|---|---|
| `email` | string | yes | RFC-valid email (`EmailStr`); stored lower-cased |
| `password` | string | yes | 8–256 characters |

> bcrypt truncates the password to its first 72 **bytes** when hashing. Characters beyond
> that do not contribute to the hash. This is silent, not an error.

| Status | Trigger | Body |
|---|---|---|
| `201` | Created | [`TokenResponse`](#63-tokenresponse) + `Set-Cookie` |
| `409` | Email already registered | `{"detail": "An account with this email already exists."}` |
| `422` | Validation failure | Validation-error list (§7.2) |
| `429` | Over 3/hour | `{"error": "Rate limit exceeded: 3 per 1 hour"}` |

**Changed in V2:** a successful response additionally carries

```
Set-Cookie: jtracks_refresh=<opaque>; HttpOnly; Max-Age=1209600; Path=/auth; SameSite=none; Secure
```

The JSON body is unchanged — it still contains only the access token, never the refresh
token.

```bash
curl -sS -X POST http://localhost:8000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"dana.reyes@example.com","password":"correct-horse-9"}'
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwYjU3NDY1OC04NGMyLTQ5YWItODA0Ni1iNjFiNThiODNjNTYiLCJpYXQiOjE3ODY0MTQyODAsImV4cCI6MTc4NjQxNjA4MCwiaXNzIjoianRyYWNrcyIsImF1ZCI6Imp0cmFja3MtYXBpIiwianRpIjoiNjE1OWIwY2VkN2U0NGZmY2JjYjViZjJhYjAxOGM4MjQiLCJ0eXAiOiJhY2Nlc3MifQ.0IP0q1CvxP1EikEFVoeiB2VzDnsZUPKuOj7DWnaRitc",
  "token_type": "bearer"
}
```

`409` example:

```json
{ "detail": "An account with this email already exists." }
```

#### `POST /auth/login`

Exchange email/password for an access token and a refresh cookie.
Rate limit **5/minute per client IP**.

Request body — [`LoginRequest`](#62-loginrequest):

| Field | Type | Required | Constraints |
|---|---|---|---|
| `email` | string | yes | RFC-valid email; matched case-insensitively |
| `password` | string | yes | 1–256 characters |

| Status | Trigger | Body |
|---|---|---|
| `200` | Authenticated | [`TokenResponse`](#63-tokenresponse) + `Set-Cookie` |
| `401` | Wrong password, unknown email, **or** an OAuth-only account with no password | `{"detail": "Incorrect email or password."}` |
| `422` | Validation failure | Validation-error list (§7.2) |
| `429` | Over 5/minute | `{"error": "Rate limit exceeded: 5 per 1 minute"}` |

All three `401` causes are indistinguishable in both body and response time (the
"no such user" and "OAuth-only" paths deliberately burn an equivalent bcrypt comparison),
so this endpoint cannot be used to enumerate registered addresses.

**Changed in V2:** additionally sets the refresh cookie. Each login issues a *new* refresh
token; existing tokens for the same user are untouched, so two browsers can hold
independent sessions and logging out of one does not end the other.

```bash
curl -sS -c cookies.txt -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dana.reyes@example.com","password":"correct-horse-9"}'
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<payload>.<signature>",
  "token_type": "bearer"
}
```

#### `POST /auth/oauth/google`

Exchange a Google ID token for a jTracks session. Rate limit **10/minute per client IP**.
Semantics in §2.8.

Request body — [`GoogleOAuthRequest`](#64-googleoauthrequest):

| Field | Type | Required | Constraints |
|---|---|---|---|
| `id_token` | string | yes | min length 1. The Google **ID token** (JWT) from Google Identity Services |

| Status | Trigger | Body |
|---|---|---|
| `200` | Verified; user found, linked or created | [`TokenResponse`](#63-tokenresponse) + `Set-Cookie` |
| `401` | Signature/audience/issuer invalid, expired, missing `sub`/`email`, `email_verified` false, **or** `GOOGLE_CLIENT_ID` unset | `{"detail": "Invalid Google credential."}` |
| `422` | Missing/empty `id_token` | Validation-error list (§7.2) |
| `429` | Over 10/minute | `{"error": "Rate limit exceeded: 10 per 1 minute"}` |

Note the status: a **new account created via Google returns `200`, not `201`**, unlike
`/auth/signup`.

**Changed in V2:** additionally sets the refresh cookie.

```bash
curl -sS -c cookies.txt -X POST http://localhost:8000/auth/oauth/google \
  -H 'Content-Type: application/json' \
  -d '{"id_token":"eyJhbGciOiJSUzI1NiIsImtpZCI6IjkzNDFhYmM0In0.<payload>.SIGNATURE"}'
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<payload>.<signature>",
  "token_type": "bearer"
}
```

#### `POST /auth/refresh`

**New in V2.** Exchange a valid refresh cookie for a fresh access token.

Auth: the **refresh cookie**, not a Bearer token. An `Authorization` header on this request
is ignored.
CSRF: `X-Refresh-Request` header **required** (§2.7).
Rate limit **30/minute per client IP** (`RATE_LIMIT_REFRESH`).

No request body and no parameters.

| Status | Trigger | Body |
|---|---|---|
| `200` | Cookie present, known, unexpired and unrevoked | [`TokenResponse`](#63-tokenresponse) |
| `401` | **Any** validation failure | `{"detail": "Invalid or expired session."}` |
| `403` | Missing `X-Refresh-Request` header | `{"detail": "This endpoint requires the 'X-Refresh-Request' header."}` |
| `429` | Over 30/minute | `{"error": "Rate limit exceeded: 30 per 1 minute"}` |

Every `401` cause returns the **same status and the same message** — no cookie at all, a
cookie whose hash matches no row, an expired token, a revoked token, and an access token
replayed in the cookie slot are all indistinguishable. This is deliberate: a
differentiated response would tell an attacker whether a given token value ever existed.

**The refresh token is not rotated.** The response carries no `Set-Cookie`; the same
cookie remains valid for its full lifetime and can be exchanged any number of times
(§2.6).

```bash
curl -sS -b cookies.txt -X POST http://localhost:8000/auth/refresh \
  -H 'X-Refresh-Request: 1'
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<payload>.<signature>",
  "token_type": "bearer"
}
```

Failure:

```json
{ "detail": "Invalid or expired session." }
```

#### `POST /auth/logout`

**New in V2.** Revoke the presented refresh token and clear the cookie.

Auth: the **refresh cookie**, and it is optional — see below.
CSRF: `X-Refresh-Request` header **required** (§2.7).
Not rate limited.

No request body and no parameters.

| Status | Trigger | Body |
|---|---|---|
| `204` | **Always**, when the CSRF header is present | *(empty)* + `Set-Cookie` clearing the cookie |
| `403` | Missing `X-Refresh-Request` header | `{"detail": "This endpoint requires the 'X-Refresh-Request' header."}` |

**Idempotent by contract.** `204` is returned whether the cookie is present, absent,
malformed, unknown, already revoked or expired. There is no failure response and no way to
use this endpoint to learn whether a token exists.

Effects:

- If the cookie names a live token, its `revoked_at` is stamped. Replaying that exact
  cookie value at `/auth/refresh` afterwards returns `401`.
- The cookie is cleared **unconditionally**, including on the no-cookie path, so a stale
  cookie the server has no row for is still removed from the browser.
- Only the presented session is revoked. Other sessions for the same user survive (§2.6).

The clearing header repeats the identical attributes the cookie was set with — a deletion
that omits `Path`/`SameSite`/`Secure` targets a *different* cookie and the browser keeps
the original:

```
Set-Cookie: jtracks_refresh=""; expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Max-Age=0; Path=/auth; SameSite=none; Secure
```

```bash
curl -sS -i -b cookies.txt -X POST http://localhost:8000/auth/logout \
  -H 'X-Refresh-Request: 1'
```

```
HTTP/1.1 204 No Content
set-cookie: jtracks_refresh=""; expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Max-Age=0; Path=/auth; SameSite=none; Secure
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: no-referrer
content-security-policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'
```

#### `GET /auth/me`

Return the authenticated user's public profile. Unchanged from V1.

Auth: **required**. No parameters, no body.

| Status | Trigger | Body |
|---|---|---|
| `200` | OK | [`UserPublic`](#65-userpublic) |
| `401` | Missing/invalid token (§2.4) | `{"detail": "Not authenticated"}` |

```bash
curl -sS http://localhost:8000/auth/me -H "Authorization: Bearer $TOKEN"
```

```json
{
  "id": "0b574658-84c2-49ab-8046-b61b58b83c56",
  "email": "dana.reyes@example.com",
  "google_id": null,
  "ghost_days_default": 14
}
```

> `UserPublic` does **not** include `created_at`, despite the `users` table having it.

---

### 3.3 Applications

All application routes are scoped to the authenticated user. A row belonging to another
user is indistinguishable from a row that does not exist: `GET`/`PATCH`/`DELETE`
`/applications/{app_id}` both return `404`, never `403`, and never leak the data.

#### `GET /applications`

List the caller's applications, newest first.

Auth: **required**.

Query parameters:

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `status` | [`ApplicationStatus`](#68-applicationstatus-enum) | no | (unset = no filter) | Exact match. An unrecognized value is `422`. |

**Changed in V2:** `status` now takes one of **seven** values. `status=interviewing` is no
longer valid and returns `422` — the value was renamed to `interviewing_oa` and there is
no alias.

Ordering: `created_at` **descending**. **There is no pagination** — no `limit`, `offset`,
`page` or `cursor`. The full result set is returned in one array. No sort parameter.

| Status | Trigger | Body |
|---|---|---|
| `200` | OK | Array of [`ApplicationResponse`](#67-applicationresponse) (`[]` when empty) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `422` | `status` not a valid enum member | Validation-error list (§7.2) |

```bash
curl -sS "http://localhost:8000/applications?status=interviewing_oa" \
  -H "Authorization: Bearer $TOKEN"
```

```json
[
  {
    "company": "Northwind Robotics",
    "title": "Senior Backend Engineer",
    "job_url": "https://boards.greenhouse.io/northwind/jobs/4188322",
    "location": "Remote - US",
    "salary": "USD 165,000 - 195,000",
    "date_posted": "2026-07-28",
    "date_saved": null,
    "date_applied": "2026-08-03",
    "ghost_days_override": null,
    "notes": "Referred by Priya. Recruiter screen scheduled.",
    "id": "11af898b-640f-4a0f-8fe9-be3f1e385451",
    "user_id": "0b574658-84c2-49ab-8046-b61b58b83c56",
    "status": "interviewing_oa",
    "created_at": "2026-08-03T14:22:09",
    "updated_at": "2026-08-03T14:22:09"
  }
]
```

> The V2 "staleness nudge" (an `interviewing_oa` row untouched for 28 days is flagged on
> the board) is computed **client-side** from the `updated_at` returned here. There is no
> field, no query parameter and no endpoint for it, by design.

#### `POST /applications`

Create an application.

Auth: **required**.

Request body — [`ApplicationCreate`](#66-applicationcreate). Unknown fields are **silently
ignored** on this endpoint (unlike `PATCH`, which rejects them).

Server-applied defaults, in `application_service.create_application`:

- `status` defaults to `"saved"` if omitted.
- If the resulting `status` is `"applied"` and `date_applied` was not supplied,
  `date_applied` is set to **today in UTC**.
- If the resulting `status` is `"saved"` and `date_saved` was not supplied, `date_saved`
  is set to today in UTC.
- No other status gets a date defaulted.

All server-derived dates come from `app/core/clock.utc_today()`, never the host's local
calendar, so they are on the same calendar as the `created_at`/`updated_at` timestamps.
A client in a non-UTC timezone should expect a defaulted date to be the UTC date, which
near midnight may not be the user's local date — send `date_applied`/`date_saved`
explicitly if the user's own calendar day matters.

**Transition rules are not enforced on create.** Any `ApplicationStatus` value is accepted
directly — including creating a row straight as `"ghosted"`, `"failed"` or `"offer"` with
no `date_applied`. (Confirmed against the running app.)

| Status | Trigger | Body |
|---|---|---|
| `201` | Created | [`ApplicationResponse`](#67-applicationresponse) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `413` | Body > 1 MiB | `{"detail": "Request body too large."}` |
| `422` | Validation failure (missing `company`/`title`, `notes` > 10 000 chars, bad enum incl. `interviewing`, bad date, …) | Validation-error list (§7.2) |

```bash
curl -sS -X POST http://localhost:8000/applications \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "company": "Northwind Robotics",
        "title": "Senior Backend Engineer",
        "job_url": "https://boards.greenhouse.io/northwind/jobs/4188322",
        "location": "Remote - US",
        "salary": "USD 165,000 - 195,000",
        "date_posted": "2026-07-28",
        "notes": "Referred by Priya."
      }'
```

```json
{
  "company": "Northwind Robotics",
  "title": "Senior Backend Engineer",
  "job_url": "https://boards.greenhouse.io/northwind/jobs/4188322",
  "location": "Remote - US",
  "salary": "USD 165,000 - 195,000",
  "date_posted": "2026-07-28",
  "date_saved": "2026-08-21",
  "date_applied": null,
  "ghost_days_override": null,
  "notes": "Referred by Priya.",
  "id": "11af898b-640f-4a0f-8fe9-be3f1e385451",
  "user_id": "0b574658-84c2-49ab-8046-b61b58b83c56",
  "status": "saved",
  "created_at": "2026-08-21T02:11:21",
  "updated_at": "2026-08-21T02:11:21"
}
```

#### `GET /applications/{app_id}`

Fetch one application owned by the caller. Unchanged from V1.

Auth: **required**.

Path parameters:

| Name | Type | Constraints |
|---|---|---|
| `app_id` | UUID | Must parse as a UUID; a non-UUID string is `422`, not `404` |

| Status | Trigger | Body |
|---|---|---|
| `200` | OK | [`ApplicationResponse`](#67-applicationresponse) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `404` | No such row, **or** the row belongs to a different user | `{"detail": "Application not found"}` |
| `422` | `app_id` is not a valid UUID | Validation-error list (§7.2) |

```bash
curl -sS http://localhost:8000/applications/11af898b-640f-4a0f-8fe9-be3f1e385451 \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "company": "Northwind Robotics",
  "title": "Senior Backend Engineer",
  "job_url": "https://boards.greenhouse.io/northwind/jobs/4188322",
  "location": "Remote - US",
  "salary": "USD 165,000 - 195,000",
  "date_posted": "2026-07-28",
  "date_saved": "2026-08-21",
  "date_applied": null,
  "ghost_days_override": null,
  "notes": "Referred by Priya.",
  "id": "11af898b-640f-4a0f-8fe9-be3f1e385451",
  "user_id": "0b574658-84c2-49ab-8046-b61b58b83c56",
  "status": "saved",
  "created_at": "2026-08-21T02:11:21",
  "updated_at": "2026-08-21T02:11:21"
}
```

#### `PATCH /applications/{app_id}`

Partially update an application. Only the keys present in the body are applied
(`model_dump(exclude_unset=True)`), so `{}` is a valid no-op update.

Auth: **required**.

Path parameters: `app_id` (UUID), as above.

Request body — [`ApplicationUpdate`](#69-applicationupdate). **Extra fields are rejected**
(`extra="forbid"` → `422` with `"type": "extra_forbidden"`). Explicitly sending `null` for
a nullable field clears it.

Status-change behavior:

- If `status` is present and non-null, the transition is validated against the **V2**
  matrix in [§6.10](#610-allowed-status-transitions).
- If the new status is `applied` and the row will not have a `date_applied` afterwards,
  the server sets `date_applied` to today **before** validating, so `saved → applied`
  never fails for a missing date.
- A same-value status (e.g. `applied → applied`) is always allowed.

**Changed in V2:** the transition matrix now covers seven statuses.
`status=interviewing` is a `422` (invalid enum value), not a `400`.

| Status | Trigger | Body |
|---|---|---|
| `200` | Updated | [`ApplicationResponse`](#67-applicationresponse) |
| `400` | Disallowed status transition | `{"detail": "Cannot move an application from 'saved' to 'offer'."}` |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `404` | No such row, or not the caller's | `{"detail": "Application not found"}` |
| `413` | Body > 1 MiB | `{"detail": "Request body too large."}` |
| `422` | Validation failure, incl. an unknown field or an unknown status value | Validation-error list (§7.2) |

> Note the distinction, which V2 preserves: a **valid status in an illegal position** is a
> `400`; an **invalid status value** is a `422`. `{"status":"ghosted"}` on an `offer` row
> is a `400`. `{"status":"interviewing"}` on anything is a `422`.

```bash
curl -sS -X PATCH http://localhost:8000/applications/11af898b-640f-4a0f-8fe9-be3f1e385451 \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"applied","ghost_days_override":21}'
```

```json
{
  "company": "Northwind Robotics",
  "title": "Senior Backend Engineer",
  "job_url": "https://boards.greenhouse.io/northwind/jobs/4188322",
  "location": "Remote - US",
  "salary": "USD 165,000 - 195,000",
  "date_posted": "2026-07-28",
  "date_saved": "2026-08-21",
  "date_applied": "2026-08-21",
  "ghost_days_override": 21,
  "notes": "Referred by Priya.",
  "id": "11af898b-640f-4a0f-8fe9-be3f1e385451",
  "user_id": "0b574658-84c2-49ab-8046-b61b58b83c56",
  "status": "applied",
  "created_at": "2026-08-21T02:11:21",
  "updated_at": "2026-08-21T02:14:03"
}
```

Rejected-transition example:

```bash
curl -sS -X PATCH http://localhost:8000/applications/11af898b-640f-4a0f-8fe9-be3f1e385451 \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"offer"}'
```

```json
{ "detail": "Cannot move an application from 'saved' to 'offer'." }
```

#### `DELETE /applications/{app_id}`

Hard-delete an application. Not reversible; there is no soft-delete or archive. Unchanged
from V1.

Auth: **required**.

| Status | Trigger | Body |
|---|---|---|
| `204` | Deleted | *(empty)* |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `404` | No such row, or not the caller's | `{"detail": "Application not found"}` |
| `422` | `app_id` is not a valid UUID | Validation-error list (§7.2) |

A deleted row disappears from every dashboard figure, every rate and the Sankey
immediately, regardless of the status it held. There is no tombstone.

```bash
curl -sS -i -X DELETE http://localhost:8000/applications/11af898b-640f-4a0f-8fe9-be3f1e385451 \
  -H "Authorization: Bearer $TOKEN"
```

```
HTTP/1.1 204 No Content
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: no-referrer
content-security-policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'
```

---

### 3.4 Autofill

**Unchanged in V2.** Documented here in full so this specification stands alone.

#### `POST /applications/autofill`

Given a pasted job-posting URL, attempt to extract structured fields. Intended to
pre-populate a create form; **it does not create anything** — nothing is written to the
database by this call.

Auth: **required**. Rate limit **10/minute per client IP**.

Request body — [`AutofillRequest`](#611-autofillrequest):

| Field | Type | Required | Constraints |
|---|---|---|---|
| `url` | string | yes | 1–2048 characters. Not validated as a URL by pydantic; leading/trailing whitespace is stripped server-side |

**This endpoint always returns `200` on a well-formed request.** Parse failure, timeout,
blocked host, unsupported domain, HTTP error from the job board, oversized upstream
response and unexpected parser exceptions all surface as a structured `200` body with a
`status` discriminator — never a `4xx`/`5xx`. The handler is written specifically so a
client never has to distinguish "the API broke" from "we couldn't read that posting".

| Status | Trigger | Body |
|---|---|---|
| `200` | Any well-formed request | One of `AutofillParsed` \| `AutofillUnsupported` \| `AutofillFailed` |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `413` | Body > 1 MiB | `{"detail": "Request body too large."}` |
| `422` | `url` missing, empty, or > 2048 chars | Validation-error list (§7.2) |
| `429` | Over 10/minute | `{"error": "Rate limit exceeded: 10 per 1 minute"}` |

> Gotcha: this path is only registered for `POST`. Because `/applications/{app_id}` is
> registered for `GET`/`PATCH`/`DELETE`, a `GET /applications/autofill` does **not** return
> `405` — it matches the dynamic route and returns `422` with
> `"type": "uuid_parsing"` on `loc: ["path", "app_id"]`.

##### Result discriminator

Switch on the `status` string:

| `status` | Meaning | Shape |
|---|---|---|
| `"parsed"` | A supported provider was recognized and fields were extracted | [`AutofillParsed`](#612-autofillparsed) |
| `"unsupported"` | The hostname matches no supported provider — nothing was fetched | [`AutofillUnsupported`](#613-autofillunsupported) |
| `"failed"` | A supported provider was recognized, but extraction did not succeed | [`AutofillFailed`](#614-autofillfailed) |

`unsupported` and `failed` both echo the (whitespace-stripped) original `url` so the client
can drop the user straight into a manual-entry form with the link pre-filled. Note the
asymmetry: `parsed` has **no** top-level `url` — the URL lives at `fields.job_url`.

##### Supported providers and the allowed-domain restriction

Provider selection is by **hostname only** (the pasted scheme and path do not affect
routing). A host matches a provider when it equals the domain or is a **true subdomain**
of it (dot boundary required — `evilgreenhouse.io` does not match `greenhouse.io`, and
`greenhouse.io.evil.com` does not match either). A trailing dot is tolerated.

| Provider | `source` value | Matching domain | Upstream fetched |
|---|---|---|---|
| Greenhouse | `"greenhouse"` | `greenhouse.io` and true subdomains (`boards.greenhouse.io`, `job-boards.greenhouse.io`, …) | `https://boards-api.greenhouse.io/v1/boards/{token}/jobs/{job_id}?questions=false`, derived from the `/{token}/jobs/{numeric_id}` path segment |
| Workday | `"workday"` | `myworkdayjobs.com` and true subdomains (`globex.wd1.myworkdayjobs.com`, …) | `https://{host}/wday/cxs/{tenant}/{site}/job/{path}` (the CXS JSON endpoint), derived from the posting path with an optional leading locale segment (`en-US`) dropped |

Anything else — LinkedIn, Glassdoor, a company careers page, a non-URL string — returns
`unsupported` **without any outbound request being made**.

##### Outbound request guarantees (SSRF and resource bounds)

Every outbound request the autofill client makes is checked at the transport layer:

- **Scheme must be `https`.** Outbound URLs are constructed with a hardcoded `https`
  scheme; the user's scheme is never echoed.
- **Host must be on the allowlist** (`greenhouse.io`, `myworkdayjobs.com`, exact or true
  subdomain), judged on the parsed hostname so userinfo (`https://evil.com@host/`) and
  port cannot smuggle a different target.
- **Every resolved address must be publicly routable.** All `getaddrinfo` answers are
  checked; private, loopback, link-local (incl. `169.254.169.254`), reserved, multicast,
  unspecified and IPv4-mapped-IPv6 equivalents are refused.
- **Redirects are not followed** (`follow_redirects=False`). A job board that 302s simply
  fails to autofill.
- **Timeout**: `AUTOFILL_TIMEOUT_SECONDS`, default **8.0 s**.
- **Bounded response**: `AUTOFILL_MAX_RESPONSE_BYTES`, default **2 MiB**. Enforced against
  both the declared `Content-Length` *and* bytes actually received; the response is
  streamed and the connection torn down at the ceiling. Over the limit → treated as no
  data → `failed`.
- **Content type must be JSON** (`application/json`, `text/json`, or `*+json`). Anything
  else (e.g. an HTML error page) is discarded → `failed`.
- Upstream non-`200` → discarded → `failed`.
- `User-Agent` is `AUTOFILL_USER_AGENT`.

##### `failed.reason` values

`reason` is a nullable free-form string; the dispatcher currently emits exactly these:

| `reason` | Cause |
|---|---|
| `"no_data"` | The parser ran and returned nothing usable — upstream non-200, non-JSON, oversized, unparseable JSON, missing `title`, or an un-derivable API/CXS URL |
| `"blocked_host"` | The SSRF guard refused the outbound request |
| `"parser_error"` | `httpx.HTTPError`, `ValueError`, `KeyError` or `TypeError` during parse (timeout, connection error, bad structure) |
| `"unexpected_error"` | Any other exception, caught defensively so the endpoint never 500s |

Treat this as an open set: match on `status` and use `reason` for logging/diagnostics only.

##### Examples

Parsed (Greenhouse):

```bash
curl -sS -X POST http://localhost:8000/applications/autofill \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://boards.greenhouse.io/northwind/jobs/4188322"}'
```

```json
{
  "status": "parsed",
  "source": "greenhouse",
  "fields": {
    "company": "Northwind Robotics",
    "title": "Senior Backend Engineer",
    "location": "Remote - US",
    "salary": "USD 165,000 - 195,000",
    "date_posted": "2026-07-28",
    "job_url": "https://boards.greenhouse.io/northwind/jobs/4188322",
    "suggested_status": "applied"
  }
}
```

Parsed (Workday) — note multiple locations are de-duplicated and joined with `"; "`, and
Workday CXS rarely exposes compensation so `salary` is effectively always `null`:

```bash
curl -sS -X POST http://localhost:8000/applications/autofill \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://globex.wd1.myworkdayjobs.com/en-US/External/job/Austin/Staff-Data-Engineer_JR-10432"}'
```

```json
{
  "status": "parsed",
  "source": "workday",
  "fields": {
    "company": "Globex Corporation",
    "title": "Staff Data Engineer",
    "location": "Austin, TX; Remote, USA",
    "salary": null,
    "date_posted": "2026-07-20",
    "job_url": "https://globex.wd1.myworkdayjobs.com/en-US/External/job/Austin/Staff-Data-Engineer_JR-10432",
    "suggested_status": "applied"
  }
}
```

Unsupported domain:

```json
{
  "status": "unsupported",
  "url": "https://www.linkedin.com/jobs/view/3901234567"
}
```

Failed parse of a supported provider (**`200`, not an error status**):

```json
{
  "status": "failed",
  "url": "https://boards.greenhouse.io/northwind/jobs/9999999",
  "reason": "no_data"
}
```

##### Suggested follow-up

`fields.suggested_status` is **always** `"applied"` (it is the schema default and no parser
overrides it). Per the product spec, a successfully parsed link is assumed to be one the
user is applying to now; the client is expected to `POST /applications` with
`status: "applied"`, at which point the server defaults `date_applied` to today.

---

### 3.5 Settings

**Unchanged in V2.** The only user-level setting is the global ghosting threshold.

#### `GET /settings`

Auth: **required**. No parameters.

| Status | Trigger | Body |
|---|---|---|
| `200` | OK | [`SettingsResponse`](#615-settingsresponse) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |

```bash
curl -sS http://localhost:8000/settings -H "Authorization: Bearer $TOKEN"
```

```json
{ "ghost_days_default": 14 }
```

#### `PATCH /settings`

Auth: **required**.

Request body — [`SettingsUpdate`](#616-settingsupdate):

| Field | Type | Required | Constraints |
|---|---|---|---|
| `ghost_days_default` | integer | **yes** | 1 ≤ n ≤ 365 |

Despite the `PATCH` verb, `ghost_days_default` is **required** — this is effectively a
full replacement of a one-field resource. An empty body is `422`.

| Status | Trigger | Body |
|---|---|---|
| `200` | Updated | [`SettingsResponse`](#615-settingsresponse) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `413` | Body > 1 MiB | `{"detail": "Request body too large."}` |
| `422` | Missing field, or out of the 1–365 range | Validation-error list (§7.2) |

Changing this value does **not** retroactively re-evaluate existing applications; the daily
ghosting sweep picks it up on its next run. Per-application overrides
(`ghost_days_override`) take precedence over it.

> This setting has **no effect on `interviewing_oa` rows in V2** — the ghosting sweep no
> longer considers them at all (§4). It governs `applied` rows only.

```bash
curl -sS -X PATCH http://localhost:8000/settings \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"ghost_days_default":21}'
```

```json
{ "ghost_days_default": 21 }
```

---

### 3.6 Dashboard

Both dashboard endpoints consider only **submitted** applications — rows with a non-null
`date_applied`. Rows still in `saved` with no `date_applied` are excluded from `total`,
from the breakdown, from every rate and from the Sankey.

Both endpoints accept the **same** range parameters (**changed in V2** — V1's stats took
`week|month|all` and the recap took `week|month` only), and both return a **`sankey`
object** (**new in V2**).

#### Shared range parameters

| Name | Type | Required | Default (stats) | Default (recap) | Allowed values |
|---|---|---|---|---|---|
| `range` | string enum | no | `"all"` | `"week"` | `week`, `month`, `year`, `all`, `custom` |
| `start` | date (`YYYY-MM-DD`) | only when `range=custom` | — | — | Inclusive lower bound |
| `end` | date (`YYYY-MM-DD`) | only when `range=custom` | — | — | Inclusive upper bound |

`start` and `end` are **ignored** for every preset range; they are not an error there.

Window semantics (`today` = the current date in **UTC**; every boundary comes from
`app/core/clock.py`):

| `range` | Window | Time-series buckets | `time_series_granularity` |
|---|---|---|---|
| `week` | `today - 6 days` … `today` (7 days inclusive) | Daily, **zero-filled** → always exactly **7** points; `period` is an ISO date | `"day"` |
| `month` | `today - 29 days` … `today` (30 days inclusive) | Daily, zero-filled → always exactly **30** points | `"day"` |
| `year` | First day of the month 11 months back … `today` (a trailing 12 calendar months) | Monthly, zero-filled → always exactly **12** points; `period` is `"YYYY-MM"` | `"month"` |
| `all` | Unbounded below, `today` above | Monthly, **only months that have data** (not zero-filled) | `"month"` |
| `custom` | `start` … `end`, both inclusive | Daily zero-filled when the inclusive span is **≤ 92 days**; monthly zero-filled (every calendar month the span touches) when it is **> 92 days** | `"day"` or `"month"` |

> **On `year`.** It is a trailing **12 calendar months**, not a flat 365 days. 365 days
> always straddles 13 calendar months, so a flat window would put some in-range
> applications in a month that has no bucket — they would be counted in `total` but vanish
> from `applications_over_time`. Aligning the window to the month boundary keeps the series
> summing to `total` and yields exactly 12 points. It is also consistent with `week` and
> `month`, which are likewise rolling windows rather than calendar-to-date ones.

Custom-range validation (all failures are `422`):

| Rule | Message |
|---|---|
| Both `start` and `end` present | `` `start` and `end` are both required when range=custom. `` |
| `start <= end` | `` `start` must be on or before `end`. `` |
| Inclusive span `(end - start).days + 1` between **1 and 366** | `A custom range must span between 1 and 366 days inclusive (got N).` |

The 366 cap accommodates a full leap year. Note the span is **inclusive**, so
`start=2025-01-01&end=2026-01-01` is 366 days (valid) and `end=2026-01-02` is 367
(rejected).

These are model-level validations, so `loc` is `["query"]` with no field name — see §7.2.

#### `GET /dashboard/stats`

Auth: **required**. Not rate limited.

| Status | Trigger | Body |
|---|---|---|
| `200` | OK | [`DashboardStats`](#617-dashboardstats) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `422` | `range` not in the enum, or a custom range failing the rules above | Validation-error list (§7.2) |

```bash
curl -sS "http://localhost:8000/dashboard/stats?range=week" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "range": "week",
  "total": 6,
  "status_breakdown": [
    { "status": "applied",         "count": 2, "percentage": 33.3 },
    { "status": "interviewing_oa", "count": 1, "percentage": 16.7 },
    { "status": "offer",           "count": 1, "percentage": 16.7 },
    { "status": "rejected",        "count": 1, "percentage": 16.7 },
    { "status": "failed",          "count": 1, "percentage": 16.7 },
    { "status": "ghosted",         "count": 0, "percentage": 0.0 }
  ],
  "applications_over_time": [
    { "period": "2026-08-15", "count": 1 },
    { "period": "2026-08-16", "count": 0 },
    { "period": "2026-08-17", "count": 2 },
    { "period": "2026-08-18", "count": 0 },
    { "period": "2026-08-19", "count": 1 },
    { "period": "2026-08-20", "count": 2 },
    { "period": "2026-08-21", "count": 0 }
  ],
  "time_series_granularity": "day",
  "response_rate": 66.7,
  "ghost_rate": 0.0,
  "rejection_fail_rate": 33.3,
  "avg_time_to_response_days": 4.5,
  "sankey": {
    "nodes": [
      { "key": "applied",         "label": "Applied",             "value": 6 },
      { "key": "interviewing_oa", "label": "Interviewing / OA",   "value": 3 },
      { "key": "rejected",        "label": "Rejected",            "value": 1 },
      { "key": "ghosted",         "label": "Ghosted",             "value": 0 },
      { "key": "offer",           "label": "Offer",               "value": 1 },
      { "key": "failed",          "label": "Failed Interview/OA", "value": 1 }
    ],
    "links": [
      { "source": "applied",         "target": "interviewing_oa", "value": 3 },
      { "source": "applied",         "target": "rejected",        "value": 1 },
      { "source": "interviewing_oa", "target": "offer",           "value": 1 },
      { "source": "interviewing_oa", "target": "failed",          "value": 1 }
    ]
  }
}
```

##### Metric definitions

All rates are **percentages 0–100**, rounded to 1 decimal, and `0.0` when `total` is 0 —
never `null`.

| Metric | Definition | Changed in V2? |
|---|---|---|
| `total` | Count of submitted applications in the window | no |
| `status_breakdown[].percentage` | `count / total * 100`. The array always contains exactly the **6** non-`saved` statuses, in the fixed order `applied, interviewing_oa, offer, rejected, failed, ghosted`, including zero-count entries | **yes** — was 5 |
| `response_rate` | `(interviewing_oa + offer + rejected + failed) / total * 100`. Everything that left `applied` other than by ghosting counts as a response | **yes** — `failed` added |
| `ghost_rate` | `ghosted / total * 100` | no |
| `rejection_fail_rate` | `(rejected + failed) / total * 100`. Display label: **"Rejection/fail rate"** | **yes** — replaces `rejection_rate`, which is **removed outright** |
| `avg_time_to_response_days` | Mean of `updated_at - date_applied` over responded rows (the same population `response_rate` describes), both read as **UTC** calendar dates; negatives discarded; rounded to 1 decimal. **`null`** when there are no responded rows | population widened by `failed` |

> **Caveat carried forward, and not fixed in V2:** per-status-change history is not
> persisted, so `updated_at` is a *proxy* for "first move away from `applied`" and is
> disturbed by any later edit to the row. Editing a note on a rejected application changes
> its apparent response time. Fixing this needs a status-event log, which was scoped and
> declined for V2.

##### The `sankey` object

R5 of the V2 PRD. A three-level funnel from submission to terminal outcome. Nodes and
links are **explicit** — the client must not re-derive the topology.

```
Level 1                Level 2                        Level 3
                    ┌─ Rejected            (terminal)
Applied ────────────┼─ Ghosted             (terminal)
(Submitted)         └─ Interviewing / OA ──┬─ Offer                (terminal)
                                           └─ Failed Interview/OA  (terminal)
```

Derivation, over the selected range's submitted applications only, from **current status
counts**:

| Element | Value |
|---|---|
| `applied` node | `total` — every submitted application in range |
| `interviewing_oa` node | `interviewing_oa + offer + failed` — its inflow, not its bare status count |
| `rejected` / `ghosted` / `offer` / `failed` nodes | That status's own count |
| link `applied → interviewing_oa` | `interviewing_oa + offer + failed` |
| link `applied → rejected` | `rejected` |
| link `applied → ghosted` | `ghosted` |
| link `interviewing_oa → offer` | `offer` |
| link `interviewing_oa → failed` | `failed` |

Guarantees the client can rely on:

- **`nodes` always has exactly 6 entries, in the order shown**, with the labels shown
  (`applied`, `interviewing_oa`, `rejected`, `ghosted`, `offer`, `failed`), even when every
  value is 0. There is exactly one shape to render.
- **`links` contains only links carrying flow.** A link whose value would be 0 is omitted.
  Consequences: `total = 0` yields six zero-valued nodes and `"links": []`; a board where
  nothing has moved past `applied` also yields `"links": []`; a board with a single outcome
  yields a single link. `links` has between 0 and 5 entries.
- **A node's outgoing links legitimately sum to less than its value.** Rows still sitting
  in `applied` or `interviewing_oa` are in flight and flow nowhere. There is no "pending"
  node and no synthetic balancing edge; the renderer must handle the gap without
  distorting the diagram.
- `sankey` is **always present**, never omitted or null.

Two known and accepted inaccuracies, inherent to deriving flow from current status alone:

1. An application the user marks `rejected` *after* an interview is drawn as
   `Applied → Rejected` — a pre-interview death. Nothing records that it reached
   `interviewing_oa`. The verbose **"Failed Interview/OA"** label is the mitigation.
2. An `interviewing_oa` application manually moved to `ghosted` is drawn under
   `Applied → Ghosted`. There is no level-3 `Ghosted` node, because with status-only data
   it is not computable which ghosts passed through interview.

#### `GET /dashboard/recap`

A shareable summary payload. Rendering into an image happens client-side; this endpoint
returns JSON only.

Auth: **required**. Not rate limited.

Query parameters: the shared range set above. **Changed in V2** — the recap previously
accepted only `week|month`; it now takes all five values, defaulting to `week`.

| Status | Trigger | Body |
|---|---|---|
| `200` | OK | [`DashboardRecap`](#619-dashboardrecap) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `422` | `range` not in the enum, or a custom range failing the rules above | Validation-error list (§7.2) |

`period_label` (PRD R6.3):

| `range` | `period_label` | `period_start` |
|---|---|---|
| `week` | `"This week"` | `today - 6 days` |
| `month` | `"This month"` | `today - 29 days` |
| `year` | `"This year"` | First day of the month 11 months back |
| `all` | `"All time"` | The caller's **earliest** `date_applied`; `today` when they have submitted nothing |
| `custom` | The actual range, e.g. `"Jan 1 – Mar 15, 2026"` (both years spelled out when the range crosses one: `"Dec 1, 2025 – Mar 15, 2026"`) | The requested `start` |

`period_end` is the window's upper bound — `today` for every preset range, the requested
`end` for `custom`. Both bounds are inclusive.

`highlights` is an ordered list of pre-rendered display strings, not a stable keyed object.
The first six labels are always `Applications`, `Interviews`, `Offers`, `Response rate`,
`Ghost rate`, `Rejection/fail rate`; a seventh, `Avg. reply time`, appears **only** when
`avg_time_to_response_days` is non-null. `headline` is server-generated prose. Clients
should render these as-is and not parse them.

**Changed in V2:** `Rejection/fail rate` is a new highlight (V1 had five). `Interviews` is
now `interviewing_oa + offer + failed` — `offer` and `failed` necessarily passed through
the interview stage — where V1 counted `interviewing + offer`.

```bash
curl -sS "http://localhost:8000/dashboard/recap?range=custom&start=2026-01-01&end=2026-03-15" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "range": "custom",
  "period_label": "Jan 1 – Mar 15, 2026",
  "period_start": "2026-01-01",
  "period_end": "2026-03-15",
  "total_applications": 6,
  "headline": "6 applications, 1 offer!",
  "highlights": [
    { "label": "Applications",        "value": "6" },
    { "label": "Interviews",          "value": "3" },
    { "label": "Offers",              "value": "1" },
    { "label": "Response rate",       "value": "67%" },
    { "label": "Ghost rate",          "value": "0%" },
    { "label": "Rejection/fail rate", "value": "33%" },
    { "label": "Avg. reply time",     "value": "5 days" }
  ],
  "status_breakdown": [
    { "status": "applied",         "count": 2, "percentage": 33.3 },
    { "status": "interviewing_oa", "count": 1, "percentage": 16.7 },
    { "status": "offer",           "count": 1, "percentage": 16.7 },
    { "status": "rejected",        "count": 1, "percentage": 16.7 },
    { "status": "failed",          "count": 1, "percentage": 16.7 },
    { "status": "ghosted",         "count": 0, "percentage": 0.0 }
  ],
  "sankey": {
    "nodes": [
      { "key": "applied",         "label": "Applied",             "value": 6 },
      { "key": "interviewing_oa", "label": "Interviewing / OA",   "value": 3 },
      { "key": "rejected",        "label": "Rejected",            "value": 1 },
      { "key": "ghosted",         "label": "Ghosted",             "value": 0 },
      { "key": "offer",           "label": "Offer",               "value": 1 },
      { "key": "failed",          "label": "Failed Interview/OA", "value": 1 }
    ],
    "links": [
      { "source": "applied",         "target": "interviewing_oa", "value": 3 },
      { "source": "applied",         "target": "rejected",        "value": 1 },
      { "source": "interviewing_oa", "target": "offer",           "value": 1 },
      { "source": "interviewing_oa", "target": "failed",          "value": 1 }
    ]
  }
}
```

For a given range, the recap's `status_breakdown` and `sankey` are byte-identical to the
stats endpoint's, and `total_applications` equals `DashboardStats.total` — note the
**different field name**.

Empty-period response (`total_applications: 0`): `headline` is
`"No applications yet this period — go get 'em."`, all six breakdown entries are present at
0, all six highlights read `0`/`0%`, `Avg. reply time` is absent, and `sankey` is the
six-zero-nodes / empty-links payload.

---

## 4. Background behavior a client should know about

A daily in-process job (APScheduler with a **UTC** timezone,
`GHOSTING_JOB_HOUR`/`GHOSTING_JOB_MINUTE`, default 03:00 UTC; it also runs once
immediately at application boot) flips applications to `ghosted` **server-side, without
any client action**:

- **Eligible statuses: `applied` only.** **Changed in V2** — V1 also swept
  `interviewing`. Once an application reaches `interviewing_oa`, a multi-week gap is
  normal, and auto-ghosting it destroyed exactly the signal the V2 status split exists to
  expose. Moving an `interviewing_oa` row to `ghosted` is now **only** something the user
  can do, through `PATCH`.
- `offer`, `rejected` and **`failed`** are terminal for this job and are never touched, nor
  is `saved`, nor already-`ghosted`. `failed → ghosted` remains a legal *manual*
  transition (§6.10) but is never an automatic one.
- A row is overdue when `today >= date_applied + effective_days`, where `effective_days`
  is the row's `ghost_days_override` if set, otherwise the owning user's
  `ghost_days_default` (default 14).
- Idempotent; re-running finds nothing new. A `ghost_days_override` on an
  `interviewing_oa` row has no effect at all, however aggressive.

The same daily job also deletes refresh-token rows whose `expires_at` has passed. This is
housekeeping only — an expired token already fails validation — and has no client-visible
effect.

Implication: an application's `status` can change between two client reads with no
intervening write from that client, but **only** for rows in `applied`. A user can manually
move a `ghosted` row back to any other status (see §6.10).

---

## 5. Data model notes

| Concern | Behavior |
|---|---|
| Identifiers | `id` and `user_id` are UUIDs, serialized as canonical lowercase hyphenated strings |
| Dates (`date_*`) | ISO `YYYY-MM-DD`. Accepted on input in the same form |
| Timestamps (`created_at`, `updated_at`) | ISO 8601. The columns are `DateTime(timezone=True)`, but the observed serialization on SQLite is **offset-naive** (e.g. `"2026-08-21T02:11:21"`). Against PostgreSQL an offset is expected. **This is genuinely inconsistent across deployments — parse defensively and do not assume a `Z`/offset suffix is present.** |
| "Today" | Every server-side date — `date_saved`/`date_applied` defaults, dashboard and recap windows, the ghosting deadline, refresh-token expiry — comes from `app/core/clock.py` in **UTC**, on the same calendar as the stored timestamps. Near midnight this may not match the client's local date |
| Deletion | Hard delete, no soft-delete or tombstone. A deleted application vanishes from every analytic figure regardless of its former status. Deleting a user cascades to their applications **and their refresh tokens** (DB-level `ON DELETE CASCADE`); there is no user-deletion endpoint |
| Status history | **Not persisted.** The `applications` table stores only the *current* status. This is a deliberate V2 decision and it is what limits `avg_time_to_response_days` and the Sankey's accuracy (§3.6) |
| Refresh tokens | Stored in a `refresh_tokens` table as `(id, user_id, token_hash, expires_at, revoked_at, created_at)`. The raw token value has no column and is never written anywhere |

---

## 6. Schemas

### 6.1 `SignupRequest`

| Field | Type | Required | Constraints | Notes |
|---|---|---|---|---|
| `email` | string | yes | `EmailStr` | Lower-cased before storage |
| `password` | string | yes | `minLength: 8`, `maxLength: 256` | Only the first 72 bytes affect the bcrypt hash |

### 6.2 `LoginRequest`

| Field | Type | Required | Constraints | Notes |
|---|---|---|---|---|
| `email` | string | yes | `EmailStr` | Matched lower-cased |
| `password` | string | yes | `minLength: 1`, `maxLength: 256` | |

### 6.3 `TokenResponse`

Returned by `POST /auth/signup`, `/auth/login`, `/auth/oauth/google` and `/auth/refresh`.

| Field | Type | Always present | Notes |
|---|---|---|---|
| `access_token` | string | yes | The access JWT (§2.1) |
| `token_type` | string | yes | Constant `"bearer"` |

No `expires_in`, **no `refresh_token`** (it is a cookie and never appears in a body), and
no user object — call `GET /auth/me` for the profile. Clients that need the access token's
expiry should decode the `exp` claim or simply treat any `401` as the trigger to refresh.

### 6.4 `GoogleOAuthRequest`

| Field | Type | Required | Constraints |
|---|---|---|---|
| `id_token` | string | yes | `minLength: 1` |

### 6.5 `UserPublic`

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string (UUID) | no | |
| `email` | string | no | |
| `google_id` | string | **yes** | Google `sub`; `null` for password-only accounts |
| `ghost_days_default` | integer | no | Defaults to 14 at account creation |

### 6.6 `ApplicationCreate`

Unknown fields are ignored (no `extra="forbid"` on this model).

| Field | Type | Required | Constraints | Default | Notes |
|---|---|---|---|---|---|
| `company` | string | **yes** | 1–255 chars | — | |
| `title` | string | **yes** | 1–255 chars | — | |
| `status` | [`ApplicationStatus`](#68-applicationstatus-enum) | no | enum | `"saved"` | Any member accepted; no transition validation on create |
| `job_url` | string \| null | no | ≤2048 chars | `null` | Not validated as a URL |
| `location` | string \| null | no | ≤255 chars | `null` | |
| `salary` | string \| null | no | ≤255 chars | `null` | Free text — ranges, single figures and `"DOE"` are all valid |
| `date_posted` | date \| null | no | ISO date | `null` | |
| `date_saved` | date \| null | no | ISO date | `null` | Server-defaults to today (UTC) when `status == "saved"` and this is omitted |
| `date_applied` | date \| null | no | ISO date | `null` | Server-defaults to today (UTC) when `status == "applied"` and this is omitted |
| `ghost_days_override` | integer \| null | no | 1 ≤ n ≤ 365 | `null` | `null` means "use the user's `ghost_days_default`", not "never ghost". Has no effect on any status other than `applied` (§4) |
| `notes` | string \| null | no | **≤10 000 chars** | `null` | See §9.2 |

### 6.7 `ApplicationResponse`

All fields always present; nullability as noted. Field order in the JSON follows the model
(base fields first, then `id`, `user_id`, `status`, `created_at`, `updated_at`) — do not
depend on ordering.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string (UUID) | no | |
| `user_id` | string (UUID) | no | Always the caller's id |
| `company` | string | no | |
| `title` | string | no | |
| `status` | [`ApplicationStatus`](#68-applicationstatus-enum) | no | |
| `job_url` | string | yes | |
| `location` | string | yes | |
| `salary` | string | yes | |
| `date_posted` | string (date) | yes | |
| `date_saved` | string (date) | yes | |
| `date_applied` | string (date) | yes | Starts the ghosting clock; non-null is what makes a row "submitted" for the dashboard |
| `ghost_days_override` | integer | yes | |
| `notes` | string | yes | |
| `created_at` | string (date-time) | no | See §5 re: offset |
| `updated_at` | string (date-time) | no | Bumped on any update, including a ghosting sweep. Also the input to the client-side 28-day staleness nudge on `interviewing_oa` rows |

### 6.8 `ApplicationStatus` enum

Read from `app/models/application.py`. Serialized as the lowercase string value.
**Changed in V2:** 7 values, up from 6. `interviewing` was renamed to `interviewing_oa`
and `failed` was added. There is no alias for the old name.

| Value | Display label | Meaning |
|---|---|---|
| `"saved"` | Saved | Bookmarked, not yet submitted. Invisible to every dashboard figure |
| `"applied"` | Applied | Submitted; ghosting clock running |
| `"interviewing_oa"` | **Interviewing / OA** | In an interview loop or online assessment (OA = online assessment) |
| `"offer"` | Offer | Offer received (terminal for the ghosting job) |
| `"rejected"` | Rejected | Rejected — **by convention, before reaching interview/OA** (terminal for the ghosting job) |
| `"failed"` | **Failed Interview/OA** | Reached interview/OA and did not pass (terminal for the ghosting job) |
| `"ghosted"` | Ghosted | No response past the threshold; set automatically (from `applied` only) or manually |

> The `rejected` = "died before interview" / `failed` = "died at or after interview"
> distinction is a **reporting convention, not a validation constraint** (PRD R1.4). Both
> are reachable from `applied`, `interviewing_oa`, `offer` and `ghosted`, and the API
> enforces nothing about which one a user picks. The convention is what
> `rejection_fail_rate` and the Sankey's grouping assume, and the deliberately verbose
> **"Failed Interview/OA"** display label is the only thing keeping users honest — clients
> should not shorten it to "Failed".

### 6.9 `ApplicationUpdate`

`extra="forbid"` — an unknown key is a `422`. Every field is optional; only supplied keys
are applied. Constraints are identical to `ApplicationCreate`.

| Field | Type | Constraints |
|---|---|---|
| `company` | string \| null | 1–255 chars |
| `title` | string \| null | 1–255 chars |
| `status` | `ApplicationStatus` \| null | Transition-validated (§6.10) when non-null |
| `job_url` | string \| null | ≤2048 chars |
| `location` | string \| null | ≤255 chars |
| `salary` | string \| null | ≤255 chars |
| `date_posted` | date \| null | ISO date |
| `date_saved` | date \| null | ISO date |
| `date_applied` | date \| null | ISO date |
| `ghost_days_override` | integer \| null | 1 ≤ n ≤ 365 |
| `notes` | string \| null | ≤10 000 chars |

### 6.10 Allowed status transitions

**Changed in V2.** Enforced **only on `PATCH`**, from `app/services/transitions.py`. A
transition to the same value is always allowed. Anything not listed is a `400`.

| From ↓ / To → | `saved` | `applied` | `interviewing_oa` | `offer` | `rejected` | `failed` | `ghosted` |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `saved` | — | yes | no | no | no | no | no |
| `applied` | no | — | yes | yes | yes | yes | yes |
| `interviewing_oa` | no | yes | — | yes | yes | yes | yes |
| `offer` | no | no | yes | — | yes | yes | no |
| `rejected` | no | yes | yes | no | — | yes | no |
| `failed` | no | yes | yes | yes | yes | — | no |
| `ghosted` | no | yes | yes | yes | yes | yes | — |

Rules embodied in the table, worth stating explicitly:

- **Nothing transitions back to `saved`.** A saved job the user decides against is
  deleted, not marked `rejected`.
- **`saved` can only move to `applied`.** No jumping straight to an outcome.
- **Any move into `applied`** requires the row to end up with a non-null `date_applied`;
  if the client does not supply one, the server sets it to today (UTC), so in practice
  this never fails.
- **`offer` cannot be ghosted**, and neither can `rejected` or `failed` — a terminal
  outcome is not something you stop hearing about. `applied` and `interviewing_oa` can.
- **The pre/post-interview split is not enforced.** `applied → failed` and
  `interviewing_oa → rejected` are both legal (§6.8).
- Recovery paths are deliberately permissive: a `ghosted` row can be moved to anything but
  `saved` if the user hears back, and `failed`/`rejected` can be reopened.

`400` message formats:

```json
{ "detail": "Cannot move an application from 'saved' to 'offer'." }
```

```json
{ "detail": "Moving to 'applied' requires a 'date_applied' (this date starts the ghosting clock)." }
```

### 6.11 `AutofillRequest`

| Field | Type | Required | Constraints |
|---|---|---|---|
| `url` | string | yes | 1–2048 chars |

### 6.12 `AutofillParsed`

| Field | Type | Always present | Notes |
|---|---|---|---|
| `status` | string | yes | Literal `"parsed"` |
| `source` | string | yes | `"greenhouse"` or `"workday"` |
| `fields` | [`ParsedFields`](#6121-parsedfields) | yes | |

#### 6.12.1 `ParsedFields`

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `company` | string | yes | Falls back to a title-cased board token / Workday tenant when the upstream JSON omits a company name |
| `title` | string | yes | In practice non-null: a missing `title` upstream causes the parser to bail out to `failed` |
| `location` | string | yes | Workday joins de-duplicated primary + additional locations with `"; "` |
| `salary` | string | yes | Greenhouse only, and only when the board configured pay ranges. Format `"{CURRENCY} {min:,} - {max:,}"` (whole units, cents dropped) or `"{CURRENCY} {min:,}+"`. Workday is always `null` |
| `date_posted` | string (date) | yes | Greenhouse `first_published` (falling back to `updated_at`); Workday `jobPostingInfo.startDate` |
| `job_url` | string | **no** | The URL the client submitted, whitespace-stripped — not a normalized or canonical URL |
| `suggested_status` | `ApplicationStatus` | no | Always `"applied"` |

### 6.13 `AutofillUnsupported`

| Field | Type | Always present | Notes |
|---|---|---|---|
| `status` | string | yes | Literal `"unsupported"` |
| `url` | string | yes | The submitted URL, whitespace-stripped |

### 6.14 `AutofillFailed`

| Field | Type | Always present | Notes |
|---|---|---|---|
| `status` | string | yes | Literal `"failed"` |
| `url` | string | yes | The submitted URL, whitespace-stripped |
| `reason` | string \| null | yes (may be `null`) | See the reason table in §3.4 |

> Naming collision worth flagging: `AutofillFailed.status` is the literal string
> `"failed"`, and `ApplicationStatus` now also has a member called `"failed"`. They are
> unrelated — one is an autofill result discriminator, the other an application status.

### 6.15 `SettingsResponse`

| Field | Type | Notes |
|---|---|---|
| `ghost_days_default` | integer | 1–365 |

### 6.16 `SettingsUpdate`

| Field | Type | Required | Constraints |
|---|---|---|---|
| `ghost_days_default` | integer | **yes** | 1 ≤ n ≤ 365 |

### 6.17 `DashboardStats`

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `range` | string enum | no | Echoes the request: `week` \| `month` \| `year` \| `all` \| `custom` |
| `total` | integer | no | Submitted applications in window (excludes `saved`) |
| `status_breakdown` | array of [`StatusBreakdownItem`](#618-statusbreakdownitem) | no | **Always 6 entries**, fixed order |
| `applications_over_time` | array of [`TimeSeriesPoint`](#6171-timeseriespoint) | no | See the bucketing table in §3.6 |
| `time_series_granularity` | string enum | no | `"day"` \| `"week"` \| `"month"`. Only `"day"` and `"month"` are actually produced; `"week"` exists in the type and is never emitted |
| `response_rate` | number | no | Percentage 0–100 |
| `ghost_rate` | number | no | Percentage 0–100 |
| `rejection_fail_rate` | number | no | Percentage 0–100. **Replaces V1's `rejection_rate`, which no longer exists** |
| `avg_time_to_response_days` | number | **yes** | `null` when no responded rows |
| `sankey` | [`Sankey`](#6172-sankey) | no | **New in V2.** Always present |

#### 6.17.1 `TimeSeriesPoint`

| Field | Type | Notes |
|---|---|---|
| `period` | string | ISO date `YYYY-MM-DD` for daily buckets, `YYYY-MM` for monthly. The field is **not** named `date` |
| `count` | integer | Applications whose `date_applied` falls in this bucket |

#### 6.17.2 `Sankey`

**New in V2.**

| Field | Type | Notes |
|---|---|---|
| `nodes` | array of [`SankeyNode`](#6173-sankeynode) | **Always exactly 6**, in the fixed order `applied, interviewing_oa, rejected, ghosted, offer, failed` |
| `links` | array of [`SankeyLink`](#6174-sankeylink) | **0 to 5** entries. Only links carrying flow are present; zero-valued links are omitted |

#### 6.17.3 `SankeyNode`

| Field | Type | Notes |
|---|---|---|
| `key` | string | The `ApplicationStatus` value the node represents |
| `label` | string | Fixed display label — `"Applied"`, `"Interviewing / OA"`, `"Rejected"`, `"Ghosted"`, `"Offer"`, `"Failed Interview/OA"` |
| `value` | integer | The node's **inflow**, not its bare status count. See the derivation table in §3.6 |

#### 6.17.4 `SankeyLink`

| Field | Type | Notes |
|---|---|---|
| `source` | string | A node `key` |
| `target` | string | A node `key` |
| `value` | integer | Always `> 0` |

The only five `(source, target)` pairs that can ever appear:
`applied→interviewing_oa`, `applied→rejected`, `applied→ghosted`,
`interviewing_oa→offer`, `interviewing_oa→failed`.

### 6.18 `StatusBreakdownItem`

| Field | Type | Notes |
|---|---|---|
| `status` | `ApplicationStatus` | Only `applied`, `interviewing_oa`, `offer`, `rejected`, `failed`, `ghosted` ever appear — `saved` never does |
| `count` | integer | |
| `percentage` | number | 0–100, share of `total`, 1 decimal |

### 6.19 `DashboardRecap`

| Field | Type | Notes |
|---|---|---|
| `range` | string enum | `week` \| `month` \| `year` \| `all` \| `custom` |
| `period_label` | string | See the label table in §3.6. For `custom` it is a rendered date range, not a fixed phrase |
| `period_start` | string (date) | Inclusive |
| `period_end` | string (date) | Inclusive; `today` for every preset range |
| `total_applications` | integer | Same value as `DashboardStats.total` for the same range — note the **different field name** |
| `headline` | string | Server-generated display prose |
| `highlights` | array of [`RecapHighlight`](#6191-recaphighlight) | **6 or 7** entries, ordered |
| `status_breakdown` | array of `StatusBreakdownItem` | Identical to the stats breakdown |
| `sankey` | `Sankey` | **New in V2.** Identical to the stats `sankey` for the same range |

#### 6.19.1 `RecapHighlight`

| Field | Type | Notes |
|---|---|---|
| `label` | string | Display label |
| `value` | string | Pre-formatted display string (e.g. `"50%"`, `"5 days"`), not a number |

### 6.20 Dashboard range query parameters

Not a body schema — the shared query model behind both dashboard endpoints
(`app/schemas/dashboard.RangeQuery`). Documented here because its cross-field validation
produces a distinctive `422` shape (§7.2).

| Field | Type | Required | Notes |
|---|---|---|---|
| `range` | `week` \| `month` \| `year` \| `all` \| `custom` | no | Defaults to `all` on stats, `week` on recap |
| `start` | date | only when `range=custom` | Ignored for preset ranges, not rejected |
| `end` | date | only when `range=custom` | Ignored for preset ranges, not rejected |

Unrelated extra query parameters are **not** rejected — a cache-busting or analytics
parameter will not produce a `422`.

---

## 7. Errors

### 7.1 Canonical envelope

Almost every error is FastAPI's standard shape, with a **string** `detail`:

```json
{ "detail": "Application not found" }
```

There is no error code, no field, no request id, and no machine-readable discriminator.
Clients must branch on the HTTP status, not on the `detail` text.

Two documented exceptions:

1. **`422` validation errors** use `detail` as an **array of objects** (§7.2).
2. **`429` rate-limit responses do not use `detail` at all** — they use `error` (§8).

So `detail` is `string | object[] | undefined` depending on status. A client helper that
assumes `body.detail` is a string will render `[object Object]` on a `422` and `undefined`
on a `429`.

### 7.2 Validation errors (`422`)

Emitted by FastAPI/pydantic for body, query and path validation. `detail` is an array; each
entry has `type`, `loc` (path to the offending value, first element being `body`, `query`
or `path`), `msg`, `input`, and often `ctx`.

Missing required body field:

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "company"],
      "msg": "Field required",
      "input": { "title": "Senior Backend Engineer" }
    }
  ]
}
```

**The retired `interviewing` value** — this is what a V1 client hits first:

```json
{
  "detail": [
    {
      "type": "enum",
      "loc": ["query", "status"],
      "msg": "Input should be 'saved', 'applied', 'interviewing_oa', 'offer', 'rejected', 'failed' or 'ghosted'",
      "input": "interviewing",
      "ctx": {
        "expected": "'saved', 'applied', 'interviewing_oa', 'offer', 'rejected', 'failed' or 'ghosted'"
      }
    }
  ]
}
```

The same shape appears with `loc: ["body", "status"]` on `POST`/`PATCH /applications`.

Unknown `range` value:

```json
{
  "detail": [
    {
      "type": "literal_error",
      "loc": ["query", "range"],
      "msg": "Input should be 'week', 'month', 'year', 'all' or 'custom'",
      "input": "fortnight",
      "ctx": { "expected": "'week', 'month', 'year', 'all' or 'custom'" }
    }
  ]
}
```

**Custom-range failures are model-level**, so `loc` is `["query"]` with **no field name**,
`type` is `value_error`, and `input` echoes the whole query object. A client that reads
`loc[1]` to highlight a field will find nothing there — match on `type: "value_error"` and
show `msg`:

```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["query"],
      "msg": "Value error, A custom range must span between 1 and 366 days inclusive (got 367).",
      "input": { "range": "custom", "start": "2025-01-01", "end": "2026-01-02" },
      "ctx": { "error": {} }
    }
  ]
}
```

The other two custom-range messages, same shape:

- `"Value error, `start` and `end` are both required when range=custom."`
- `"Value error, `start` must be on or before `end`."`

Note the `"Value error, "` prefix pydantic prepends, and that `ctx.error` serializes as an
empty object.

Rejected unknown field on `PATCH /applications/{app_id}`:

```json
{
  "detail": [
    {
      "type": "extra_forbidden",
      "loc": ["body", "nope"],
      "msg": "Extra inputs are not permitted",
      "input": 1
    }
  ]
}
```

Note that `input` echoes the offending value. For a `notes` field near the 10 000-character
limit, the `422` body is therefore roughly as large as the rejected value.

### 7.3 Status code table

| Status | Where | Trigger | Body |
|---|---|---|---|
| `200` | Most `GET`s, `POST /auth/login`, `/auth/oauth/google`, `/auth/refresh`, `/applications/autofill`, `PATCH` endpoints | Success | Endpoint's response model |
| `201` | `POST /auth/signup`, `POST /applications` | Created | `TokenResponse` / `ApplicationResponse` |
| `204` | `DELETE /applications/{app_id}`, **`POST /auth/logout`** | Deleted / logged out | *(empty)* |
| `307` | Any canonical path requested with a trailing slash | Starlette redirect-slashes | *(empty; `Location` header)* |
| `400` | `PATCH /applications/{app_id}` | Disallowed status transition (§6.10) | `{"detail": "Cannot move an application from '…' to '…'."}` |
| `400` | Any `POST`/`PUT`/`PATCH` | Unparseable `Content-Length` header (body-size middleware) | `{"detail": "Invalid Content-Length header."}` |
| `401` | Every Bearer-authenticated endpoint | Missing/malformed/expired/wrong-claims/wrong-`typ` token, or no matching user | `{"detail": "Not authenticated"}` + `WWW-Authenticate: Bearer` |
| `401` | `POST /auth/login` | Bad credentials, unknown email, or OAuth-only account | `{"detail": "Incorrect email or password."}` |
| `401` | `POST /auth/oauth/google` | Google verification failed, unverified email, or `GOOGLE_CLIENT_ID` unset | `{"detail": "Invalid Google credential."}` |
| `401` | **`POST /auth/refresh`** | Cookie missing, unknown, expired or revoked — undifferentiated | `{"detail": "Invalid or expired session."}` |
| `403` | **`POST /auth/refresh`, `POST /auth/logout`** | Missing `X-Refresh-Request` header (§2.7) | `{"detail": "This endpoint requires the 'X-Refresh-Request' header."}` |
| `404` | `/applications/{app_id}` (`GET`/`PATCH`/`DELETE`) | Row absent **or owned by another user** | `{"detail": "Application not found"}` |
| `404` | Any path | No route matches | `{"detail": "Not Found"}` |
| `404` | `/docs`, `/redoc`, `/openapi.json` | Non-development `ENVIRONMENT` | `{"detail": "Not Found"}` |
| `405` | Any path | Route exists, method does not | `{"detail": "Method Not Allowed"}` |
| `409` | `POST /auth/signup` | Email already registered | `{"detail": "An account with this email already exists."}` |
| `413` | Any `POST`/`PUT`/`PATCH` | Request body > `MAX_REQUEST_BODY_BYTES` (1 MiB) | `{"detail": "Request body too large."}` |
| `422` | Everywhere | Body/query/path validation failure | Validation-error **array** (§7.2) |
| `429` | Rate-limited endpoints (§8) | Per-IP budget exhausted | `{"error": "Rate limit exceeded: <limit>"}` |
| `500` | — | Unhandled server error. Not expected on any documented path; `POST /applications/autofill` in particular is written so parser failures can never produce one | FastAPI default |

**Changed in V2:** `403` is now a real response. In V1 this API never returned one. It has
exactly one cause — the missing CSRF header on the two refresh-cookie endpoints — and is
never produced by the Bearer auth dependency, which always answers `401`.

**Not documented in the generated OpenAPI schema.** The auto-generated `/openapi.json`
lists only `200`/`201`/`204` and `422` per operation — it does not declare `400`, `401`,
`403`, `404`, `409`, `413` or `429`. Code generated from that schema will be missing every
error case above. Use this document, not the generated schema, for error handling.

---

## 8. Rate limiting

slowapi, keyed per **client IP**, storage **in-process memory** (so budgets are per API
instance and reset on restart; horizontal scaling would need a shared Redis backend).
Globally toggleable with `RATE_LIMIT_ENABLED` (default `true`; the test suite disables it).

| Endpoint | Setting | Default limit |
|---|---|---|
| `POST /auth/signup` | `RATE_LIMIT_SIGNUP` | **3 per hour** |
| `POST /auth/login` | `RATE_LIMIT_LOGIN` | **5 per minute** |
| `POST /auth/oauth/google` | `RATE_LIMIT_OAUTH` | **10 per minute** |
| `POST /auth/refresh` | `RATE_LIMIT_REFRESH` | **30 per minute** *(new in V2)* |
| `POST /applications/autofill` | `RATE_LIMIT_AUTOFILL` | **10 per minute** |

No other endpoint is rate limited. In particular application CRUD, the dashboard and
`POST /auth/logout` have no per-user or per-IP budget.

`/auth/refresh` is set deliberately looser than the login budget: it is a legitimate,
frequent call on a 30-minute access token (app boot, tab wake, any `401` retry), so a
login-sized budget would break normal use. It is still bounded, because the endpoint
accepts a guessable-in-principle credential and should not be a free oracle.

### Client-IP determination

The limiter uses the socket peer address. `X-Forwarded-For` is consulted **only** when
`TRUST_PROXY_HEADERS=true` (default `false`), and then only its left-most entry. With the
default configuration a spoofed `X-Forwarded-For` does not reset the budget. If deployed
behind a proxy, enable that flag only if the proxy strips inbound `X-Forwarded-For`.

### The `429` response

Status `429 Too Many Requests`. Body uses `error`, **not** `detail`:

```json
{ "error": "Rate limit exceeded: 5 per 1 minute" }
```

The limiter is constructed with `headers_enabled=False`, so:

- **No `X-RateLimit-Limit` / `-Remaining` / `-Reset` headers** on any response.
- **No `Retry-After` header on the `429`** either. `headers_enabled` gates both header
  families together — `_inject_headers` is a no-op when it is false.

Clients therefore have to infer the retry window from the limit string in the body, or
back off blindly. The security response headers from §9.4 are present on the `429`.

---

## 9. Operational limits and security behaviors

### 9.1 Request body cap → `413`

`MAX_REQUEST_BODY_BYTES` = **1 048 576 bytes (1 MiB)**, enforced by ASGI middleware on
`POST`, `PUT` and `PATCH` only (`GET`/`DELETE`/`HEAD`/`OPTIONS` bodies are not read by any
handler).

- Declared `Content-Length` over the cap → `413` **before a byte of the body is read**.
- A non-integer `Content-Length` → `400 {"detail": "Invalid Content-Length header."}`.
- No `Content-Length` (chunked transfer) → the body is buffered with a ceiling and aborted
  at the cap → `413`. Omitting the header is not a bypass.
- `413` body: `{"detail": "Request body too large."}`.

The middleware is nested inside CORS and the security-header middleware, so a `413`
**still carries `Access-Control-Allow-Origin` and the security headers** — a browser sees a
real `413` rather than an opaque network error.

### 9.2 `notes` length → `422`

`notes` (both on create and update) is capped at **10 000 characters** by the schema. A
longer value that still fits under the 1 MiB body cap is a `422` with
`"type": "string_too_long"` and `loc: ["body", "notes"]` — not a `413`. The two limits are
independent layers: 1 MiB bounds the transport, 10 000 chars bounds the column.

Other length caps that produce `422`: `company`/`title`/`location`/`salary` at 255,
`job_url` and autofill `url` at 2048, `password` at 256.

### 9.3 CORS and the refresh cookie

**Changed in V2.** V1 ran with `allow_credentials=False`, which was correct then: the only
credential was a Bearer header the browser never attaches on its own. V2 adds a refresh
cookie — an ambient credential — and the browser will not send it cross-origin unless
credentialed CORS is enabled.

| Setting | Value | Changed in V2? |
|---|---|---|
| `allow_origins` | Explicit list from `CORS_ORIGINS` (default `http://localhost:5173,http://127.0.0.1:5173`). A `*` entry is **rejected at startup** — the app will not boot | no |
| `allow_credentials` | **`true`** | **yes** — was `false` |
| `allow_methods` | `GET, POST, PATCH, DELETE, OPTIONS` (no `PUT`, no `HEAD`) | no |
| `allow_headers` | `Authorization, Content-Type, X-Refresh-Request` (Starlette additionally echoes the CORS-safelisted `Accept`, `Accept-Language`, `Content-Language`) | **yes** — `X-Refresh-Request` added |
| `max_age` | `600` seconds | no |

An allow-listed origin receives `Access-Control-Allow-Credentials: true` and its own origin
echoed in `Access-Control-Allow-Origin`. An unlisted origin receives **no**
`Access-Control-Allow-Origin` header at all, on both preflight and simple requests, and the
browser blocks the response.

Preflight (`OPTIONS`) is handled by the CORS middleware and returns `200`.

#### Refresh cookie attributes

```
Set-Cookie: jtracks_refresh=<opaque>; HttpOnly; Secure; SameSite=None; Path=/auth; Max-Age=1209600
```

| Attribute | Value | Why |
|---|---|---|
| Name | `jtracks_refresh` (`REFRESH_COOKIE_NAME`) | |
| `HttpOnly` | always | Not readable by script; an XSS payload cannot exfiltrate it |
| `Secure` | always — **not** conditional on `ENVIRONMENT` | Required by browsers alongside `SameSite=None`. Chrome and Firefox accept `Secure` cookies over `http://localhost`, so local development works unchanged |
| `SameSite` | `None` (`REFRESH_COOKIE_SAMESITE`) | Hosting is undecided. A `Lax` cookie is **not sent at all** on cross-site requests, so a split frontend/API deployment would break auth in production while working perfectly on localhost. `None` behaves identically in all three topologies |
| `Path` | `/auth` (`REFRESH_COOKIE_PATH`) | Keeps the cookie off the other 15 endpoints, which is what confines the CSRF surface to two routes |
| `Max-Age` | `REFRESH_TOKEN_EXPIRE_DAYS` × 86 400 = 1 209 600 s (14 days) | Matches the server-side `expires_at` |

The design rationale, including the alternatives rejected, is recorded in
`docs/decisions/cookie-topology-samesite.md`.

Because `SameSite=None` means the cookie rides cross-site requests, three things are
load-bearing together and none may be relaxed independently:

1. the **strict origin allowlist** (`CORS_ORIGINS`, wildcard rejected at startup),
2. the **`X-Refresh-Request` header** requirement on `/auth/refresh` and `/auth/logout`
   (§2.7), which forces a preflight the allowlist can refuse,
3. `Path=/auth`, which keeps the surface to those two endpoints.

Non-browser clients must send `X-Refresh-Request` explicitly and must persist the cookie
between calls (`curl -c`/`-b`).

### 9.4 Security response headers

Applied to **every** response, including errors:

| Header | Value | Condition |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | always |
| `X-Frame-Options` | `DENY` | always |
| `Referrer-Policy` | `no-referrer` | always |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'` | always, **except** on `/docs`, `/redoc`, `/docs/oauth2-redirect` (Swagger UI loads CDN assets) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | only when `ENVIRONMENT` is **not** a development value |

All are set with `setdefault`, so a route that sets its own value wins.

### 9.5 Documentation endpoints

`/docs`, `/redoc` and `/openapi.json` are registered only when `ENVIRONMENT` ∈
{`development`, `dev`, `local`, `test`, `testing`}. In any other environment the app is
constructed with `docs_url=None, redoc_url=None, openapi_url=None` and all three return
`404`. Do not build a client that fetches the OpenAPI document at runtime.

### 9.6 Per-user isolation

Unchanged from V1 and worth restating, because V2 added no exception to it: every
application and settings query is scoped to `current_user.id`. A row owned by another user
returns `404`, never `403`, and never leaks its contents. Dashboard figures, the Sankey and
the recap are all computed from the caller's rows alone. Refresh tokens are looked up by
hash and carry their own `user_id`, so a token can only ever mint an access token for the
user it was issued to.

### 9.7 Configuration reference (settings that change API behavior)

| Variable | Default | Effect on the API surface |
|---|---|---|
| `ENVIRONMENT` | `development` | Gates `/docs`, `/redoc`, `/openapi.json`, HSTS, and JWT-secret strictness |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed browser origins; `*` rejected at startup. Load-bearing in V2 (§9.3) |
| `JWT_SECRET` | (random per process in dev; **required** ≥32 chars elsewhere) | Access-token signing key |
| `JWT_ALGORITHM` | `HS256` | Access-token algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | **`30`** *(V2: was 10 080)* | Access-token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | **`14`** *(new in V2)* | Refresh-token lifetime and cookie `Max-Age` |
| `REFRESH_COOKIE_NAME` | **`jtracks_refresh`** *(new)* | Cookie name |
| `REFRESH_COOKIE_PATH` | **`/auth`** *(new)* | Cookie path |
| `REFRESH_COOKIE_SAMESITE` | **`none`** *(new)* | Cookie `SameSite` |
| `REFRESH_COOKIE_SECURE` | **`true`** *(new)* | Cookie `Secure` |
| `REFRESH_CSRF_HEADER` | **`X-Refresh-Request`** *(new)* | Header required on `/auth/refresh` and `/auth/logout`; also added to `allow_headers` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `jtracks` / `jtracks-api` | Required `iss`/`aud` claims |
| `GOOGLE_CLIENT_ID` | `""` | Unset ⇒ `/auth/oauth/google` always `401` |
| `MAX_REQUEST_BODY_BYTES` | `1048576` | `413` threshold |
| `RATE_LIMIT_ENABLED` | `true` | Master switch for all five budgets |
| `RATE_LIMIT_SIGNUP` / `_LOGIN` / `_OAUTH` / `_REFRESH` / `_AUTOFILL` | `3/hour`, `5/minute`, `10/minute`, `30/minute`, `10/minute` | Per-IP budgets |
| `TRUST_PROXY_HEADERS` | `false` | Whether `X-Forwarded-For` identifies the rate-limit client |
| `AUTOFILL_TIMEOUT_SECONDS` | `8.0` | Outbound autofill timeout |
| `AUTOFILL_MAX_RESPONSE_BYTES` | `2097152` (2 MiB) | Outbound autofill response ceiling |
| `DEFAULT_GHOST_DAYS` | `14` | Fallback ghosting threshold |
| `GHOSTING_JOB_HOUR` / `_MINUTE` | `3` / `0` | When `applied` rows may flip to `ghosted` server-side (cron in **UTC**; the overdue comparison uses the UTC date, so the two agree) |
| `RUN_SCHEDULER` | `true` | Whether this instance runs the daily sweep and the expired-refresh-token purge |

---

## 10. Verification

Everything in this document was derived from the source under
`C:\Users\elija\Documents\jTracks\backend\app\` and cross-checked three ways:

1. Against the assertions in `backend/tests/` — `test_auth.py`, `test_auth_refresh.py`,
   `test_refresh_token_service.py`, `test_tokens.py`, `test_applications.py`,
   `test_status_enum.py`, `test_transitions.py`, `test_ghosting.py`, `test_isolation.py`,
   `test_settings.py`, `test_dashboard.py`, `test_dashboard_ranges.py`, `test_sankey.py`,
   `test_clock.py`, `test_autofill.py`, `test_health.py`, `test_security_regression.py`,
   `test_security_regression_medium.py`. **312 tests, 0 failures.**
2. By running the app under Uvicorn against a throwaway SQLite database and recording
   actual status codes, headers and JSON bodies — including the full refresh/logout cookie
   round trip (`Set-Cookie` attributes, `403` without the CSRF header, `204` logout, `401`
   on the replayed cookie), the `422` bodies for the retired `interviewing` value and every
   custom-range violation, the CORS preflight, and the `sankey` payload.
3. By seeding the `scripts/seed.py` dataset (24 applications spanning >13 months, every
   status populated) and hand-verifying every dashboard figure against it:
   `total = 20`, breakdown `5/3/2/4/3/3`, `response_rate 60.0`, `ghost_rate 15.0`,
   `rejection_fail_rate 35.0`, `avg_time_to_response_days 137.7`, Sankey
   `applied 20 → interviewing_oa 8 / rejected 4 / ghosted 3`, `interviewing_oa → offer 2 /
   failed 3`, and `range=year` correctly returning 19 rows over exactly 12 monthly buckets.

The complete operation inventory (17 operations) matches the generated OpenAPI paths
one-for-one.

---

## 11. Changelog / status

### v2 — 2026-08-21

Breaking release. Frontend and backend ship together; there is no compatibility shim for
any of the removals below.

**Removed (no alias, no deprecation window):**

- **`ApplicationStatus` value `"interviewing"`.** Renamed to `"interviewing_oa"`. Sending
  the old value anywhere — create body, patch body, or the `?status=` list filter — is a
  `422`.
- **`DashboardStats.rejection_rate`.** Replaced by `rejection_fail_rate`, with a different
  definition (`(rejected + failed) / total`, not `rejected / total`). The old key is absent
  from every response.
- **The 7-day access token.** `ACCESS_TOKEN_EXPIRE_MINUTES` is now 30.
- **Recap range restriction.** `GET /dashboard/recap` no longer rejects `all`; it accepts
  the same five ranges as stats.

**Added:**

- `ApplicationStatus` value **`"failed"`** ("Failed Interview/OA"), for an application that
  reached interview/OA and did not pass.
- **`POST /auth/refresh`** and **`POST /auth/logout`**, plus a DB-backed, revocable refresh
  token delivered as an httpOnly cookie. Signup, login and Google OAuth now set that cookie.
- **`typ` claim** on the access token, required at verification.
- **`sankey`** object on both `GET /dashboard/stats` and `GET /dashboard/recap`.
- **`year`** and **`custom`** analytics ranges, with `start`/`end` parameters and a 1–366
  inclusive-day validation on `custom`.
- **`rejection_fail_rate`** metric and a matching **"Rejection/fail rate"** recap highlight.
- **`403`** as a possible response, from the `X-Refresh-Request` CSRF check on the two
  refresh-cookie endpoints.
- `RATE_LIMIT_REFRESH` (30/minute) and the five refresh-cookie configuration variables.

**Changed:**

- **Status-transition matrix** (§6.10) rewritten for 7 statuses.
- **Ghosting sweep** now considers `applied` only. `interviewing_oa` rows are never
  auto-ghosted; `failed` joins `offer`/`rejected` as untouchable.
- **`status_breakdown`** is 6 entries, not 5, in the order
  `applied, interviewing_oa, offer, rejected, failed, ghosted`.
- **`response_rate`** widened to include `failed`; `avg_time_to_response_days` averages
  over the same widened population.
- **Recap "Interviews"** highlight is now `interviewing_oa + offer + failed`.
- **`allow_credentials`** flipped to `true`, and `X-Refresh-Request` added to
  `allow_headers`.
- The daily scheduler job additionally purges expired refresh-token rows.

**Unchanged:** `/health`, `POST /applications/autofill`, `GET`/`PATCH /settings`,
`GET /auth/me`, the `413`/`422` limits, the security response headers, the rate-limit
mechanism and `429` shape, per-user isolation and the `404`-not-`403` rule.

### Known contract characteristics an integrator should plan around

All documented above rather than fixed here:

- No URL or header versioning; changes to any shape are silent to clients.
- No pagination, sorting or filtering on `GET /applications` beyond `status`.
- Error envelope is inconsistent across statuses: `detail` as a string, `detail` as an
  array (`422`), and `error` as a string (`429`).
- Custom-range `422`s carry `loc: ["query"]` with no field name.
- The generated OpenAPI document omits every non-`2xx` response except `422`.
- No `Retry-After` or `X-RateLimit-*` headers accompany a `429`.
- `created_at`/`updated_at` timezone offset presence differs between the SQLite and
  PostgreSQL deployments.
- Status-transition rules apply to `PATCH` only, not to `POST /applications`.
- **No refresh-token rotation and no reuse detection** — a stolen refresh token is usable
  until expiry or explicit logout (§2.6).
- **Access tokens are not revocable** — a leaked one is valid for up to 30 minutes.
- **Analytics are derived from current status only.** No status history is persisted, so
  `avg_time_to_response_days` is a proxy, a post-interview outcome recorded as `rejected`
  is counted as a pre-interview death, and an `interviewing_oa` row manually ghosted is
  drawn as a pre-interview ghost (§3.6).
- The `rejected`/`failed` stage distinction is a **convention the API does not enforce**.
- Signup still discloses whether an email is registered, via `409`. A conscious V1
  trade-off, unchanged.

### v1 history

`API_SPEC_V1.md` (2026-08-10, revised 2026-08-11) documented 15 operations and remains in
the repository as the historical record of the shipped MVP. It is superseded by this
document and should not be used as a contract.
