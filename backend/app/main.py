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
    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        docs_url="/docs",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # Rate limiting (audit H4). The @limiter.limit decorators on individual
    # routes need these registered on the app.
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(applications.router)
    app.include_router(settings_route.router)
    app.include_router(dashboard.router)
    return app


app = create_app()
