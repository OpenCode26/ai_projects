import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient

from main import app


def test_ping():
    client = TestClient(app)
    response = client.get("/api/ping")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_static_serving():
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / "index.html").write_text(
            "<!doctype html><html><body>Kanban Studio</body></html>"
        )
        test_app = FastAPI()
        test_app.mount("/", StaticFiles(directory=tmp, html=True), name="static")
        client = TestClient(test_app)
        response = client.get("/")
        assert response.status_code == 200
        assert b"Kanban Studio" in response.content
