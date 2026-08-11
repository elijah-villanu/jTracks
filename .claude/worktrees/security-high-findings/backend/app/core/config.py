"""Application configuration via pydantic-settings.

All values are read from environment variables (or a local `.env`). See
`.env.example` for the full documented list.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    # Dev/test convenience: create tables from model metadata on startup.
    # MUST be false in production, where Alembic (DATABASE_TASKS D1) owns schema.
    AUTO_CREATE_TABLES: bool = True

    # --- CORS ---
    # Comma-separated list of allowed origins for the browser frontend.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Auth / JWT ---
    JWT_SECRET: str = "dev-insecure-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

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

    # --- Autofill ---
    AUTOFILL_TIMEOUT_SECONDS: float = 8.0
    AUTOFILL_USER_AGENT: str = (
        "Mozilla/5.0 (compatible; jTracksBot/1.0; +https://github.com/) "
        "AppleWebKit/537.36"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
