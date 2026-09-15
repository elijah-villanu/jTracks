"""Application configuration via pydantic-settings.

All values are read from environment variables (or a local `.env`). See
`.env.example` for the full documented list.
"""
from __future__ import annotations

import logging
import os
import secrets
from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("jtracks.config")

# Environments treated as "local, not internet-facing". Anything else (staging,
# production, ...) is held to the strict secret requirements below.
_DEV_ENVIRONMENTS = frozenset({"development", "dev", "local", "test", "testing"})

# Environment variables the Azure App Service runtime injects into every app
# (code and custom-container deployments alike). Their presence means "this
# process is internet-facing", whatever ENVIRONMENT claims.
_AZURE_APP_SERVICE_MARKERS = ("WEBSITE_INSTANCE_ID", "WEBSITE_SITE_NAME")

_VALID_SAMESITE = frozenset({"lax", "strict", "none"})

# Placeholder secrets that have appeared in this repo's docs/compose/history.
# They are public, so they are never acceptable outside development.
_WEAK_JWT_SECRETS = frozenset(
    {
        "dev-insecure-secret-change-me",
        "change-me-in-real-deployments",
        "change-me-to-a-long-random-string",
        "changeme",
        "secret",
        "test-secret",
    }
)

_JWT_SECRET_MIN_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        # SECURITY (pre-deploy audit): a failed startup validation otherwise
        # echoes the input dict — JWT_SECRET and DATABASE_URL (with its
        # password) included — into the container / App Service log stream.
        hide_input_in_errors=True,
    )

    # --- App ---
    APP_NAME: str = "jTracks API"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # --- Database ---
    # Production per PRD is PostgreSQL, e.g.
    #   postgresql+psycopg://user:pass@host:5432/jtracks
    # Dev/test default to SQLite so the app is runnable with no external service.
    DATABASE_URL: str = "sqlite:///./jtracks_dev.db"
    # Dev convenience: create tables from model metadata on startup.
    # SECURITY (audit M6): defaults to False so the *safe* state is the one you
    # get by omission. Alembic (DATABASE_TASKS D1) owns the schema; an operator
    # who forgets this variable should not get create_all() quietly building
    # tables next to the migrations. Set true locally (or in tests) on purpose.
    AUTO_CREATE_TABLES: bool = False

    # --- CORS ---
    # Comma-separated list of allowed origins for the browser frontend.
    # `*` is rejected by `_validate_cors_origins` — auth is a Bearer token, so a
    # wildcard would only ever widen who can drive the API from a browser.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Auth / JWT ---
    # SECURITY (audit H2): there is deliberately NO hardcoded default secret.
    #   * Outside development a strong secret MUST come from the environment or
    #     the app refuses to start (see `_validate_jwt_secret`).
    #   * In development an ephemeral random secret is generated per process, so
    #     no guessable signing key is ever shipped in source control. Tokens do
    #     not survive a restart locally — that is intentional.
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    # V2/R7.1 — two-token model. The access token is short-lived because it is
    # a bearer credential with no revocation path of its own; revocation lives
    # entirely on the refresh side. 30 minutes is the top of the PRD's 15-30
    # minute band, chosen so a working session rarely hits a mid-action refresh.
    #
    # SECURITY (pre-deploy audit): bounded. The access token cannot be revoked,
    # so an operator copying a stale V1 value (10080 = 7 days) into App
    # Settings would silently turn "logout" into "logout in a week".
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, ge=1, le=60)
    # Refresh lifetime. The PRD's band is 7-30 days; 14 is the middle. This is
    # an *absolute* session lifetime: R7.5 rotation hands each new token its
    # predecessor's expiry rather than a fresh 14 days, so a session that is
    # used constantly still ends 14 days after login.
    # Bounded to the PRD's upper limit (V2 audit L6).
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=14, ge=1, le=30)
    # R7.5 — how long a just-rotated refresh token is still honoured (with a
    # new access token but no new cookie) instead of being treated as reuse.
    # Covers two tabs whose refreshes were both sent with the old cookie. Every
    # second of it is also a second a thief racing the real user is not
    # detected, so keep it short; 0 disables the grace entirely.
    REFRESH_TOKEN_REUSE_GRACE_SECONDS: int = Field(default=30, ge=0, le=120)
    # Bound claims (audit L4). A token minted for some other service that
    # happens to share this secret won't validate here, and vice versa.
    JWT_ISSUER: str = "jtracks"
    JWT_AUDIENCE: str = "jtracks-api"

    # --- Refresh cookie (V2/R7.2, see docs/decisions/cookie-topology-samesite.md) ---
    REFRESH_COOKIE_NAME: str = "jtracks_refresh"
    # Scoped to /auth so the cookie is only ever attached to the two endpoints
    # that read it, which is also what confines the CSRF surface.
    REFRESH_COOKIE_PATH: str = "/auth"
    # `none` (not `lax`) because hosting is undecided and a cross-site
    # frontend/API split would make a Lax cookie silently never arrive. `none`
    # works in all three topologies. It requires `Secure` and, because the
    # cookie then travels on cross-site requests, the custom-header CSRF check
    # below.
    REFRESH_COOKIE_SAMESITE: str = "none"
    # Deliberately NOT conditional on ENVIRONMENT: a `Secure` flag that switches
    # itself off is how these ship insecure. Chrome and Firefox both accept
    # Secure cookies over http://localhost.
    REFRESH_COOKIE_SECURE: bool = True
    # CSRF defense for /auth/refresh and /auth/logout only. A cross-origin page
    # cannot set a custom header without a CORS preflight, and the preflight is
    # refused for any origin outside CORS_ORIGINS.
    REFRESH_CSRF_HEADER: str = "X-Refresh-Request"

    # --- Rate limiting (audit H4) ---
    # Per-client-IP budgets on the endpoints an attacker hammers. Disabled by
    # the test suite; see tests/conftest.py.
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_REFRESH: str = "30/minute"
    RATE_LIMIT_SIGNUP: str = "3/hour"
    RATE_LIMIT_OAUTH: str = "10/minute"
    RATE_LIMIT_AUTOFILL: str = "10/minute"
    # Enable when the API sits behind a reverse proxy — REQUIRED on Azure App
    # Service. There, every request reaches the app from the platform's front
    # end, so without this all clients share one rate-limit bucket and anyone
    # can lock the real user out of /auth/login (see app/core/rate_limit.py).
    TRUST_PROXY_HEADERS: bool = False
    # How many proxies in front of the app *append* to X-Forwarded-For. The
    # client IP is taken this many entries from the RIGHT, which is the only
    # position a client cannot forge. Azure App Service alone = 1; App Service
    # behind Front Door / Application Gateway = 2.
    TRUSTED_PROXY_HOPS: int = Field(default=1, ge=1, le=5)

    # --- Google OAuth ---
    # The Google OAuth 2.0 Web client ID that ID tokens are verified against.
    GOOGLE_CLIENT_ID: str = ""

    # --- Ghosting job / scheduler (see docs/decisions/scheduler-mechanism.md) ---
    # Run the in-process APScheduler in THIS instance. Set true on exactly one
    # instance when horizontally scaled; harmless (idempotent job) if multiple.
    RUN_SCHEDULER: bool = True
    GHOSTING_JOB_HOUR: int = 3          # local hour of the daily sweep
    GHOSTING_JOB_MINUTE: int = 0
    DEFAULT_GHOST_DAYS: int = 14        # fallback if a user row somehow lacks one

    # --- Request limits (audit M2) ---
    # Largest request body the API will accept. Every endpoint takes a small
    # JSON document; 1 MiB is generous. Without this, a single POST can carry
    # gigabytes straight into memory and the `notes` column.
    MAX_REQUEST_BODY_BYTES: int = 1024 * 1024

    # --- Autofill ---
    AUTOFILL_TIMEOUT_SECONDS: float = 8.0
    # Largest outbound autofill response we will buffer (audit M3). A timeout
    # bounds *seconds*, not *bytes* — a hostile (or merely broken) job board can
    # stream indefinitely inside 8s.
    AUTOFILL_MAX_RESPONSE_BYTES: int = 2 * 1024 * 1024
    AUTOFILL_USER_AGENT: str = (
        "Mozilla/5.0 (compatible; jTracksBot/1.0; +https://github.com/) "
        "AppleWebKit/537.36"
    )

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.strip().lower() in _DEV_ENVIRONMENTS

    @model_validator(mode="after")
    def _validate_jwt_secret(self) -> "Settings":
        """Fail closed on a missing/weak JWT signing key.

        A predictable secret means anyone can forge a token for any user id and
        walk straight past `get_current_user` — it defeats every per-user access
        control in the app, so this is enforced at startup rather than trusted
        to deployment discipline.
        """
        secret = (self.JWT_SECRET or "").strip()

        if self.is_development:
            if not secret:
                self.JWT_SECRET = secrets.token_urlsafe(48)
                logger.warning(
                    "JWT_SECRET not set; generated an ephemeral development "
                    "secret. Tokens are invalidated on restart. Set JWT_SECRET "
                    "in your environment to keep sessions stable."
                )
            return self

        if not secret:
            raise ValueError(
                "JWT_SECRET must be set when ENVIRONMENT is not a development "
                'environment. Generate one with: python -c "import secrets; '
                'print(secrets.token_urlsafe(48))"'
            )
        if secret.lower() in _WEAK_JWT_SECRETS:
            raise ValueError(
                "JWT_SECRET is a known placeholder value and is public in this "
                "repository's history. Generate a real random secret."
            )
        if len(secret) < _JWT_SECRET_MIN_LENGTH:
            raise ValueError(
                f"JWT_SECRET must be at least {_JWT_SECRET_MIN_LENGTH} "
                f"characters (got {len(secret)})."
            )
        return self

    @model_validator(mode="after")
    def _validate_cors_origins(self) -> "Settings":
        """Refuse a wildcard origin (audit L5).

        A `*` origin is only meaningful for a public, unauthenticated API. This
        one is authenticated, and if credentialed CORS is ever re-enabled the
        combination becomes "any website can drive this API as the logged-in
        user". Cheaper to make the misconfiguration unrepresentable.
        """
        if any(o == "*" for o in self.cors_origins_list):
            raise ValueError(
                "CORS_ORIGINS must be an explicit list of origins; '*' is not "
                "allowed on an authenticated API."
            )
        for origin in self.cors_origins_list:
            parts = urlsplit(origin)
            # An origin is scheme://host[:port] and nothing else. A trailing
            # slash or path never matches the browser's Origin header, so the
            # frontend silently loses the API — the usual "fix" for which is
            # reaching for '*'. Fail at startup instead.
            if (
                parts.scheme not in {"http", "https"}
                or not parts.hostname
                or parts.path
                or parts.query
                or parts.fragment
                or "@" in parts.netloc
            ):
                raise ValueError(
                    f"CORS_ORIGINS entry {origin!r} is not a bare origin; use "
                    "scheme://host[:port] with no path or trailing slash."
                )
            # SECURITY (pre-deploy audit): credentialed CORS to a plain-http
            # origin lets anyone on that network path inject script into the
            # "trusted" page and drive /auth/refresh with the user's cookie.
            # Loopback is exempt: it isn't reachable from another machine, and
            # the dev defaults must not make a production boot explode.
            if (
                not self.is_development
                and parts.scheme != "https"
                and parts.hostname not in {"localhost", "127.0.0.1", "::1"}
            ):
                raise ValueError(
                    f"CORS_ORIGINS entry {origin!r} must use https outside "
                    "development."
                )
        return self

    @model_validator(mode="after")
    def _validate_refresh_cookie(self) -> "Settings":
        """Make the cookie ADR's invariants unrepresentable (V2 audit M2).

        See docs/decisions/cookie-topology-samesite.md: `Secure` is
        unconditional and `Path` is what confines the CSRF surface. Both were
        env-overridable with no guard, and `SameSite=lax` + `Secure=false` is a
        combination browsers happily accept — the refresh token then rides any
        plain-http request to the API host.
        """
        samesite = self.REFRESH_COOKIE_SAMESITE.strip().lower()
        if samesite not in _VALID_SAMESITE:
            raise ValueError(
                "REFRESH_COOKIE_SAMESITE must be 'lax', 'strict' or 'none'."
            )
        self.REFRESH_COOKIE_SAMESITE = samesite
        if self.REFRESH_COOKIE_SECURE is not True:
            raise ValueError(
                "REFRESH_COOKIE_SECURE must stay true (see docs/decisions/"
                "cookie-topology-samesite.md). Chrome and Firefox accept Secure "
                "cookies over http://localhost, so local development does not "
                "need it relaxed."
            )
        path = self.REFRESH_COOKIE_PATH.rstrip("/")
        if not path.startswith("/") or not path.endswith("/auth"):
            raise ValueError(
                "REFRESH_COOKIE_PATH must be the auth router's prefix (e.g. "
                "'/auth'); a wider path sends the refresh token to every endpoint."
            )
        return self

    @model_validator(mode="after")
    def _refuse_development_mode_on_app_service(self) -> "Settings":
        """Fail closed when ENVIRONMENT is left at its dev default on Azure.

        `ENVIRONMENT` defaults to "development" so a fresh clone just runs. On
        an internet-facing App Service that default silently serves /docs and
        /openapi.json, drops HSTS, allows http CORS origins, and signs tokens
        with an ephemeral per-process secret — all at once, with no error.
        """
        if self.is_development and any(
            os.environ.get(marker) for marker in _AZURE_APP_SERVICE_MARKERS
        ):
            raise ValueError(
                "ENVIRONMENT is a development value but this process is running "
                "on Azure App Service. Set ENVIRONMENT=production (and a strong "
                "JWT_SECRET) in the App Service configuration."
            )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def docs_enabled(self) -> bool:
        """Serve /docs, /redoc and /openapi.json only in development (audit L1).

        The schema is a complete map of every endpoint, field and constraint —
        useful to a developer, and just as useful to someone probing the API.
        """
        return self.is_development

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
