# jTracks V2 — Security Audit

**Date:** 2026-08-21
**Scope:** Everything that changed on branch `v2-execute` between base `538ca76` and head `f7a7691` ("V2 Frontend + Backend + DB Tasks Executed"). Principally: the new cookie-based refresh-token auth system (`app/core/cookies.py`, `app/models/refresh_token.py`, `app/services/refresh_token_service.py`, `alembic/versions/0004_*`, `api/deps.py`, `api/routes/auth.py`, `core/security.py`, `core/config.py`, `main.py`), the new dashboard/range/recap/Sankey surface (`schemas/dashboard.py`, `services/dashboard_service.py`, `services/ranges.py`, `services/recap_service.py`, `services/transitions.py`, `services/ghosting.py`, `api/routes/dashboard.py`), the V2 status-enum migration (`0003`), the frontend token-handling rewrite (`lib/token-store.ts`, `lib/auth-context.tsx`, `lib/api-client.ts`), and V2 dependency additions.
**Not in scope:** V1 code untouched by this diff (audited and remediated in `v1/SECURITY_AUDIT.md`, 2026-07-25/28/29). The uncommitted move of `SECURITY_AUDIT.md` into `v1/` is a file move, not a code change, and is ignored here.
**Threat model:** Unchanged from V1 — solo-user portfolio project, open self-signup, public internet-facing API. The realistic adversary is an opportunistic attacker who can freely create an account, plus (new in V2, because a cookie now exists) any website the user happens to visit while logged in, and anyone with physical access to a browser the user believes they logged out of. Priorities: auth bypass, session-termination failure, cross-user data leakage, secret exposure.
**Method:** Full read of the diff and of the live code at `HEAD`; read of the governing ADR `docs/decisions/cookie-topology-samesite.md` and of `backend/API_SPEC_V2.md` to check implementation-vs-decision and implementation-vs-contract drift; the existing suite run to completion (**312 passed**); plus executable PoCs run against the live app. Every finding marked *Confirmed by PoC* was **demonstrated, not inferred**.

---

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| H1 | **High** | The frontend's logout omits the `X-Refresh-Request` header the backend requires → `403`, refresh token **never revoked**, cookie never cleared. "Log out" is a client-side illusion; the session is silently resumable for up to 14 days | 🔴 **OPEN** |
| M1 | Medium | No refresh-token rotation or reuse detection, **and** no cap on live sessions per user — a stolen refresh token is a 14-day credential with no natural expiry-by-use and no way for the user to reach the revoke path (H1) | 🟠 OPEN — partly a recorded PRD decision (R7.5), the session cap is not |
| M2 | Medium | Refresh-cookie hardening is env-overridable with no startup guard. `REFRESH_COOKIE_SECURE=false` is accepted and really emits a non-`Secure` cookie, contradicting the ADR's "`Secure` is unconditional" | 🟠 OPEN |
| M3 | Medium | Vulnerable dependencies: `react-router` 7.18.1 (high, direct prod dep), `nanoid`, `postcss`; backend `cryptography` 49.0.0 (PYSEC-2026-3552) | 🟠 OPEN |
| L1 | Low | `POST /auth/logout` is the one auth route with no rate limit — an unauthenticated endpoint that performs a DB write | 🟡 OPEN (documented as intentional in API_SPEC_V2 §4) |
| L2 | Low | The MSW dev mock for `/auth/logout` does **not** enforce the CSRF header its `/auth/refresh` sibling does — this is precisely what let H1 ship undetected | 🟡 OPEN |
| L3 | Low | `docker-compose.yml` publishes Postgres on `0.0.0.0:5433` with the credential pair `postgres`/`postgres` | 🟡 OPEN |
| L4 | Low | `VITE_ENABLE_MOCKS=true` in a production build re-enables MSW, whose `requireAuth` accepts **any** non-empty bearer token | 🟡 OPEN |
| L5 | Low | Access token stays valid up to 30 minutes after logout (no access-token revocation) | 🟡 Accepted-by-design; document it |
| L6 | Low | `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` accept absurd values (3650 days) with no bound; `resolve_range` guards a precondition with a bare `assert` | 🟡 OPEN |
| L7 | Low | Zero frontend tests exist. H1 is a frontend/backend contract break that any single test of `logout()` would have caught | 🟡 OPEN (process) |

**V1 conclusions that V2 changes:** "CSRF — not applicable" is **void**; a cookie now exists. Re-audited in full below (result: the defense is present and works, but see H1 for the contract break and M2 for the config foot-gun). "Per-user data isolation (IDOR)" was re-verified against the entirely new dashboard/recap/custom-range query path and **still holds**.

---

## HIGH

### H1 — Logout never revokes the refresh token: the frontend omits the CSRF header the backend requires

**Files:**
- `frontend/src/lib/auth-context.tsx:128-137` (the call)
- `frontend/src/lib/api-client.ts:155-169` (`rawFetch` — the headers it actually sends)
- `backend/app/api/deps.py:63-85` (`require_refresh_csrf_header`)
- `backend/app/api/routes/auth.py:153-177` (`logout`)
- `backend/API_SPEC_V2.md:496, 504, 528` (the documented contract)

**Endpoint:** `POST /auth/logout`

The backend requires `X-Refresh-Request` on both cookie-reading endpoints, exactly as the ADR prescribes, and rejects a request without it *before* touching any session state:

```python
# app/api/deps.py:84-85
if request.headers.get(settings.REFRESH_CSRF_HEADER) is None:
    raise _MISSING_CSRF_HEADER          # 403
```

`api-client.ts` knows this — `performRefresh()` sends the header explicitly:

```ts
// api-client.ts:86-93  — /auth/refresh: correct
const response = await fetch(buildUrl(REFRESH_PATH), {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json", "X-Refresh-Request": "1" },
})
```

But logout does not go through that path. It goes through the generic wrapper:

```ts
// auth-context.tsx:128-137
const logout = useCallback(async () => {
  try {
    await apiClient.post("/auth/logout")     // <-- no headers argument
  } finally {
    setAccessToken(null)
    setUser(null)                            // <-- UI says "logged out" regardless
  }
}, [])
```

and `rawFetch` sets only `Content-Type` and `Authorization` (`api-client.ts:163-167`). No `X-Refresh-Request` is ever attached, so **every logout the product can issue is rejected with `403`.**

The failure is completely silent to the user. The `finally` clears the in-memory token and `user`, `ProtectedRoute` reacts to `user === null` and redirects to `/login`, and the thrown `ApiError` only prevents the redundant `navigate()` on `AppLayout.tsx:57`. The UI is indistinguishable from a successful logout. Server-side, nothing happened: the `refresh_tokens` row still has `revoked_at IS NULL`, and no `Set-Cookie` deletion was emitted, so the httpOnly cookie stays in the browser.

**Exploit scenario.** The user finishes a session on a shared, borrowed, or library machine and clicks "Log out". The app returns them to the login screen. The refresh cookie is still in that browser, unexpired, and the DB row is still live. The next person to open the app triggers `AuthProvider.hydrate()` (`auth-context.tsx:51-68`), which calls `refreshAccessToken()` on boot → `POST /auth/refresh` with the surviving cookie → `200` and a fresh access token → `GET /auth/me` → **they are logged in as the previous user**, with full read/write access to every application, note and setting. The window is `REFRESH_TOKEN_EXPIRE_DAYS` = **14 days**, and because V2 deliberately has no rotation (M1) the token does not burn on use.

The same break also nullifies incident response: the refresh token is, by the service module's own words, "the only revocable credential in the system" (`refresh_token_service.py:6-12`). If the user suspects a leak, the one lever available to them does nothing.

**Confirmed by PoC** — the frontend's exact request replayed against the live app:

```
LOGOUT STATUS (frontend's exact headers): 403 {"detail":"This endpoint requires the 'X-Refresh-Request' header."}
Set-Cookie on logout response:            NONE
refresh rows: 1   revoked_at: [None]
REFRESH AFTER 'LOGOUT': 200  -> session still alive: True
cookie still in jar: True

# for contrast, the same call with the header:
logout WITH header: 204
refresh after correct logout: 401
```

This is a pure frontend/backend contract break, not a backend flaw. The backend behaves exactly as the ADR and `API_SPEC_V2.md` specify — the spec's own curl example (`API_SPEC_V2.md:528`) sends the header. `tests/test_auth_refresh.py` covers the backend side thoroughly, including `test_missing_csrf_header_on_logout_does_not_revoke`, which asserts *precisely this behaviour is correct*. Nothing tests what the frontend actually sends (L7), and the MSW mock for logout doesn't require the header (L2), so both halves of the system pass their own tests while disagreeing with each other.

**Recommended fix.** One line at the call site — the header must go on the request, not be assumed:

```ts
// frontend/src/lib/auth-context.tsx
const logout = useCallback(async () => {
  try {
    await apiClient.post("/auth/logout", undefined, {
      headers: { "X-Refresh-Request": "1" },
    })
  } finally {
    setAccessToken(null)
    setUser(null)
  }
}, [])
```

Better, make it structurally impossible to forget by hoisting the constant and applying it in `api-client.ts` to any path under `/auth/` that reads the cookie, alongside `REFRESH_PATH`:

```ts
const CSRF_HEADER = { "X-Refresh-Request": "1" } as const
const COOKIE_READING_PATHS = new Set(["/auth/refresh", "/auth/logout"])
// in rawFetch, before building headers:
const needsCsrf = COOKIE_READING_PATHS.has(new URL(path, API_BASE_URL).pathname)
```

Then close the two holes that hid it: make the MSW logout mock enforce the header exactly as its refresh sibling does (L2), and add a frontend test asserting `logout()` emits it.

> **Do not "fix" this on the backend by dropping the header requirement from logout.** The ADR is explicit (`cookie-topology-samesite.md:122-137`) that the check runs *before* logout's idempotency precisely so a cross-origin page cannot force-log-out the user, and it warns about someone removing the header "because it's annoying". The backend is right; the client is wrong.

---

## MEDIUM

### M1 — No rotation, no reuse detection, and no cap on concurrent sessions

**Files:** `backend/app/services/refresh_token_service.py:14-19, 60-76`, `backend/app/api/routes/auth.py:126-150`, `backend/app/core/config.py:87`

The no-rotation half is a **recorded decision** (PRD R7.5), documented at the top of the service module and asserted by `test_refresh_does_not_rotate_the_token`. It is not a bug and is not filed as one here. But its accepted consequence — "a stolen refresh token is usable until expiry or manual logout" — rests entirely on *manual logout working*, and per H1 it does not. Until H1 lands, M1's mitigating control does not exist and the practical statement is: **a stolen refresh token is usable for 14 days, full stop.**

The uncontrolled part is separate and not covered by R7.5: `_start_session()` issues a new row on every signup, login and OAuth exchange, and nothing ever prunes or caps them. Live tokens accumulate without bound, and revocation is strictly per-token (`revoke()` acts on the presented raw value only). `revoke_all_for_user()` exists at `refresh_token_service.py:127-147` but is deliberately not wired to any endpoint.

**Confirmed by PoC:**

```
rows after 1 signup + 15 logins: 16 | live (unrevoked): 16
oldest session still refreshable: 200
```

Sixteen simultaneously valid 14-day credentials for one account, the first still working after fifteen subsequent logins, with no user-facing way to see or revoke any but the current one.

**Recommended fix** (minimal, no API redesign):

1. Cap live tokens per user at issue time — revoke the oldest beyond, say, 10:

```python
def issue(db: Session, user: User) -> str:
    live = list(db.scalars(
        select(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .order_by(RefreshToken.created_at.desc())
    ).all())
    for stale in live[MAX_LIVE_SESSIONS - 1:]:
        stale.revoked_at = utc_now()
    ...
```

2. Consider shortening `REFRESH_TOKEN_EXPIRE_DAYS` from 14 to 7 — the PRD band permits it and it halves the worst-case window at the cost of a fortnightly re-login becoming a weekly one.

Rotation with reuse detection is the real answer and the service docstring already describes where it would slot in, but it is an R7.5-level product decision — route it to **api-architect** rather than changing it here.

### M2 — The refresh cookie's security attributes are env-overridable, contradicting the ADR

**Files:** `backend/app/core/config.py:93-111`, `backend/app/core/cookies.py:33-54`

The ADR is unambiguous (`cookie-topology-samesite.md:72-77`):

> **`Secure` is unconditional.** It is *not* switched off in development. […] A `Secure` flag that disables itself based on an environment variable is the standard way these end up shipping insecure.

The implementation encodes it as a pydantic-settings field, which means it is exactly the environment-variable-controlled flag the ADR warned against. `REFRESH_COOKIE_SECURE`, `REFRESH_COOKIE_SAMESITE` and `REFRESH_COOKIE_PATH` are all overridable, and unlike `JWT_SECRET` and `CORS_ORIGINS` — both of which have hard-failing `model_validator`s — none of them is validated at startup.

**Confirmed by PoC:**

```
ACCEPTED at startup: {'REFRESH_COOKIE_SECURE': False}
ACCEPTED at startup: {'REFRESH_COOKIE_SAMESITE': 'none', 'REFRESH_COOKIE_SECURE': False}
ACCEPTED at startup: {'REFRESH_COOKIE_PATH': '/'}
ACCEPTED at startup: {'REFRESH_TOKEN_EXPIRE_DAYS': 3650}

# and the cookie really is emitted without Secure:
Set-Cookie: jtracks_refresh=tok; HttpOnly; Max-Age=1209600; Path=/; SameSite=none
```

Severity is Medium rather than High because the *dangerous* combination needs two wrong values, not one: `SameSite=None` without `Secure` is rejected by every current browser, so that particular misconfiguration breaks the session rather than exposing it. The genuinely exploitable pairing is `REFRESH_COOKIE_SAMESITE=lax` **plus** `REFRESH_COOKIE_SECURE=false`, which browsers accept happily and which sends the refresh token in cleartext over any plain-HTTP request to the API host. Setting `REFRESH_COOKIE_PATH=/` is less severe than it first looks — only `/auth/refresh` and `/auth/logout` ever read the cookie, so widening the path broadens where the credential is *transmitted* (proxy logs, error handlers) without creating new CSRF surface.

**Recommended fix.** Make the ADR's invariant unrepresentable, in the same style as the existing `_validate_cors_origins`:

```python
@model_validator(mode="after")
def _validate_refresh_cookie(self) -> "Settings":
    samesite = self.REFRESH_COOKIE_SAMESITE.strip().lower()
    if samesite not in {"lax", "strict", "none"}:
        raise ValueError("REFRESH_COOKIE_SAMESITE must be 'lax', 'strict' or 'none'.")
    if not self.REFRESH_COOKIE_SECURE:
        raise ValueError(
            "REFRESH_COOKIE_SECURE must stay True; see "
            "docs/decisions/cookie-topology-samesite.md. Chrome and Firefox "
            "accept Secure cookies over http://localhost, so this does not "
            "need relaxing for local development."
        )
    if samesite == "none" and not self.REFRESH_COOKIE_SECURE:
        raise ValueError("SameSite=None requires Secure.")
    return self
```

Assert it in `tests/test_auth_refresh.py` next to `test_startup_still_fails_hard_on_a_wildcard_origin`, which is the pattern that has already proven it keeps a load-bearing invariant from quietly regressing.

### M3 — Vulnerable dependencies

**Frontend** (`npm audit`, production tree only — 1 moderate, 2 high; full tree is 10 across dev tooling):

| Package | Installed | Severity | Advisory | Fixed in |
|---|---|---|---|---|
| `react-router` | 7.18.1 (direct) | **high** | GHSA-qwww-vcr4-c8h2 — RSC-mode CSRF bypass, action executes before the `400` | 7.18.2 |
| `nanoid` | <3.3.18 | high | GHSA-2v37-7h3g-55p8 — infinite loop in custom generators at size 0 | 3.3.18 |
| `postcss` | ≤8.5.22 | moderate | GHSA-fxqj-rqcc-2cmp — `sourceMappingURL` reads arbitrary `.map` files | >8.5.22 |

`react-router` is the only one that matters much and only slightly: jTracks uses the plain SPA `BrowserRouter` (`frontend/src/main.tsx`), not RSC mode, so the advisory's code path is not reachable today. It is still a direct dependency on a **patch** bump — take it. Nothing in the V2-added dependency set (`d3-sankey` 0.12.3, `@types/d3-sankey`, `date-fns` 4.4.0, `react-day-picker` 10.0.1) carries any advisory.

The remaining seven (`hono`, `@hono/node-server`, `undici`, `ip-address`, `js-yaml`, `fast-uri`, `brace-expansion`) are dev/tooling-only transitives. Worth a `npm audit fix` pass but not a production exposure.

**Backend** (`pip-audit`): one finding, and it is a *new advisory against an unchanged pin*, not a V2 regression — the V1 audit's remediation log recorded a clean `pip-audit` on 2026-07-29.

| Package | Version | Advisory | Fixed in |
|---|---|---|---|
| `cryptography` | 49.0.0 | PYSEC-2026-3552 | 50.0.0 |

`cryptography` arrives transitively via `google-auth` (Google ID-token verification). Bump and re-run the suite.

---

## LOW

- **L1 — `POST /auth/logout` has no rate limit.** `backend/app/api/routes/auth.py:153` is the only route in `auth.py` without a `@limiter.limit` decorator; `API_SPEC_V2.md:497` documents this as intentional ("Not rate limited"). **Confirmed by PoC:** `40x POST /auth/logout status codes: {204}`, no `429`. It is an unauthenticated endpoint that performs an indexed lookup and a DB write per call. Low impact — the work per request is trivial and there is no oracle (all failure modes return `204`) — but it is free to close: `@limiter.limit(settings.RATE_LIMIT_REFRESH)`.

- **L2 — the MSW logout mock doesn't enforce the CSRF header its refresh sibling does.** `frontend/src/mocks/handlers/auth.ts:142-144` correctly rejects a headerless `/auth/refresh` with `403`; `:108-113` returns an unconditional `204` for `/auth/logout`. The mock is more permissive than the real backend on exactly the one endpoint where the client is wrong, which is the mechanism by which H1 shipped. Add the same three-line check.

- **L3 — compose publishes Postgres to all interfaces with `postgres`/`postgres`.** `backend/docker-compose.yml:6-11` now maps `"5433:5432"` with `POSTGRES_PASSWORD: postgres` (V2 changed this from `jtracks`/`jtracks` on 5432). Docker's default publish binds `0.0.0.0`, so on any shared/untrusted network the dev database is reachable with the single most-guessable credential pair in existence. Pre-existing in kind, but V2 made the password worse. Fix: `- "127.0.0.1:5433:5432"`, and source the password from the environment like `JWT_SECRET` already is at `:35`.

- **L4 — mocks can be forced on in a production build.** `frontend/src/mocks/index.ts` gates MSW on `import.meta.env.DEV`, but with an explicit `VITE_ENABLE_MOCKS === "true"` override that wins in any mode. MSW's `requireAuth` (`src/mocks/handlers/require-auth.ts`) accepts **any** non-empty bearer string, so a production build with that variable set is a complete auth bypass serving fixture data. Requires an operator mistake, so Low — but the override should be `import.meta.env.DEV && VITE_ENABLE_MOCKS === "true"`, never a standalone escape hatch.

- **L5 — the access token outlives logout.** Inherent to the two-token design: the access JWT has no revocation list (`jti` is minted but unused), so a correctly-performed logout still leaves the previously-issued bearer token valid for the remainder of its 30-minute window. **Confirmed by PoC:** after `logout → 204` and `refresh → 401`, `GET /auth/me` and `GET /applications` with the pre-logout token both return `200`. This is the accepted cost of stateless access tokens and 30 minutes is a reasonable bound — but it belongs in `API_SPEC_V2.md`'s logout section as an explicit statement, because "logout" reads as immediate.

- **L6 — unbounded lifetime settings, and one `assert` doing security-relevant work.** `ACCESS_TOKEN_EXPIRE_MINUTES=1000000` and `REFRESH_TOKEN_EXPIRE_DAYS=3650` are both accepted at startup (PoC 7); add `Field(gt=0, le=…)` bounds. Separately, `services/ranges.py:154` guards the custom-range precondition with a bare `assert`, which `python -O` strips — unreachable today because `RangeQuery` validates first, but a precondition worth keeping should be an explicit `raise`.

- **L7 — no frontend tests exist.** `find frontend/src -name "*.test.*"` returns nothing and `package.json` has no `test` script. The backend suite is genuinely strong (312 tests, including 30+ specifically on the refresh/cookie/CORS design), which makes the asymmetry the direct cause of H1: the contract is tested from one side only. A single test asserting the exact headers `logout()` emits would have caught it.

---

## Verified secure — no action required

Actively tested, not assumed. Several of these are V1 conclusions re-checked because V2 invalidated the reasoning behind them.

- **CSRF — the V1 "not applicable" no longer applies, and the replacement defense works.** V1 could say "no ambient credential exists"; V2 has a `SameSite=None` cookie, so that reasoning is dead. The replacement — a required custom header on the two cookie-reading endpoints plus a strict origin allowlist — is implemented as the ADR prescribes and is enforced on **both** endpoints (`routes/auth.py:131` and `:157` both `Depends(require_refresh_csrf_header)`). **Confirmed by PoC:**
  ```
  /auth/refresh: no-header cross-origin POST -> 403; preflight ACAO -> ABSENT
  /auth/logout:  no-header cross-origin POST -> 403; preflight ACAO -> ABSENT
  ```
  The header forces a preflight, the allowlist fails the preflight, and neither `<form>` POST nor `sendBeacon` can set a custom header. Note the whole design rests on `config.py:199-213` continuing to hard-fail on `CORS_ORIGINS=*`, which it does (`test_startup_still_fails_hard_on_a_wildcard_origin`) — with `allow_credentials=True` now set at `main.py:89`, that guard is load-bearing rather than advisory, exactly as the ADR states.
- **Cookie attributes match the ADR exactly.** `HttpOnly; Secure; SameSite=none; Path=/auth; Max-Age=1209600`, and `clear_refresh_cookie` repeats every one of them so the deletion targets the same cookie (`cookies.py:46-54`, asserted by `test_logout_clears_the_cookie_with_matching_attributes`). Set and clear live in one module for exactly this reason. The only gap is that nothing *enforces* those values against env override — M2.
- **Per-user data isolation (IDOR) on the entirely new dashboard surface — still correct.** `_fetch_submitted` (`dashboard_service.py:128-142`) filters on `Application.user_id == user_id` before any range predicate, and `compute_recap` reuses the same `collect()` pass rather than issuing its own query. Both routes take `current_user.id` from `get_current_user`, never from a request parameter — there is no user-addressable identifier anywhere in the V2 dashboard API. **Confirmed by PoC** across all four range/endpoint combinations including `custom`:
  ```
  /dashboard/stats  all     alice_total=1 mallory_total=0 leak_in_mallory_body=False
  /dashboard/stats  custom  alice_total=1 mallory_total=0 leak_in_mallory_body=False
  /dashboard/recap  all     alice_total=1 mallory_total=0 leak_in_mallory_body=False
  /dashboard/recap  custom  alice_total=1 mallory_total=0 leak_in_mallory_body=False
  mallory GET/PATCH/DELETE alice's app by id: 404 / 404 / 404
  ```
- **Refresh-token storage and shape — sound.** 48 bytes of `secrets.token_urlsafe` (`security.py:108-120`), opaque rather than a JWT so it leaks no user id, SHA-256 hashed before storage with the raw value returned exactly once (`refresh_token_service.py:60-76`). SHA-256 rather than bcrypt is the right call and is correctly justified: the input is CSPRNG output with no guessable keyspace, and a deterministic digest is what makes the unique index and single-fetch lookup possible. `test_the_cookie_value_is_not_what_is_stored` asserts it, and `test_response_body_never_contains_the_refresh_token` asserts the raw token never appears in a response body.
- **Credential-type confusion — blocked in both directions.** The access JWT carries `typ: "access"`, required at verification (`security.py:163-164`), so it cannot be replayed as a refresh cookie (`test_an_access_token_cannot_be_replayed_as_a_refresh_token`); the refresh token is opaque and never reaches `decode_access_token`. `iss`/`aud`/`sub`/`exp`/`iat` remain `require`d and the algorithm list stays a single explicit entry, so V1's alg-confusion conclusion survives V2 unchanged.
- **`validate()` checks all three conditions on every call** — existence, expiry, revocation, none cached (`refresh_token_service.py:88-108`) — and every failure mode returns one undifferentiated `401 "Invalid or expired session."`, so the endpoint is not an oracle for whether a token exists (`test_every_refresh_failure_gives_the_same_message`).
- **Logout is idempotent and single-session.** `204` for absent/malformed/unknown/already-revoked cookies, and it revokes only the presented token — a second device's session survives (`test_logout_only_revokes_the_presented_session`). The CSRF check correctly runs *before* the idempotency, so a headerless call is a `403` and not a silent forced logout.
- **Refresh tokens cascade on user deletion.** `ondelete="CASCADE"` on the FK (`models/refresh_token.py:21-25`, migration `0004`) plus the ORM relationship. **Confirmed by PoC:** deleting a user leaves `0` refresh rows — no orphaned credential outlives the account.
- **SQL injection — clean across all new code.** Every V2 query is a SQLAlchemy `select()`/`delete()` with bound parameters; the two new migrations use static SQL strings with no interpolation (`0003_v2_status_enum.py`, `0004_create_refresh_tokens_table.py`); `refresh_token_service._lookup` binds the hash, never the raw value. **Confirmed by PoC** — injection payloads in `range` and `start` are rejected at the schema boundary with `422` and the tables survive.
- **Input validation on the new range surface — good.** `range` is a `Literal`, `start`/`end` are `date`, and `RangeQuery._validate_custom_bounds` (`schemas/dashboard.py:38-56`) enforces both-present, ordered, and a 1–366-day span as a pydantic `422`. That day cap doubles as the bound on `iter_buckets`'s zero-fill loop, so there is no way to make the server materialize an unbounded series. **Confirmed by PoC:** reversed range `422`, five-year span `422`, malformed date `422`.
- **Error responses leak nothing.** **Confirmed by PoC** — bad `range`, bad date, bad UUID and a failed refresh all return structured pydantic/`detail` bodies with no traceback, no SQLAlchemy text, no file paths, no driver names.
- **Rate limiting still covers the endpoints that matter, including the new one.** **Confirmed by PoC:** login `5/min` → `429`, signup `3/hour` → `429`, and the new `/auth/refresh` `30/min` → `429`. Only logout is uncovered (L1).
- **Frontend access-token handling is a real improvement.** `token-store.ts` is a module-level variable — no `localStorage`, no JS-readable cookie — which removes V1's XSS exfiltration surface for the access token, and the refresh token is `HttpOnly` so script cannot read it at all.
- **Refresh-race handling is correct.** `api-client.ts:73, 117-124` implements a single-flight promise: concurrent `401`s share one `POST /auth/refresh` and the slot is cleared in `.finally` so a later `401` isn't stuck on a settled promise. The retry uses `rawFetch` rather than `apiFetch` so a second `401` cannot loop, and `isRefreshRequestPath` guards against a refresh-triggered-by-refresh cycle. `AuthProvider.hydrate()` deliberately joins the same single-flight path rather than duplicating the fetch.
- **Stored XSS — V1's conclusion holds.** The only `dangerouslySetInnerHTML` in the codebase remains `components/ui/chart.tsx:93`, and both V2-modified consumers still feed it static module-level literals (`status-breakdown-chart.tsx:33`, `applications-over-time-chart.tsx:16`). The new `sankey-chart.tsx` renders through React `<text>`/`<rect>` nodes with server-enumerated labels and no HTML sink.
- **Secret handling did not regress.** `docker-compose.yml:35` still uses `JWT_SECRET: ${JWT_SECRET:?…}`, `config.py:160-197` still fails closed outside development, and `git ls-files` tracks no `.env` or `*.db`. The `.gitignore` change is an addition (`.env.local`).
- **The scheduler addition is safe.** `purge_expired` runs in its own `try/except` inside the existing daily job (`ghosting_scheduler.py:31-39`) so neither task can suppress the other, and it deletes only rows past `expires_at` — revoked-but-unexpired rows are deliberately retained.

---

## Suggested remediation order

1. **H1** — send `X-Refresh-Request` on logout. *One line, and until it lands the product has no working session termination and M1's only mitigation does not exist.* Fix **L2** (the permissive mock) and add the frontend test (**L7**) in the same change, or it regresses.
2. **M2** — add the `_validate_refresh_cookie` startup guard so the ADR's "unconditional `Secure`" is actually unconditional, with a test alongside the CORS wildcard test.
3. **M1** — cap live sessions per user at issue time; consider `REFRESH_TOKEN_EXPIRE_DAYS` 14 → 7. Route rotation/reuse-detection to **api-architect** as an R7.5 revisit.
4. **M3** — `npm audit fix` (react-router 7.18.2 is a patch bump), bump `cryptography` to 50.0.0, re-run both suites.
5. **L1, L3, L4, L6** — rate-limit logout; bind compose Postgres to `127.0.0.1` and env-source its password; make the MSW override dev-only; bound the lifetime settings and replace the `assert`.
6. **L5** — document the 30-minute post-logout access-token window in `API_SPEC_V2.md` §4.

## Reproducing this audit

```bash
cd backend
.venv/Scripts/python -m pytest          # baseline: 312 passed
.venv/Scripts/python -m pip_audit       # 1 advisory: cryptography 49.0.0
cd ../frontend
npm audit --omit=dev                    # 1 moderate, 2 high
```

PoCs for H1, M1, M2, L1 and L5, plus the negative tests behind the "verified secure" claims for IDOR, injection, CSRF, cascade-delete and error-body leakage, were written and executed against the live app. They were kept outside the repository so no attack code is committed; the H1, M1 and M2 cases should be re-implemented as regression tests (asserting the attack is now *blocked*) as each fix lands — the same approach `tests/test_security_regression.py` took for V1.
