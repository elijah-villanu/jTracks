"""Application configuration via pydantic-settings.

All values are read from environment variables (or a local `.env`). See
`.env.example` for the full documented list.
"""
from __future__ import annotations

import logging
import secrets
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("jtracks.config")

# Environments treated as "local, not internet-facing". Anything else (staging,
# production, ...) is held to the strict secret requirements below.
_DEV_ENVIRONMENTS = frozenset({"development", "dev", "local", "test", "testing"})

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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    # Refresh lifetime. The PRD's band is 7-30 days; 14 is the middle. R7.5
    # explicitly declines rotation and reuse detection, so this number *is* the
    # worst-case window a stolen refresh token stays usable for if the user
    # never logs out. Halving 30 halves that window at the cost of a login
    # every fortnight.
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
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
    # Only enable behind a proxy you control, and make sure that proxy strips
    # inbound X-Forwarded-For. Otherwise clients spoof the header and evade
    # every limit above.
    TRUST_PROXY_HEADERS: bool = False

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
