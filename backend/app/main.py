"""B1 — FastAPI app factory: CORS, OpenAPI at /docs, routers, scheduler lifespan."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.routes import applications, auth, dashboard, health, settings as settings_route
from app.core.config import settings
from app.core.middleware import BodySizeLimitMiddleware, SecurityHeadersMiddleware
from app.core.rate_limit import limiter
from app.db.base import Base
from app.db.session import engine
from app.scheduler.ghosting_scheduler import shutdown_scheduler, start_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("jtracks")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev/test convenience only; production schema is owned by Alembic (D1).
    if settings.AUTO_CREATE_TABLES:
        # Import models so their tables are registered on Base.metadata.
        import app.models  # noqa: F401

        Base.metadata.create_all(bind=engine)
        logger.info("AUTO_CREATE_TABLES: ensured tables exist.")
    start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


def create_app() -> FastAPI:
    # SECURITY (audit L1): the interactive docs and the OpenAPI schema are a
    # complete inventory of endpoints, fields and validation rules. Handy in
    # development, a free reconnaissance map in production.
    docs_on = settings.docs_enabled
    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        docs_url="/docs" if docs_on else None,
        redoc_url="/redoc" if docs_on else None,
        openapi_url="/openapi.json" if docs_on else None,
        lifespan=lifespan,
    )

    # Rate limiting (audit H4). The @limiter.limit decorators on individual
    # routes need these registered on the app.
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # NOTE on ordering: `add_middleware` prepends, so the LAST one added is the
    # OUTERMOST. The intended nesting is
    #   SecurityHeaders -> CORS -> BodySizeLimit -> routes
    # so that a 413 from the body guard still carries CORS and security headers
    # (otherwise the browser reports an opaque network error instead of the
    # status), while the guard still runs before routing or pydantic reads a
    # single byte of the payload.
    app.add_middleware(
        BodySizeLimitMiddleware, max_body_bytes=settings.MAX_REQUEST_BODY_BYTES
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        # B29 / PRD R7.7 — credentialed CORS, reversing the MVP's deliberate
        # `False`. V1 could refuse credentials because the only credential was
        # an `Authorization: Bearer` header the browser never attaches on its
        # own. V2 adds a refresh cookie, which *is* an ambient credential, and
        # the browser will not send it cross-origin unless this is True.
        #
        # This makes `config.py`'s wildcard guard load-bearing rather than
        # advisory: the refresh cookie is `SameSite=None`, so it rides
        # cross-site requests, and the only things standing between it and any
        # website on the internet are this explicit origin allowlist and the
        # `X-Refresh-Request` header check on /auth/refresh and /auth/logout
        # (see api/deps.require_refresh_csrf_header). A `*` origin would defeat
        # both at once, which is why startup fails hard on it.
        #
        # Explicit method/header lists for the same reason: `*` is wider than
        # anything the frontend sends, and is not even legal alongside
        # credentialed CORS.
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        # `X-Refresh-Request` must be allow-listed or the preflight for
        # /auth/refresh and /auth/logout fails and the CSRF check can never be
        # satisfied by a legitimate browser client.
        allow_headers=[
            "Authorization",
            "Content-Type",
            settings.REFRESH_CSRF_HEADER,
        ],
        max_age=600,
    )
    app.add_middleware(SecurityHeadersMiddleware, hsts=not settings.is_development)

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(applications.router)
    app.include_router(settings_route.router)
    app.include_router(dashboard.router)
    return app


app = create_app()
