# jTracks backend (FastAPI). See docs/decisions/scheduler-mechanism.md — the
# daily ghosting job runs in-process via APScheduler, so a single container runs
# the whole backend (no separate worker/broker).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps: build tools for psycopg / cryptography wheels if needed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Install deps first for layer caching. Uncomment psycopg in requirements.txt
# for a Postgres deployment.
COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && pip install "psycopg[binary]>=3.2"

COPY . .

# Non-root runtime user.
RUN useradd -m appuser
USER appuser

EXPOSE 8000

# In production, schema is owned by Alembic (DATABASE_TASKS D1). Run migrations
# then boot the API. AUTO_CREATE_TABLES should be false in prod.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
