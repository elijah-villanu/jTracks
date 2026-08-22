# jTracks API — v1 Specification

> **Superseded.** This is the historical record of the shipped MVP. The current contract of record is [`API_SPEC_V2.md`](./API_SPEC_V2.md).

Reference for the jTracks FastAPI backend. Every path, status code, field name and
constraint in this document was read out of `backend/app/**` and confirmed by executing
the running app (see [Verification](#verification)).

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
and that document is not served in production (see §9). This specification pins the
surface as it exists on 2026-08-10 and calls it **v1**.

Practical consequence for integrators: the contract is unversioned at the transport level,
so any breaking change to a shape is silent from the client's point of view. Treat this
document as the contract of record and re-check it when the backend changes.

### Trailing slashes

Canonical paths carry **no** trailing slash. `GET /applications/` and `GET /settings/`
return `307 Temporary Redirect` with a `Location` pointing at the slash-less form.
`307` preserves method and body, but clients should just use the canonical path — a
cross-origin redirect adds a preflight round trip.

### Interactive documentation

`/docs` (Swagger UI), `/redoc` and `/openapi.json` are served **only when `ENVIRONMENT`
is one of** `development`, `dev`, `local`, `test`, `testing`. Anywhere else all three
return `404`. See §9.

---

## 2. Authentication

All authenticated endpoints use a **Bearer JWT** in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Authentication is never cookie-based. Credentialed CORS is disabled (§9), so a browser
client must attach the header explicitly; there is no ambient credential.

### 2.1 Token format

| Property | Value | Source |
|---|---|---|
| Type | JWT, compact serialization | `app/core/security.py` |
| Signing algorithm | `HS256` (`JWT_ALGORITHM`; the verifier passes an explicit single-element `algorithms` list, so `alg: none` and RS256→HS256 confusion are rejected) | `config.py`, `security.py` |
| Lifetime | `ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7` = **10 080 minutes = 7 days** (verified: `exp - iat == 604800`) | `config.py` |
| Secret | `JWT_SECRET`. Outside a development environment the app **refuses to start** without one that is ≥32 chars and not a known placeholder. In development an ephemeral random secret is generated per process, so tokens do not survive a restart. | `config.py` |

### 2.2 Claims

| Claim | Type | Issued? | Required at verification? | Value |
|---|---|---|---|---|
| `sub` | string | yes | **yes** | The user's UUID, as a string |
| `iat` | int (epoch s) | yes | **yes** | Issue time (UTC) |
| `exp` | int (epoch s) | yes | **yes** | `iat + 7 days` |
| `iss` | string | yes | **yes** | `JWT_ISSUER`, default `jtracks` |
| `aud` | string | yes | **yes** | `JWT_AUDIENCE`, default `jtracks-api` |
| `jti` | string (32 hex) | yes | no | Unique per token; hook for a future revocation list |

`jwt.decode(..., options={"require": ["sub", "exp", "iat", "iss", "aud"]})` — a token that
merely *omits* `exp` is rejected rather than treated as non-expiring. `iss` and `aud` are
also value-checked, so a token minted for a different service that happens to share the
secret does not validate here.

### 2.3 How 401s are produced

`get_current_user` (`app/api/deps.py`) raises a single `401` for every failure mode, with
`WWW-Authenticate: Bearer`:

- no `Authorization` header, or a non-Bearer scheme (`HTTPBearer(auto_error=False)`)
- signature invalid, expired, wrong/missing `iss`/`aud`/`sub`/`exp`/`iat`, `alg: none`
- `sub` is not a parseable UUID
- `sub` parses but no user row exists

All of these return exactly:

```json
{ "detail": "Not authenticated" }
```

There is deliberately no distinction between "malformed token" and "unknown user" —
`403` is never returned by the auth dependency.

### 2.4 Obtaining a token

Three endpoints mint tokens, all returning the same `TokenResponse`:
`POST /auth/signup`, `POST /auth/login`, `POST /auth/oauth/google`.

```bash
BASE=http://localhost:8000

TOKEN=$(curl -sS -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"dana.reyes@example.com","password":"correct-horse-9"}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -sS "$BASE/auth/me" -H "Authorization: Bearer $TOKEN"
```

### 2.5 Lifecycle gaps (documented, not a recommendation)

There is **no** refresh endpoint, **no** logout/revocation endpoint, and **no** token
introspection endpoint. A token is valid until `exp`. Clients must treat a `401` on any
authenticated call as "session over" and route the user back to login. (The frontend
stores the token in `localStorage` under the key `jtracks_token`.)

### 2.6 Google OAuth path

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

---

## 3. Endpoint reference

Complete inventory — 15 operations:

| Method | Path | Auth | Rate limited |
|---|---|---|---|
| `GET` | `/health` | no | no |
| `POST` | `/auth/signup` | no | 3/hour |
| `POST` | `/auth/login` | no | 5/minute |
| `POST` | `/auth/oauth/google` | no | 10/minute |
| `GET` | `/auth/me` | **yes** | no |
| `GET` | `/applications` | **yes** | no |
| `POST` | `/applications` | **yes** | no |
| `POST` | `/applications/autofill` | **yes** | 10/minute |
| `GET` | `/applications/{app_id}` | **yes** | no |
| `PATCH` | `/applications/{app_id}` | **yes** | no |
| `DELETE` | `/applications/{app_id}` | **yes** | no |
| `GET` | `/settings` | **yes** | no |
| `PATCH` | `/settings` | **yes** | no |
| `GET` | `/dashboard/stats` | **yes** | no |
| `GET` | `/dashboard/recap` | **yes** | no |

Every authenticated endpoint can additionally return `401` (see §2.3); every
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

Create an email/password account and return a token. Rate limit **3/hour per client IP**.

Request body — [`SignupRequest`](#61-signuprequest):

| Field | Type | Required | Constraints |
|---|---|---|---|
| `email` | string | yes | RFC-valid email (`EmailStr`); stored lower-cased |
| `password` | string | yes | 8–256 characters |

> bcrypt truncates the password to its first 72 **bytes** when hashing. Characters beyond
> that do not contribute to the hash. This is silent, not an error.

| Status | Trigger | Body |
|---|---|---|
| `201` | Created | [`TokenResponse`](#63-tokenresponse) |
| `409` | Email already registered | `{"detail": "An account with this email already exists."}` |
| `422` | Validation failure | Validation-error list (§7.2) |
| `429` | Over 3/hour | `{"error": "Rate limit exceeded: 3 per 1 hour"}` |

```bash
curl -sS -X POST http://localhost:8000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"dana.reyes@example.com","password":"correct-horse-9"}'
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwYjU3NDY1OC04NGMyLTQ5YWItODA0Ni1iNjFiNThiODNjNTYiLCJpYXQiOjE3ODY0MTQyODAsImV4cCI6MTc4NzAxOTA4MCwiaXNzIjoianRyYWNrcyIsImF1ZCI6Imp0cmFja3MtYXBpIiwianRpIjoiNjE1OWIwY2VkN2U0NGZmY2JjYjViZjJhYjAxOGM4MjQifQ.0IP0q1CvxP1EikEFVoeiB2VzDnsZUPKuOj7DWnaRitc",
  "token_type": "bearer"
}
```

`409` example:

```json
{ "detail": "An account with this email already exists." }
```

#### `POST /auth/login`

Exchange email/password for a token. Rate limit **5/minute per client IP**.

Request body — [`LoginRequest`](#62-loginrequest):

| Field | Type | Required | Constraints |
|---|---|---|---|
| `email` | string | yes | RFC-valid email; matched case-insensitively |
| `password` | string | yes | 1–256 characters |

| Status | Trigger | Body |
|---|---|---|
| `200` | Authenticated | [`TokenResponse`](#63-tokenresponse) |
| `401` | Wrong password, unknown email, **or** an OAuth-only account with no password | `{"detail": "Incorrect email or password."}` |
| `422` | Validation failure | Validation-error list (§7.2) |
| `429` | Over 5/minute | `{"error": "Rate limit exceeded: 5 per 1 minute"}` |

All three `401` causes are indistinguishable in both body and response time (the
"no such user" and "OAuth-only" paths deliberately burn an equivalent bcrypt comparison),
so this endpoint cannot be used to enumerate registered addresses.

```bash
curl -sS -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dana.reyes@example.com","password":"correct-horse-9"}'
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwYjU3NDY1OC04NGMyLTQ5YWItODA0Ni1iNjFiNThiODNjNTYiLCJpYXQiOjE3ODY0MTQzNDAsImV4cCI6MTc4NzAxOTE0MCwiaXNzIjoianRyYWNrcyIsImF1ZCI6Imp0cmFja3MtYXBpIiwianRpIjoiOWYyM2NkMTFhNzQwNGY3NmI5MGE1YzhkM2UxMjA5YTQifQ.YV-1QaU1kZ8f8xW9m1x2Uj3aPq5vX0dK2mJ8rL7cQnE",
  "token_type": "bearer"
}
```

#### `POST /auth/oauth/google`

Exchange a Google ID token for a jTracks token. Rate limit **10/minute per client IP**.
Semantics in §2.6.

Request body — [`GoogleOAuthRequest`](#64-googleoauthrequest):

| Field | Type | Required | Constraints |
|---|---|---|---|
| `id_token` | string | yes | min length 1. The Google **ID token** (JWT) from Google Identity Services |

| Status | Trigger | Body |
|---|---|---|
| `200` | Verified; user found, linked or created | [`TokenResponse`](#63-tokenresponse) |
| `401` | Signature/audience/issuer invalid, expired, missing `sub`/`email`, `email_verified` false, **or** `GOOGLE_CLIENT_ID` unset | `{"detail": "Invalid Google credential."}` |
| `422` | Missing/empty `id_token` | Validation-error list (§7.2) |
| `429` | Over 10/minute | `{"error": "Rate limit exceeded: 10 per 1 minute"}` |

Note the status: a **new account created via Google returns `200`, not `201`**, unlike
`/auth/signup`.

```bash
curl -sS -X POST http://localhost:8000/auth/oauth/google \
  -H 'Content-Type: application/json' \
  -d '{"id_token":"eyJhbGciOiJSUzI1NiIsImtpZCI6IjkzNDFhYmM0In0.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJzdWIiOiIxMTUyOTQ4ODM3NDIxOTk0NDMyMTUiLCJlbWFpbCI6ImRhbmEucmV5ZXNAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWV9.SIGNATURE"}'
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhNzMxYzUwZi0yOWQ0LTRmNzQtOTBjYS0zZGYwYjMxNWE5MjQiLCJpYXQiOjE3ODY0MTQ0MDAsImV4cCI6MTc4NzAxOTIwMCwiaXNzIjoianRyYWNrcyIsImF1ZCI6Imp0cmFja3MtYXBpIiwianRpIjoiYzE3ZTU5ODJmNzNlNDU2Y2E5ZjcxMGRiZWZjNDAxMjMifQ.Kx3nT4v0Yb1sQeL8mP2rW9dH6uZ0aC5fJ7gN1oR3tSU",
  "token_type": "bearer"
}
```

#### `GET /auth/me`

Return the authenticated user's public profile.

Auth: **required**. No parameters, no body.

| Status | Trigger | Body |
|---|---|---|
| `200` | OK | [`UserPublic`](#65-userpublic) |
| `401` | Missing/invalid token (§2.3) | `{"detail": "Not authenticated"}` |

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

Ordering: `created_at` **descending**. **There is no pagination** — no `limit`, `offset`,
`page` or `cursor`. The full result set is returned in one array. No sort parameter.

| Status | Trigger | Body |
|---|---|---|
| `200` | OK | Array of [`ApplicationResponse`](#67-applicationresponse) (`[]` when empty) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `422` | `status` not a valid enum member | Validation-error list (§7.2) |

```bash
curl -sS "http://localhost:8000/applications?status=applied" \
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
    "status": "applied",
    "created_at": "2026-08-03T14:22:09",
    "updated_at": "2026-08-03T14:22:09"
  }
]
```

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
directly — including creating a row straight as `"ghosted"` or `"offer"` with no
`date_applied`. (Confirmed against the running app.)

| Status | Trigger | Body |
|---|---|---|
| `201` | Created | [`ApplicationResponse`](#67-applicationresponse) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `413` | Body > 1 MiB | `{"detail": "Request body too large."}` |
| `422` | Validation failure (missing `company`/`title`, `notes` > 10 000 chars, bad enum, bad date, …) | Validation-error list (§7.2) |

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
  "date_saved": "2026-08-10",
  "date_applied": null,
  "ghost_days_override": null,
  "notes": "Referred by Priya.",
  "id": "11af898b-640f-4a0f-8fe9-be3f1e385451",
  "user_id": "0b574658-84c2-49ab-8046-b61b58b83c56",
  "status": "saved",
  "created_at": "2026-08-11T02:11:21",
  "updated_at": "2026-08-11T02:11:21"
}
```

#### `GET /applications/{app_id}`

Fetch one application owned by the caller.

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
  "date_saved": "2026-08-10",
  "date_applied": null,
  "ghost_days_override": null,
  "notes": "Referred by Priya.",
  "id": "11af898b-640f-4a0f-8fe9-be3f1e385451",
  "user_id": "0b574658-84c2-49ab-8046-b61b58b83c56",
  "status": "saved",
  "created_at": "2026-08-11T02:11:21",
  "updated_at": "2026-08-11T02:11:21"
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

- If `status` is present and non-null, the transition is validated against the table in
  §6.10.
- If the new status is `applied` and the row will not have a `date_applied` afterwards,
  the server sets `date_applied` to today **before** validating, so `saved → applied`
  never fails for a missing date.
- A same-value status (e.g. `applied → applied`) is always allowed.

| Status | Trigger | Body |
|---|---|---|
| `200` | Updated | [`ApplicationResponse`](#67-applicationresponse) |
| `400` | Disallowed status transition | `{"detail": "Cannot move an application from 'saved' to 'offer'."}` |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `404` | No such row, or not the caller's | `{"detail": "Application not found"}` |
| `413` | Body > 1 MiB | `{"detail": "Request body too large."}` |
| `422` | Validation failure, incl. an unknown field | Validation-error list (§7.2) |

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
  "date_saved": "2026-08-10",
  "date_applied": "2026-08-10",
  "ghost_days_override": 21,
  "notes": "Referred by Priya.",
  "id": "11af898b-640f-4a0f-8fe9-be3f1e385451",
  "user_id": "0b574658-84c2-49ab-8046-b61b58b83c56",
  "status": "applied",
  "created_at": "2026-08-11T02:11:21",
  "updated_at": "2026-08-11T02:11:21"
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

Hard-delete an application. Not reversible; there is no soft-delete or archive.

Auth: **required**.

| Status | Trigger | Body |
|---|---|---|
| `204` | Deleted | *(empty)* |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `404` | No such row, or not the caller's | `{"detail": "Application not found"}` |
| `422` | `app_id` is not a valid UUID | Validation-error list (§7.2) |

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

```bash
curl -sS -X POST http://localhost:8000/applications/autofill \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.linkedin.com/jobs/view/3901234567"}'
```

```json
{
  "status": "unsupported",
  "url": "https://www.linkedin.com/jobs/view/3901234567"
}
```

Failed parse of a supported provider (**`200`, not an error status**):

```bash
curl -sS -X POST http://localhost:8000/applications/autofill \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://boards.greenhouse.io/northwind/jobs/9999999"}'
```

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

The only user-level setting is the global ghosting threshold.

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
from the breakdown, and from every rate.

#### `GET /dashboard/stats`

Auth: **required**.

Query parameters:

| Name | Type | Required | Default | Allowed values |
|---|---|---|---|---|
| `range` | string enum | no | `"all"` | `week`, `month`, `all` |

Window semantics (`today` = the current date in **UTC**):

| `range` | Window | Time-series buckets |
|---|---|---|
| `week` | `today - 6 days` … `today` (7 days inclusive) | Daily, **zero-filled** across the whole window → always exactly 7 points; `period` is an ISO date |
| `month` | `today - 29 days` … `today` (30 days inclusive) | Daily, zero-filled → always exactly 30 points; `period` is an ISO date |
| `all` | Unbounded | Monthly, **only months that have data** (not zero-filled); `period` is `"YYYY-MM"` |

| Status | Trigger | Body |
|---|---|---|
| `200` | OK | [`DashboardStats`](#617-dashboardstats) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `422` | `range` not in the enum | Validation-error list (§7.2) |

```bash
curl -sS "http://localhost:8000/dashboard/stats?range=week" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "range": "week",
  "total": 4,
  "status_breakdown": [
    { "status": "applied",      "count": 2, "percentage": 50.0 },
    { "status": "interviewing", "count": 1, "percentage": 25.0 },
    { "status": "offer",        "count": 0, "percentage": 0.0 },
    { "status": "rejected",     "count": 1, "percentage": 25.0 },
    { "status": "ghosted",      "count": 0, "percentage": 0.0 }
  ],
  "applications_over_time": [
    { "period": "2026-08-04", "count": 1 },
    { "period": "2026-08-05", "count": 0 },
    { "period": "2026-08-06", "count": 2 },
    { "period": "2026-08-07", "count": 0 },
    { "period": "2026-08-08", "count": 1 },
    { "period": "2026-08-09", "count": 0 },
    { "period": "2026-08-10", "count": 0 }
  ],
  "time_series_granularity": "day",
  "response_rate": 50.0,
  "ghost_rate": 0.0,
  "rejection_rate": 25.0,
  "avg_time_to_response_days": 4.5
}
```

Metric definitions (all rates are **percentages 0–100**, rounded to 1 decimal, and `0.0`
when `total` is 0 — never `null`):

| Metric | Definition |
|---|---|
| `total` | Count of submitted applications in the window |
| `status_breakdown[].percentage` | `count / total * 100`. The array always contains exactly the 5 non-`saved` statuses, in the fixed order `applied, interviewing, offer, rejected, ghosted`, including zero-count entries |
| `response_rate` | `(interviewing + offer + rejected) / total * 100` — a rejection counts as a response |
| `ghost_rate` | `ghosted / total * 100` |
| `rejection_rate` | `rejected / total * 100` |
| `avg_time_to_response_days` | Mean of `updated_at - date_applied` over responded rows, both read as **UTC** calendar dates; negatives discarded; rounded to 1 decimal. **`null`** when there are no responded rows. One caveat carried from the source: per-status-change history is not persisted, so `updated_at` is a proxy for "first move away from applied" and is disturbed by any later edit to the row |

#### `GET /dashboard/recap`

A shareable summary payload. Rendering into an image happens client-side; this endpoint
returns JSON only.

Auth: **required**.

Query parameters:

| Name | Type | Required | Default | Allowed values |
|---|---|---|---|---|
| `range` | string enum | no | `"week"` | `week`, `month` — **`all` is not accepted here** (`422`) |

| Status | Trigger | Body |
|---|---|---|
| `200` | OK | [`DashboardRecap`](#619-dashboardrecap) |
| `401` | Missing/invalid token | `{"detail": "Not authenticated"}` |
| `422` | `range` not `week`/`month` | Validation-error list (§7.2) |

`highlights` is an ordered list of pre-rendered display strings, not a stable keyed object.
The first five labels are always `Applications`, `Interviews`, `Offers`, `Response rate`,
`Ghost rate`; a sixth, `Avg. reply time`, appears **only** when
`avg_time_to_response_days` is non-null. `Interviews` = `interviewing + offer` counts.
`headline` is server-generated prose. Clients should render these as-is and not parse them.

```bash
curl -sS "http://localhost:8000/dashboard/recap?range=week" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "range": "week",
  "period_label": "This week",
  "period_start": "2026-08-04",
  "period_end": "2026-08-10",
  "total_applications": 4,
  "headline": "4 applications sent this week.",
  "highlights": [
    { "label": "Applications",  "value": "4" },
    { "label": "Interviews",    "value": "1" },
    { "label": "Offers",        "value": "0" },
    { "label": "Response rate", "value": "50%" },
    { "label": "Ghost rate",    "value": "0%" },
    { "label": "Avg. reply time", "value": "5 days" }
  ],
  "status_breakdown": [
    { "status": "applied",      "count": 2, "percentage": 50.0 },
    { "status": "interviewing", "count": 1, "percentage": 25.0 },
    { "status": "offer",        "count": 0, "percentage": 0.0 },
    { "status": "rejected",     "count": 1, "percentage": 25.0 },
    { "status": "ghosted",      "count": 0, "percentage": 0.0 }
  ]
}
```

`period_label` is `"This week"` for `range=week` and `"This month"` for `range=month` — it
is a fixed label, not a date range string.

---

## 4. Background behavior a client should know about

A daily in-process job (APScheduler with a **UTC** timezone,
`GHOSTING_JOB_HOUR`/`GHOSTING_JOB_MINUTE`, default 03:00 UTC; it also runs once
immediately at application boot) flips applications to `ghosted` **server-side, without
any client action**:

- Eligible statuses: `applied`, `interviewing` only. `offer` and `rejected` are terminal
  for this job and are never touched, nor is `saved`, nor already-`ghosted`.
- A row is overdue when `today >= date_applied + effective_days`, where `effective_days`
  is the row's `ghost_days_override` if set, otherwise the owning user's
  `ghost_days_default` (default 14).
- Idempotent; re-running finds nothing new.

Implication: an application's `status` can change between two client reads with no
intervening write from that client. A user can manually move a `ghosted` row back to any
other status (see §6.10).

---

## 5. Data model notes

| Concern | Behavior |
|---|---|
| Identifiers | `id` and `user_id` are UUIDs, serialized as canonical lowercase hyphenated strings |
| Dates (`date_*`) | ISO `YYYY-MM-DD`. Accepted on input in the same form |
| Timestamps (`created_at`, `updated_at`) | ISO 8601. The columns are `DateTime(timezone=True)`, but the observed serialization on SQLite is **offset-naive** (e.g. `"2026-08-11T02:11:21"`). Against PostgreSQL an offset is expected. **This is genuinely inconsistent across deployments — parse defensively and do not assume a `Z`/offset suffix is present.** |
| "Today" | Server-side defaults (`date_saved`, `date_applied`) and dashboard windows use the server's **local** date (`date.today()`), while `created_at`/`updated_at` come from the database's `now()`. These can disagree by a day near midnight |
| Deletion | Hard delete. Deleting a user cascades to their applications (DB-level `ON DELETE CASCADE`); there is no user-deletion endpoint |

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

| Field | Type | Always present | Notes |
|---|---|---|---|
| `access_token` | string | yes | The JWT (§2) |
| `token_type` | string | yes | Constant `"bearer"` |

No `expires_in`, no `refresh_token`, and **no user object** — call `GET /auth/me` for the
profile.

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
| `date_saved` | date \| null | no | ISO date | `null` | Server-defaults to today when `status == "saved"` and this is omitted |
| `date_applied` | date \| null | no | ISO date | `null` | Server-defaults to today when `status == "applied"` and this is omitted |
| `ghost_days_override` | integer \| null | no | 1 ≤ n ≤ 365 | `null` | `null` means "use the user's `ghost_days_default`", not "never ghost" |
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
| `date_applied` | string (date) | yes | Starts the ghosting clock |
| `ghost_days_override` | integer | yes | |
| `notes` | string | yes | |
| `created_at` | string (date-time) | no | See §5 re: offset |
| `updated_at` | string (date-time) | no | Bumped on any update, including a ghosting sweep |

### 6.8 `ApplicationStatus` enum

Read from `app/models/application.py`. Serialized as the lowercase string value.

| Value | Meaning |
|---|---|
| `"saved"` | Bookmarked, not yet applied to |
| `"applied"` | Application submitted; ghosting clock running |
| `"interviewing"` | In an interview process; ghosting clock still running |
| `"offer"` | Offer received (terminal for the ghosting job) |
| `"rejected"` | Rejected (terminal for the ghosting job) |
| `"ghosted"` | No response past the threshold; set automatically or manually |

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

Enforced **only on `PATCH`**, from `app/services/transitions.py`. A transition to the same
value is always allowed. Anything not listed is a `400`.

| From ↓ / To → | `saved` | `applied` | `interviewing` | `offer` | `rejected` | `ghosted` |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `saved` | — | yes | no | no | no | no |
| `applied` | no | — | yes | yes | yes | yes |
| `interviewing` | no | yes | — | yes | yes | yes |
| `offer` | no | no | yes | — | yes | no |
| `rejected` | no | yes | yes | no | — | no |
| `ghosted` | no | yes | yes | yes | yes | — |

Nothing can transition **back to `saved`**. Additional rule: any move **into `applied`**
requires the row to end up with a non-null `date_applied`; if the client does not supply
one, the server sets it to today, so in practice this never fails.

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
| `range` | string enum | no | Echoes the request: `week` \| `month` \| `all` |
| `total` | integer | no | Submitted applications in window (excludes `saved`) |
| `status_breakdown` | array of [`StatusBreakdownItem`](#618-statusbreakdownitem) | no | Always 5 entries, fixed order |
| `applications_over_time` | array of [`TimeSeriesPoint`](#6171-timeseriespoint) | no | See bucketing table in §3.6 |
| `time_series_granularity` | string enum | no | `"day"` \| `"week"` \| `"month"`. Only `"day"` (week/month range) and `"month"` (all range) are actually produced |
| `response_rate` | number | no | Percentage 0–100 |
| `ghost_rate` | number | no | Percentage 0–100 |
| `rejection_rate` | number | no | Percentage 0–100 |
| `avg_time_to_response_days` | number | **yes** | `null` when no responded rows |

#### 6.17.1 `TimeSeriesPoint`

| Field | Type | Notes |
|---|---|---|
| `period` | string | ISO date `YYYY-MM-DD` for daily buckets, `YYYY-MM` for monthly. The field is **not** named `date` |
| `count` | integer | Applications whose `date_applied` falls in this bucket |

### 6.18 `StatusBreakdownItem`

| Field | Type | Notes |
|---|---|---|
| `status` | `ApplicationStatus` | Only `applied`, `interviewing`, `offer`, `rejected`, `ghosted` ever appear |
| `count` | integer | |
| `percentage` | number | 0–100, share of `total`, 1 decimal |

### 6.19 `DashboardRecap`

| Field | Type | Notes |
|---|---|---|
| `range` | string enum | `week` \| `month` |
| `period_label` | string | `"This week"` or `"This month"` |
| `period_start` | string (date) | Inclusive |
| `period_end` | string (date) | Inclusive; always today |
| `total_applications` | integer | Same value as `DashboardStats.total` for the same range — note the **different field name** |
| `headline` | string | Server-generated display prose |
| `highlights` | array of [`RecapHighlight`](#6191-recaphighlight) | 5 or 6 entries, ordered |
| `status_breakdown` | array of `StatusBreakdownItem` | Identical to the stats breakdown |

#### 6.19.1 `RecapHighlight`

| Field | Type | Notes |
|---|---|---|
| `label` | string | Display label |
| `value` | string | Pre-formatted display string (e.g. `"50%"`, `"5 days"`), not a number |

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

```bash
curl -sS -X POST http://localhost:8000/applications \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Senior Backend Engineer"}'
```

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

Enum/literal query failure:

```json
{
  "detail": [
    {
      "type": "literal_error",
      "loc": ["query", "range"],
      "msg": "Input should be 'week', 'month' or 'all'",
      "input": "year",
      "ctx": { "expected": "'week', 'month' or 'all'" }
    }
  ]
}
```

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
| `200` | Most `GET`s, `POST /auth/login`, `POST /auth/oauth/google`, `POST /applications/autofill`, `PATCH` endpoints | Success | Endpoint's response model |
| `201` | `POST /auth/signup`, `POST /applications` | Created | `TokenResponse` / `ApplicationResponse` |
| `204` | `DELETE /applications/{app_id}` | Deleted | *(empty)* |
| `307` | Any canonical path requested with a trailing slash | Starlette redirect-slashes | *(empty; `Location` header)* |
| `400` | `PATCH /applications/{app_id}` | Disallowed status transition | `{"detail": "Cannot move an application from '…' to '…'."}` |
| `400` | Any `POST`/`PUT`/`PATCH` | Unparseable `Content-Length` header (body-size middleware) | `{"detail": "Invalid Content-Length header."}` |
| `401` | Every authenticated endpoint | Missing/malformed/expired/wrong-claims token, or no matching user | `{"detail": "Not authenticated"}` + `WWW-Authenticate: Bearer` |
| `401` | `POST /auth/login` | Bad credentials, unknown email, or OAuth-only account | `{"detail": "Incorrect email or password."}` |
| `401` | `POST /auth/oauth/google` | Google verification failed, unverified email, or `GOOGLE_CLIENT_ID` unset | `{"detail": "Invalid Google credential."}` |
| `404` | `/applications/{app_id}` (`GET`/`PATCH`/`DELETE`) | Row absent **or owned by another user** | `{"detail": "Application not found"}` |
| `404` | Any path | No route matches | `{"detail": "Not Found"}` |
| `404` | `/docs`, `/redoc`, `/openapi.json` | Non-development `ENVIRONMENT` | `{"detail": "Not Found"}` |
| `405` | Any path | Route exists, method does not | `{"detail": "Method Not Allowed"}` |
| `409` | `POST /auth/signup` | Email already registered | `{"detail": "An account with this email already exists."}` |
| `413` | Any `POST`/`PUT`/`PATCH` | Request body > `MAX_REQUEST_BODY_BYTES` (1 MiB) | `{"detail": "Request body too large."}` |
| `422` | Everywhere | Body/query/path validation failure | Validation-error **array** (§7.2) |
| `429` | Rate-limited endpoints (§8) | Per-IP budget exhausted | `{"error": "Rate limit exceeded: <limit>"}` |
| `500` | — | Unhandled server error. Not expected on any documented path; `POST /applications/autofill` in particular is written so parser failures can never produce one | FastAPI default |

`403` is never returned by this API.

**Not documented in the generated OpenAPI schema.** The auto-generated `/openapi.json`
lists only `200`/`201`/`204` and `422` per operation — it does not declare `400`, `401`,
`404`, `409`, `413` or `429`. Code generated from that schema will be missing every error
case above. Use this document, not the generated schema, for error handling.

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
| `POST /applications/autofill` | `RATE_LIMIT_AUTOFILL` | **10 per minute** |

No other endpoint is rate limited. In particular application CRUD and the dashboard have
no per-user or per-IP budget.

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
  families together — `_inject_headers` is a no-op when it is false. Verified against the
  running app.

Clients therefore have to infer the retry window from the limit string in the body, or
back off blindly. The security response headers from §9.3 are present on the `429`.

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

### 9.3 CORS

| Setting | Value |
|---|---|
| `allow_origins` | Explicit list from `CORS_ORIGINS` (default `http://localhost:5173,http://127.0.0.1:5173`). A `*` entry is **rejected at startup** — the app will not boot |
| `allow_credentials` | **`false`** |
| `allow_methods` | `GET, POST, PATCH, DELETE, OPTIONS` (no `PUT`, no `HEAD`) |
| `allow_headers` | `Authorization, Content-Type` (Starlette additionally echoes the CORS-safelisted `Accept`, `Accept-Language`, `Content-Language`) |
| `max_age` | `600` seconds |

Because credentialed CORS is off, a browser client **must** send
`Authorization: Bearer <token>` explicitly. Cookies, HTTP auth and client certs are never
attached cross-origin and the API does not read them. An unlisted origin is not reflected
in `Access-Control-Allow-Origin`.

Preflight (`OPTIONS`) is handled by the CORS middleware and returns `200`.

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

### 9.6 Configuration reference (settings that change API behavior)

| Variable | Default | Effect on the API surface |
|---|---|---|
| `ENVIRONMENT` | `development` | Gates `/docs`, `/redoc`, `/openapi.json`, HSTS, and JWT-secret strictness |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed browser origins; `*` rejected at startup |
| `JWT_SECRET` | (random per process in dev; **required** ≥32 chars elsewhere) | Token signing key |
| `JWT_ALGORITHM` | `HS256` | Token algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | Token lifetime |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `jtracks` / `jtracks-api` | Required `iss`/`aud` claims |
| `GOOGLE_CLIENT_ID` | `""` | Unset ⇒ `/auth/oauth/google` always `401` |
| `MAX_REQUEST_BODY_BYTES` | `1048576` | `413` threshold |
| `RATE_LIMIT_ENABLED` | `true` | Master switch for all four budgets |
| `RATE_LIMIT_SIGNUP` / `_LOGIN` / `_OAUTH` / `_AUTOFILL` | `3/hour`, `5/minute`, `10/minute`, `10/minute` | Per-IP budgets |
| `TRUST_PROXY_HEADERS` | `false` | Whether `X-Forwarded-For` identifies the rate-limit client |
| `AUTOFILL_TIMEOUT_SECONDS` | `8.0` | Outbound autofill timeout |
| `AUTOFILL_MAX_RESPONSE_BYTES` | `2097152` (2 MiB) | Outbound autofill response ceiling |
| `DEFAULT_GHOST_DAYS` | `14` | Fallback ghosting threshold |
| `GHOSTING_JOB_HOUR` / `_MINUTE` | `3` / `0` | When statuses may flip to `ghosted` server-side (cron in **UTC**; the overdue comparison uses the UTC date, so the two agree) |
| `RUN_SCHEDULER` | `true` | Whether this instance runs the ghosting sweep at all |

---

## 10. Verification

Everything in this document was derived from the source under
`C:\Users\elija\Documents\jTracks\backend\app\` and cross-checked two ways:

1. Against the assertions in `backend/tests/` — `test_auth.py`, `test_applications.py`,
   `test_isolation.py`, `test_settings.py`, `test_dashboard.py`, `test_autofill.py`,
   `test_health.py`, `test_security_regression.py`, `test_security_regression_medium.py`.
2. By executing the app in-process against a throwaway SQLite database and recording the
   actual status codes, headers and JSON bodies for every endpoint, including the
   `401`/`404`/`409`/`413`/`422`/`429` paths, the CORS preflight, the security headers,
   trailing-slash redirects, and mocked-upstream Greenhouse and Workday autofill results.

The complete operation inventory (15 operations) matches the generated OpenAPI paths
one-for-one.

---

## 11. Changelog / status

**v1 — 2026-08-10.** Initial specification of the jTracks backend API as implemented.
Documents 15 operations across health, auth, applications, autofill, settings and
dashboard.

**v1.1 — 2026-08-11.** No endpoint, field or status-code changes. Two corrections
following fixes in the backend:

- All server-derived dates now come from `app/core/clock.utc_today()` instead of the
  host's local calendar, so `date_applied`/`date_saved` defaults, the dashboard and recap
  windows, and the ghosting deadline are all on the same calendar as the stored
  timestamps. `avg_time_to_response_days` was previously off by a day on any non-UTC host;
  it is now exact.
- `POST /applications` no longer lists a `400`. The service's create path ran no
  transition validation, so the `TransitionError` mapping on that handler was unreachable;
  both have been removed. `400` on applications is now exclusively a `PATCH` response.

Known contract characteristics an integrator should plan around, all documented above
rather than fixed here:

- No URL or header versioning; changes to any shape are silent to clients.
- No pagination, sorting or filtering on `GET /applications` beyond `status`.
- Error envelope is inconsistent across statuses: `detail` as a string, `detail` as an
  array (`422`), and `error` as a string (`429`).
- The generated OpenAPI document omits every non-`2xx` response except `422`.
- No `Retry-After` or `X-RateLimit-*` headers accompany a `429`.
- `created_at`/`updated_at` timezone offset presence differs between the SQLite and
  PostgreSQL deployments.
- Status-transition rules apply to `PATCH` only, not to `POST /applications`.
- No token refresh or revocation; a leaked token is valid for its full 7 days.

> Note for frontend work: `frontend/src/types/api.ts` predates the real backend and no
> longer matches it (it models `AuthResponse` as carrying a `user` object, autofill results
> as `{unsupported: true}` / `{failed: true}` boolean flags, and `DashboardStats` with the
> field names `total_applications` / `avg_response_time_days` and rates as 0–1 fractions).
> This document reflects what the server actually returns; those types do not.
