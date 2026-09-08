import sys
from pathlib import Path

import httpx
import pytest

# Keeps `app` and `db` importable however pytest is invoked.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db as dbmod  # noqa: E402
from db import connection  # noqa: E402


@pytest.fixture
async def fresh_db(tmp_path, monkeypatch):
    """A freshly created, seeded database isolated to one test."""
    monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "finally.db"))
    dbmod.set_db_path(tmp_path / "finally.db")
    await dbmod.close_connection()
    await dbmod.init_db()
    yield dbmod
    await dbmod.close_connection()


@pytest.fixture
async def client(tmp_path, monkeypatch):
    """The real app against a throwaway database and a fast price tick."""
    monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "test.db"))
    connection.set_db_path(tmp_path / "test.db")
    await connection.close_connection()

    from app import config
    from app.main import app

    # The snapshot loop would otherwise fire mid-test and add rows the
    # assertions don't expect.
    monkeypatch.setattr(config, "SNAPSHOT_INTERVAL_SECONDS", 3600.0)

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as http_client:
            yield http_client
