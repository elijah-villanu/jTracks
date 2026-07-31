# jTracks Backend & Database — Security Audit

**Date:** 2026-07-25
**Scope:** `backend/` — FastAPI app, services, SQLAlchemy models, Alembic migrations, Docker/compose config, dependencies
**Threat model:** Solo-user portfolio project with **open self-signup** and a public internet-facing API. The realistic adversary is an opportunistic attacker who can freely create an account, not a nation-state. Priorities are therefore: auth bypass, cross-user data leakage, SSRF into the hosting environment, and secret exposure.
**Method:** Code review of every route/service/model, plus executable exploit PoCs run against the live test app. Every finding marked *Confirmed by PoC* was **demonstrated, not inferred**.

---

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| H1 | **High** | SSRF: Workday autofill fetches an attacker-controlled host, plaintext, following redirects | ✅ **FIXED** 2026-07-28 |
| H2 | **High** | Weak default JWT secret in code + committed in `docker-compose.yml` → full auth bypass | ✅ **FIXED** 2026-07-28 |
| H3 | **High** | Google OAuth links accounts without checking `email_verified` → account takeover | ✅ **FIXED** 2026-07-28 |
| H4 | **High** | No rate limiting on `/auth/login` / `/auth/signup` → unlimited brute force | ✅ **FIXED** 2026-07-28 |
| M1 | Medium | Autofill host allowlist uses bare `endswith()` → domain-suffix confusion | ✅ **FIXED** (required by H1) |
| M2 | Medium | No request-body size cap; `notes` has no `max_length` → storage/memory DoS | ✅ **FIXED** 2026-07-29 |
| M3 | Medium | No response-size cap on outbound autofill fetch | ✅ **FIXED** 2026-07-29 |
| M4 | Medium | Vulnerable dependencies: `starlette` 0.41.3 (8 advisories), `ecdsa` 0.19.2 | ✅ **FIXED** 2026-07-29 |
| M5 | Medium | User enumeration: signup 409 + 538,000x login timing oracle | ✅ **FIXED** 2026-07-29 (timing; 409 kept deliberately) |
| M6 | Medium | No `.dockerignore` → `.env` / `live.db` baked into container image; `AUTO_CREATE_TABLES` defaults `True` | ✅ **FIXED** 2026-07-29 |
| L1–L6 | Low | Docs exposure, missing headers, URL-encoding, JWT claims, CORS hardening, gitignore hygiene | ✅ **FIXED** 2026-07-29 (L4 partial — see log) |

**Verified secure — no action needed:** SQL injection, per-user data isolation (IDOR), password hashing, JWT algorithm confusion, CSRF, server-side XSS. Details in the final section.

---

## HIGH

### H1 — Server-Side Request Forgery via the Workday autofill parser

**Files:** `app/services/autofill/workday.py:30-54`, `app/services/autofill/dispatcher.py:44-77`
**Endpoint:** `POST /applications/autofill`

`_build_cxs_url()` reconstructs the outbound URL from the **user-supplied scheme and netloc**:

```python
# workday.py:31-54
parts = urlsplit(url)
host = parts.netloc                     # <-- attacker controlled
tenant = host.split(".")[0]
...
return f"{parts.scheme}://{host}/wday/cxs/{tenant}/{site}/job/{path}"
#        ^^^^^^^^^^^^^ ^^^^^ both attacker controlled
```

The only gate is `matches()` (`workday.py:26-27`), a bare suffix test, and the fetching client is built with `follow_redirects=True` and no address filtering:

```python
# dispatcher.py:58-62
client = httpx.AsyncClient(
    timeout=settings.AUTOFILL_TIMEOUT_SECONDS,
    follow_redirects=True,          # <-- redirect into internal ranges
    headers={"User-Agent": settings.AUTOFILL_USER_AGENT},
)
```

**Exploit scenario.** The attacker registers an account (signup is open), then POSTs a URL on a domain they own that ends in `myworkdayjobs.com` — e.g. `notmyworkdayjobs.com`, which is registerable. They point its DNS at `169.254.169.254` (cloud metadata) or `127.0.0.1`, **or** serve a `302` to `http://169.254.169.254/latest/meta-data/iam/security-credentials/`, which the client will follow. The server issues the request from inside the trust boundary. Response bodies aren't returned verbatim, but status codes, timing, and successful/failed parses form a reliable blind-SSRF oracle for internal port scanning; a metadata endpoint returning JSON that happens to parse leaks directly.

**Confirmed by PoC** — the server really does emit the request:

```
OUTBOUND ATTEMPTS: ['CLIENT_follow_redirects=True',
 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/123?questions=false',
 'CLIENT_follow_redirects=True',
 'http://internal.notmyworkdayjobs.com/wday/cxs/internal/site/job/x']   <-- attacker host, plaintext

WORKDAY CXS URL: http://169-254-169-254.myworkdayjobs.com/wday/cxs/169-254-169-254/s/job/x
```

**Recommended fix** (all four parts are required; any one alone is bypassable):

1. **Exact-host allowlist**, not suffix matching — see M1.
2. **Force `https`**: build the CXS URL with a literal `https://` rather than `parts.scheme`.
3. **`follow_redirects=False`.** If redirects must be supported, follow them manually and re-validate each hop's host and resolved IP.
4. **Resolve-and-check the destination IP before connecting.** Reject any address in a private/loopback/link-local/reserved range:

```python
import ipaddress, socket

def _assert_public_host(host: str) -> None:
    for *_, sockaddr in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP):
        ip = ipaddress.ip_address(sockaddr[0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            raise ValueError(f"blocked non-public address {ip}")
```

Note this leaves a small DNS-rebinding window; for this project's blast radius, resolve-then-validate is proportionate. Pinning the resolved IP into the connection would close it fully.

> **Blast radius note:** the endpoint requires authentication (`applications.py:70`), but because signup is open and unthrottled (H4), this is effectively an unauthenticated SSRF.

---

### H2 — Weak default JWT secret, and a real secret committed to `docker-compose.yml`

**Files:** `app/core/config.py:41`, `docker-compose.yml:29`

```python
# config.py:41
JWT_SECRET: str = "dev-insecure-secret-change-me"
```
```yaml
# docker-compose.yml:29
JWT_SECRET: change-me-in-real-deployments
```

**Exploit scenario.** The app **boots happily with no `JWT_SECRET` set** — there is no startup validation. Any deployment that forgets the env var (or uses the committed compose file) signs tokens with a value published in this repo. An attacker reads the default from source and mints a token for any `sub` they like:

```python
jwt.encode({"sub": "<victim-uuid>"}, "dev-insecure-secret-change-me", algorithm="HS256")
```

`get_current_user` (`deps.py:34-41`) accepts it and loads the victim's `User` row. That is **complete authentication bypass and full cross-user data access** — it defeats the otherwise-correct per-user isolation.

**Confirmed by PoC:** `DEFAULT JWT SECRET: dev-insecure-secret-change-me`; a forged token verifies successfully.

**Recommended fix.** Fail closed at startup rather than defaulting:

```python
JWT_SECRET: str  # no default -> pydantic-settings errors if unset

@model_validator(mode="after")
def _validate_secret(self):
    weak = {"change-me-to-a-long-random-string", "change-me-in-real-deployments",
            "dev-insecure-secret-change-me"}
    if self.ENVIRONMENT != "development" and (self.JWT_SECRET in weak or len(self.JWT_SECRET) < 32):
        raise ValueError("JWT_SECRET must be a strong, non-placeholder value outside development")
    return self
```

Then remove the literal from `docker-compose.yml` (use `JWT_SECRET: ${JWT_SECRET:?set JWT_SECRET}` so compose refuses to start without it).

---

### H3 — Google OAuth account linking ignores `email_verified`

**Files:** `app/services/google_verify.py:54`, `app/services/auth_service.py:64-70`

The verifier extracts `email_verified` and then **nothing ever reads it**:

```
$ grep -rn "email_verified" app/
app/services/google_verify.py:21:    email_verified: bool
app/services/google_verify.py:54:        email_verified=bool(claims.get("email_verified", False)),
```

Meanwhile `upsert_google_user` links a Google identity onto an existing password account purely on an email-string match:

```python
# auth_service.py:64-70
user = get_user_by_email(db, email)
if user is not None:
    if user.google_id is None:
        user.google_id = google_id     # silent takeover of a password account
```

**Exploit scenario.** A victim signs up with `victim@corp.com` + password. An attacker who controls a Google identity asserting that address with `email_verified: false` (a Workspace tenant whose domain ownership was never verified, or a path where the claim is absent — the code defaults it to `False` and proceeds anyway) authenticates via `/auth/oauth/google`. The branch above attaches their `google_id` to the victim's row and issues them a token for **the victim's account**.

**Recommended fix.** Reject unverified emails at the boundary — one line, in `google_verify.py` after the claims check:

```python
if not bool(claims.get("email_verified", False)):
    raise GoogleVerificationError("Google account email is not verified.")
```

This is the minimal secure fix and matches the PRD's existing Google-OAuth decision. A fuller "explicit account-linking confirmation" flow (require the user to prove password ownership before attaching an OAuth identity) is an API/UX change worth routing to **api-architect** rather than doing here.

---

### H4 — No rate limiting on authentication endpoints

**File:** `app/api/routes/auth.py` (all routes); no limiter middleware anywhere in `app/main.py`

**Exploit scenario.** `/auth/login` accepts unlimited password guesses against a single account. `/auth/signup` accepts unlimited account creation (also the mass-enumeration oracle for M5, and the way an attacker gets the credential needed for H1). Nothing in the stack throttles: `grep -rn "limit\|throttle" app/main.py requirements.txt` returns nothing.

**Confirmed by PoC:** 30 consecutive failed logins → `LOGIN STATUS CODES OVER 30 ATTEMPTS: {401}`. No `429`, no lockout, no delay.

*Mitigating factor:* bcrypt at the configured cost takes ~544 ms per attempt (measured), capping online guessing at roughly 2/sec per worker — meaningful friction, but it is a CPU-exhaustion lever in its own right and no defence against a slow, distributed, targeted guess.

**Recommended fix.** Add `slowapi` (in-memory is fine at this scale):

```python
# main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```
```python
# auth.py
@router.post("/login", ...)
@limiter.limit("5/minute;30/hour")
def login(request: Request, payload: LoginRequest, ...):
```

Suggested budgets: `/auth/login` 5/min, `/auth/signup` 3/hour, `/auth/oauth/google` 10/min, `/applications/autofill` 10/min. Behind a proxy, configure `get_remote_address` to trust `X-Forwarded-For` only from your known proxy, or the limit is trivially evaded by header spoofing.

---

## MEDIUM

### M1 — Autofill host allowlist uses bare `endswith()` (domain-suffix confusion)

**Files:** `app/services/autofill/greenhouse.py:23-25`, `app/services/autofill/workday.py:26-27`

```python
return host.endswith("greenhouse.io")            # matches "evilgreenhouse.io"
return host.lower().rstrip(".").endswith("myworkdayjobs.com")  # matches "notmyworkdayjobs.com"
```

There is no dot boundary, so any attacker-registerable domain ending in those strings passes. **Confirmed by PoC:** `greenhouse.matches("boards.evilgreenhouse.io") is True`, `workday.matches("internal.notmyworkdayjobs.com") is True`. This is the gate that makes H1 reachable.

**Fix.** Match an exact host or a true subdomain:

```python
_ALLOWED = ("myworkdayjobs.com",)

def matches(host: str) -> bool:
    host = host.lower().rstrip(".")
    return any(host == d or host.endswith("." + d) for d in _ALLOWED)
```

Apply the same to Greenhouse (`boards.greenhouse.io`, `job-boards.greenhouse.io`, `boards-api.greenhouse.io`).

### M2 — No request-body size cap; `notes` has no length limit

**Files:** `app/schemas/application.py:22` and `:42` (`notes: str | None = None`), no size middleware in `app/main.py`

Every other string field is bounded (`company`/`title` 255, `job_url` 2048), but `notes` maps to an unbounded `Text` column with no `max_length`. **Confirmed by PoC:** a single `POST /applications` carrying a 5 MB `notes` value returned **201 Created**. Uvicorn/Starlette apply no default body cap, so an authenticated attacker fills the database and pins memory with a handful of requests.

**Fix.** Bound the field — `notes: str | None = Field(default=None, max_length=10_000)` in both `ApplicationBase` and `ApplicationUpdate` — and add a body-size guard middleware rejecting `Content-Length > ~1 MB` with `413`.

### M3 — No response-size cap on the outbound autofill fetch

**Files:** `app/services/autofill/greenhouse.py:53`, `workday.py:76`

`await client.get(...)` followed by `resp.json()` buffers the entire response. Paired with H1/M1, an attacker-controlled host can return a multi-gigabyte body and exhaust server memory — the 8 s timeout does not bound bytes received. **Fix:** stream and enforce a ceiling (e.g. 2 MB), aborting once exceeded, and check `Content-Type` is JSON before parsing.

### M4 — Vulnerable dependencies

`pip-audit` reports **15 advisories across 3 packages**:

| Package | Version | Advisories | Fixed in |
|---|---|---|---|
| `starlette` | 0.41.3 | PYSEC-2026-161, -248, -249, -1941, -1942, -2280, -2281 | 1.1.0 / 1.3.1 |
| `ecdsa` | 0.19.2 | PYSEC-2026-1325 (Minerva timing attack, P-256) | **no fix available** |
| `pip` | 25.3 | PYSEC-2026-196, -1796, -2875, -2876 | 26.1.2 |

Directly relevant: **PYSEC-2026-1942** (crafted `Range` header → quadratic-time CPU exhaustion) and **PYSEC-2026-1941** (large multipart upload blocks the event loop) are remotely triggerable DoS. **PYSEC-2026-249** (`request.form()` ignores `max_part_size` for urlencoded bodies) compounds M2.

The `starlette>=0.41,<0.42` pin in `requirements.txt` is what blocks remediation; the comment says it exists to keep `fastapi<0.116`. **Fix:** upgrade FastAPI and Starlette together and re-run the suite. For `ecdsa`, it arrives only via `python-jose[cryptography]` and this app uses **HS256** — the P-256 signing path is never exercised, so exposure is nil today; still, `pyjwt` is a lighter, better-maintained alternative that drops the dependency entirely.

### M5 — User enumeration (signup response + login timing oracle)

**Files:** `app/api/routes/auth.py:31-35`, `app/services/auth_service.py:42-46`

Two independent oracles:

1. `/auth/signup` returns `409 "An account with this email already exists."` — **Confirmed by PoC.**
2. `authenticate()` short-circuits when the user doesn't exist: `verify_password` returns `False` immediately for a `None` hash, skipping bcrypt entirely. The comment on line 44 calls this a *"Constant-ish path"* — **it is not.** Measured:

```
existing user (bcrypt runs): 543.61 ms
unknown user (no bcrypt):    0.0010 ms
ratio: 538230x
```

A half-second gap is detectable over any network, letting an attacker harvest valid addresses at will (and, with H4, then brute-force them).

**Fix.** Always perform a bcrypt comparison against a fixed dummy hash when the user is absent:

```python
_DUMMY_HASH = bcrypt.hashpw(b"x", bcrypt.gensalt()).decode()

def authenticate(db, email, password):
    user = get_user_by_email(db, email)
    if user is None:
        verify_password(password, _DUMMY_HASH)   # burn equivalent time
        raise InvalidCredentials()
    if not verify_password(password, user.hashed_password):
        raise InvalidCredentials()
    return user
```

The signup 409 is a deliberate UX trade-off; with rate limiting (H4) in place it is acceptable to keep — but it should be a conscious decision, not an accident.

### M6 — Container/deployment hygiene

- **No `.dockerignore`** while `Dockerfile:24` does `COPY . .`. The build context contains `live.db` (a real SQLite database with user rows and bcrypt hashes) and any local `.env`. Both get **baked into the image**, where anyone who can pull it reads them — `.gitignore` does not protect a Docker build context. **Fix:** add a `.dockerignore` covering `.env*`, `*.db`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `tests/`.
- **`AUTO_CREATE_TABLES: bool = True`** (`config.py:34`). The default is unsafe-open: an operator who forgets the env var gets `create_all()` silently constructing schema in production, bypassing the Alembic migrations that own it. `.env.example` and `docker-compose.yml` both correctly set `false`, but the code default should be `False` so the safe state is the one you get by omission.

---

## LOW

- **L1 — API docs public.** `docs_url="/docs"`, `openapi_url="/openapi.json"` (`main.py:40-41`) are unconditionally exposed, handing an attacker a complete endpoint/schema map. Gate on `settings.ENVIRONMENT == "development"`.
- **L2 — No security headers.** No HSTS, `X-Content-Type-Options`, `X-Frame-Options`, or CSP. Minor for a JSON-only API; add a small middleware for completeness.
- **L3 — Unencoded path interpolation into the Greenhouse API URL.** `greenhouse.py:53` formats `token` (regex `[^/]+`, so it may contain `?` or `#`) straight into the URL. The **host is hardcoded**, so this is *not* SSRF — the realistic impact is query/fragment injection into the request to Greenhouse's own API. Wrap with `urllib.parse.quote(token, safe="")`.
- **L4 — JWT claims are thin.** `security.py:42` sets only `sub`/`exp`/`iat` — no `iss`, `aud`, or `jti`, and a 7-day lifetime (`ACCESS_TOKEN_EXPIRE_MINUTES = 10080`) with no revocation path, so a stolen token is valid for a week. Acceptable at this scale; consider 24 h with refresh if tokens land in `localStorage`.
- **L5 — CORS hardening.** `main.py:45-51` uses an explicit origin list (good) with `allow_credentials=True` and `allow_methods/allow_headers=["*"]`. Because auth is a **Bearer** token, not cookies, credentialed CORS isn't actually needed — and nothing prevents someone setting `CORS_ORIGINS=*`, which combined with `allow_credentials=True` would be a serious misconfiguration. Add a validator rejecting `*` when credentials are enabled.
- **L6 — `.env.example` is gitignored** (`backend/.gitignore:14`). Inverted intent: the template is documentation and *should* be committed, while the real `.env` must not be. It currently sits untracked. Change to `.env` plus `!.env.example`.

---

## Verified secure — no action required

These were actively tested, not assumed:

- **SQL injection — clean.** Every query uses SQLAlchemy `select()` with bound parameters. `grep -rn "text(\|execute(\|f\"SELECT"` across `app/` returns exactly one hit, `ghosting.py:43`, which is `db.execute(stmt)` on a constructed `Select` object — parameterized, not string-built. No raw SQL anywhere, including migrations.
- **Per-user data isolation (IDOR) — correctly enforced at the query level.** `application_service.get_application()` (`:32-36`) filters on `Application.id == app_id AND Application.user_id == user_id`, so a foreign ID returns `None` → 404 rather than leaking existence. All list/dashboard/recap queries are scoped to `current_user.id`, and `/settings` reads and writes only `current_user`. `tests/test_isolation.py` exercises GET/PATCH/DELETE cross-user and the full suite (74 tests) passes. Note this control is entirely undone by H2 — fixing the JWT secret is what keeps it meaningful.
- **Password hashing — sound.** bcrypt with a per-password random salt (`security.py:22`); the 72-byte truncation at `:17-18` is handled deliberately and correctly, and `verify_password` fails closed on a `None` hash for OAuth-only accounts.
- **JWT algorithm confusion — not exploitable.** `decode_access_token` (`:49-51`) passes an explicit single-algorithm list, so `alg: none` and RS256→HS256 confusion are both rejected. Expiry is verified by `python-jose` by default.
- **Google ID-token verification — correct.** `verify_google_id_token` uses the official `google.oauth2.id_token.verify_oauth2_token`, which checks signature, audience, and expiry against Google's certs, with an explicit issuer re-check at `:43`, and it refuses to run when `GOOGLE_CLIENT_ID` is unset (`:27`). The one gap is the unused `email_verified` (H3).
- **CSRF — not applicable.** Auth is an `Authorization: Bearer` header via `HTTPBearer`, not cookies, so no ambient credential exists for a cross-site request to abuse. This stays true only while no cookie-based session is introduced.
- **Server-side XSS — not applicable.** The API returns JSON exclusively; there is no server-side HTML templating, and FastAPI/pydantic JSON-encode all user text. Escaping of stored `notes`/`company` and of third-party autofill output remains the frontend's responsibility (React escapes by default — the thing to avoid there is `dangerouslySetInnerHTML`).
- **Input validation — good coverage, one gap.** Pydantic enforces types and bounds server-side on every endpoint: `EmailStr`, password 8–256, `ghost_days_override`/`ghost_days_default` constrained `ge=1, le=365`, status restricted to an enum, dashboard `range` to a `Literal`, and `ApplicationUpdate` sets `extra="forbid"` (blocking mass-assignment of `user_id`/`id`). Path IDs are typed `uuid.UUID`, so malformed IDs 422 before reaching the DB. The sole gap is unbounded `notes` (M2).
- **Container runs as non-root** (`Dockerfile:27-28`).
- **No secrets committed.** `git ls-files` confirms no `.env` and no `*.db` are tracked; `live.db` and `.env` are untracked/ignored. `DATABASE_URL` is read from the environment (`db/session.py:7`, `alembic/env.py:24`). The compose credentials are local-dev-only Postgres values — but see H2 for the JWT secret and M6 for the image-layer exposure.

---

## Suggested remediation order

1. **H2** — require a strong `JWT_SECRET`, strip the literal from compose. *Highest impact, smallest change; without it every other access control is void.*
2. **H3** — one-line `email_verified` enforcement.
3. **H1 + M1 + M3** — fix the SSRF as one unit: exact-host allowlist, force `https`, `follow_redirects=False`, private-IP guard, response-size cap.
4. **H4** — rate limits on auth + autofill.
5. **M2, M5, M6** — `notes` cap and body-size guard; constant-time login; `.dockerignore` and `AUTO_CREATE_TABLES=False` default.
6. **M4** — upgrade FastAPI/Starlette together, re-run the suite, re-run `pip-audit`.
7. **L1–L6** — hardening pass.

## Reproducing this audit

```bash
cd backend
.venv/Scripts/python -m pytest -q          # baseline: 74 passed
.venv/Scripts/python -m pip_audit          # dependency advisories
```

Exploit PoCs for H1, H2, H4, M1, M2, M5 were written and executed against the live test app; all seven confirmed the vulnerability. They were kept outside the repository so no attack code is committed — they should be re-implemented as **regression tests** (asserting the attack is now *blocked*) as each fix lands.

---

## Remediation log — 2026-07-28

All four HIGH findings are **fixed and verified**. M1 was fixed as part of H1 (the exact-host
allowlist is step 1 of that fix and can't be separated from it).

**Files changed**

| File | Finding |
|---|---|
| `app/core/config.py` | H2 — no hardcoded secret; `_validate_jwt_secret` fails closed outside development, generates an ephemeral dev secret. Added rate-limit settings. |
| `docker-compose.yml`, `.env.example` | H2 — literal secret replaced with `${JWT_SECRET:?…}` / blank + generation instructions |
| `app/services/google_verify.py` | H3 — rejects `email_verified: false` at the boundary |
| `app/services/auth_service.py` | H3 — required `email_verified` arg on `upsert_google_user`, raises `UnverifiedEmail` |
| `app/services/autofill/net_guard.py` *(new)* | H1 — scheme/host/resolved-IP guard as an httpx request hook |
| `app/services/autofill/workday.py` | H1 — forces `https`, uses `.hostname` not `.netloc`, allowlist |
| `app/services/autofill/greenhouse.py` | M1 — dot-boundary allowlist |
| `app/services/autofill/dispatcher.py` | H1 — `follow_redirects=False`, guard hook, `blocked_host` result |
| `app/core/rate_limit.py` *(new)* | H4 — slowapi limiter keyed on peer IP |
| `app/main.py`, `routes/auth.py`, `routes/applications.py` | H4 — limiter wiring + per-endpoint budgets |
| `tests/test_security_regression.py` *(new)* | 38 tests re-running every PoC, asserting rejection |

**Verification:** `1 failed, 110 passed`. The single failure is
`test_dashboard.py::test_stats_all_range` (`assert 31.0 == 30.0`) — a **pre-existing,
date-sensitive** assertion that fails identically on the unmodified code at commit `3c27fe0`.
It is a test bug, not a regression, and is unrelated to security.

**Two implementation notes that differ from the recommendations above:**

1. **H2** was *not* implemented as `JWT_SECRET: str` with no default — that breaks local dev and
   the test suite, neither of which sets the variable. Instead the field defaults to `""` and a
   validator generates an ephemeral `secrets.token_urlsafe(48)` in development while hard-failing
   outside it. Same property (no guessable key in source), no breakage.
2. **`from __future__ import annotations` had to be removed** from `routes/auth.py` and
   `routes/applications.py`. slowapi's decorator wrapper carries its own `__globals__`, so FastAPI
   could not resolve the stringified annotations and silently demoted every request body to a
   query parameter (~35 tests failed with `loc: ["query","payload"]`). Both files now carry a
   comment explaining why the future-import must not be re-added.

**Still open at that point:** M2–M6 and L1–L6 — all closed on 2026-07-29, below.

- **PoC scripts** are at `%TEMP%/jtracks_sec/`. Now superseded by
  `tests/test_security_regression.py`; safe to delete.

---

## Remediation log — 2026-07-29 (M2–M6, L1–L6)

Every remaining finding is **fixed and verified**. `pip-audit` now reports
**"No known vulnerabilities found"** (was 15 advisories across 3 packages).

**Files changed**

| File | Finding |
|---|---|
| `app/core/middleware.py` *(new)* | M2 — `BodySizeLimitMiddleware` (413 above 1 MiB, incl. the chunked/no-`Content-Length` bypass); L2 — `SecurityHeadersMiddleware` |
| `app/schemas/application.py` | M2 — `notes` bounded to 10k chars in **both** `ApplicationBase` and `ApplicationUpdate` |
| `app/services/autofill/fetch.py` *(new)* | M3 — streaming `fetch_json` with a 2 MiB ceiling, `Content-Type` check, and a declared-`Content-Length` pre-check |
| `app/services/autofill/greenhouse.py` | M3 — uses `fetch_json`; L3 — `quote(token, safe="")` |
| `app/services/autofill/workday.py` | M3 — uses `fetch_json` |
| `requirements.txt` | M4 — `fastapi>=0.141`, `starlette>=1.3.1`, `python-jose` → `pyjwt>=2.10` |
| `app/core/security.py` | M4 — PyJWT instead of python-jose; M5 — `dummy_verify()`; L4 — `iss`/`aud`/`jti` claims, `require`d at verification |
| `app/services/auth_service.py` | M5 — `authenticate()` burns a bcrypt comparison on the unknown-user and OAuth-only paths |
| `.dockerignore` *(new)* | M6 — `.env*`, `*.db`, `.venv/`, `tests/`, `.git/` excluded from the build context |
| `app/core/config.py` | M6 — `AUTO_CREATE_TABLES` default `False`; L5 — `_validate_cors_origins` rejects `*`; L1 — `docs_enabled`; new `MAX_REQUEST_BODY_BYTES`, `AUTOFILL_MAX_RESPONSE_BYTES`, `JWT_ISSUER`, `JWT_AUDIENCE` |
| `app/main.py` | L1 — docs/redoc/openapi `None` outside development; L5 — `allow_credentials=False`, explicit method/header lists; middleware wiring |
| `.gitignore` | L6 — `.env`, `.env.*`, `!.env.example` |
| `.env.example`, `README.md` | documentation for all of the above |
| `tests/test_security_regression_medium.py` *(new)* | 42 tests re-running every M/L PoC and asserting rejection |

**Verification:** `1 failed, 152 passed`. The single failure is still
`test_dashboard.py::test_stats_all_range` (`assert 31.0 == 30.0`) — the same
**pre-existing, date-sensitive** test-bug that fails on unmodified code at `3c27fe0`.
Confirmed independently, in a real production-configured process:

```
env= production auto_create= False docs= False
health 200 {... 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
            'referrer-policy': 'no-referrer',
            'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            'strict-transport-security': 'max-age=31536000; includeSubDomains'}
docs 404 openapi 404
oversize signup -> 413 {"detail": "Request body too large."}
```

**Implementation notes that differ from the recommendations above**

1. **M4 was resolved by removing python-jose entirely, not by tolerating `ecdsa`.**
   `fastapi 0.141.1` + `starlette 1.3.1` install cleanly and the suite passes; the old
   `fastapi<0.116` ceiling was the only thing holding starlette at 0.41.3. `httpx` stays
   `<0.28`: starlette 1.3's TestClient emits a deprecation warning suggesting `httpx2` but
   still works, and httpx 0.27.2 has no advisories against it. **PyJWT replaced python-jose**,
   which is what actually removes `ecdsa`/PYSEC-2026-1325 (unfixable upstream) rather than
   accepting it as unreachable.
2. **M2 is enforced in two independent layers.** Middleware caps the raw body at 1 MiB
   *before* routing or pydantic sees it (and covers chunked requests by buffering with a
   ceiling, not by trusting `Content-Length`); `max_length=10_000` on `notes` catches
   anything that fits under the body cap. Middleware order is
   `SecurityHeaders → CORS → BodySizeLimit → routes` specifically so a 413 still carries CORS
   headers — otherwise the browser reports an opaque network error instead of the status.
3. **M5: only the timing oracle was closed.** The signup `409` is kept, as the audit
   suggested — it is a real UX benefit and, with H4's `3/hour` signup budget, harvesting
   addresses through it is no longer practical. That is now a recorded decision, not an
   oversight.
4. **L4 is partially addressed.** `iss`/`aud`/`jti` are added and *required* at verification
   (a token missing any of them, or carrying the wrong issuer/audience, is rejected — tested).
   The **7-day lifetime and the absence of revocation are unchanged**: shortening to 24 h
   without a refresh flow would log the user out daily, and adding refresh tokens is an
   API/UX design change that belongs to **api-architect**. `jti` is the hook a revocation list
   would hang off when that happens.
5. **Existing tokens are invalidated** by the new required claims. For a solo-user project
   that means one re-login; worth knowing before deploying.
6. **L2's CSP is skipped on `/docs`.** `default-src 'none'` would blank out Swagger UI, which
   loads from a CDN. Those routes only exist in development now (L1), and the exemption is
   asserted in a test so it can't silently widen.

**Checked, no change needed:** the frontend's only `dangerouslySetInnerHTML`
(`components/ui/chart.tsx:93`) is fed exclusively by static, developer-defined
`chartConfig` literals in `status-breakdown-chart.tsx` and
`applications-over-time-chart.tsx` — no user-supplied text reaches it, so the stored-XSS
concern noted in "Verified secure" still holds.
