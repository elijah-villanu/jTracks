"""Test configuration.

Sets DATABASE_URL to a throwaway SQLite file and disables the background
scheduler BEFORE importing the app (the DATABASE workstream's db/session.py
reads os.environ['DATABASE_URL'] at import time). Tables are recreated per test
for isolation.
"""
from __future__ import annotations

import os
import tempfile

# --- must run before any `app.*` import ---
_TMP_DB = os.path.join(tempfile.gettempdir(), "jtracks_test.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP_DB}")
os.environ["RUN_SCHEDULER"] = "false"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["GOOGLE_CLIENT_ID"] = "test-client-id.apps.googleusercontent.com"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401  (register tables)
from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402  (aliased: `import app.models` shadows a bare `app`)


@pytest.fixture(autouse=True)
def _fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client() -> TestClient:
    return TestClient(fastapi_app)


@pytest.fixture
def register(client: TestClient):
    """Sign up a user; return (token, headers)."""

    def _register(email: str = "user@example.com", password: str = "password123"):
        resp = client.post("/auth/signup", json={"email": email, "password": password})
        assert resp.status_code == 201, resp.text
        token = resp.json()["access_token"]
        return token, {"Authorization": f"Bearer {token}"}

    return _register


@pytest.fixture
def auth_headers(register):
    _token, headers = register()
    return headers
