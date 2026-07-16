import pytest
from fastapi.testclient import TestClient

import database as db_module
from main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    # get_conn and init_db read DB_PATH at call time, so pointing it at a
    # temp file is enough to isolate each test's database.
    monkeypatch.setattr(db_module, "DB_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as c:
        yield c


# --- GET /api/board ---

def test_get_board_returns_five_columns(client):
    r = client.get("/api/board")
    assert r.status_code == 200
    assert len(r.json()["columns"]) == 5


def test_get_board_default_column_titles(client):
    cols = client.get("/api/board").json()["columns"]
    titles = [c["title"] for c in cols]
    assert titles == ["Backlog", "Discovery", "In Progress", "Review", "Done"]


def test_get_board_columns_ordered_by_position(client):
    positions = [c["position"] for c in client.get("/api/board").json()["columns"]]
    assert positions == sorted(positions)


def test_get_board_empty_cards_on_fresh_db(client):
    for col in client.get("/api/board").json()["columns"]:
        assert col["cards"] == []


# --- PATCH /api/columns/{id} ---

def test_rename_column(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    r = client.patch(f"/api/columns/{col_id}", json={"title": "Sprint 1"})
    assert r.status_code == 200
    assert r.json()["title"] == "Sprint 1"


def test_rename_column_persists(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    client.patch(f"/api/columns/{col_id}", json={"title": "Sprint 1"})
    cols = client.get("/api/board").json()["columns"]
    assert cols[0]["title"] == "Sprint 1"


def test_rename_column_not_found(client):
    assert client.patch("/api/columns/9999", json={"title": "X"}).status_code == 404


# --- POST /api/cards ---

def test_create_card(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    r = client.post("/api/cards", json={"column_id": col_id, "title": "Task A", "details": "Do it"})
    assert r.status_code == 201
    card = r.json()
    assert card["title"] == "Task A"
    assert card["details"] == "Do it"
    assert card["position"] == 0


def test_create_card_default_details(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    r = client.post("/api/cards", json={"column_id": col_id, "title": "No details"})
    assert r.status_code == 201
    assert r.json()["details"] == ""


def test_create_card_appended_at_end(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    client.post("/api/cards", json={"column_id": col_id, "title": "Card 1"})
    r = client.post("/api/cards", json={"column_id": col_id, "title": "Card 2"})
    assert r.json()["position"] == 1


def test_create_card_appears_in_board(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    client.post("/api/cards", json={"column_id": col_id, "title": "New task"})
    cards = client.get("/api/board").json()["columns"][0]["cards"]
    assert any(c["title"] == "New task" for c in cards)


def test_create_card_column_not_found(client):
    r = client.post("/api/cards", json={"column_id": 9999, "title": "X"})
    assert r.status_code == 404


# --- PATCH /api/cards/{id} ---

def _make_card(client, title="Card", details=""):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    return client.post("/api/cards", json={"column_id": col_id, "title": title, "details": details}).json()


def test_update_card(client):
    card = _make_card(client, "Old title", "Old details")
    r = client.patch(f"/api/cards/{card['id']}", json={"title": "New title", "details": "Updated"})
    assert r.status_code == 200
    assert r.json()["title"] == "New title"
    assert r.json()["details"] == "Updated"


def test_update_card_persists(client):
    card = _make_card(client)
    client.patch(f"/api/cards/{card['id']}", json={"title": "Persisted", "details": ""})
    cards = client.get("/api/board").json()["columns"][0]["cards"]
    assert any(c["title"] == "Persisted" for c in cards)


def test_update_card_not_found(client):
    r = client.patch("/api/cards/9999", json={"title": "X", "details": ""})
    assert r.status_code == 404


# --- DELETE /api/cards/{id} ---

def test_delete_card(client):
    card = _make_card(client)
    r = client.delete(f"/api/cards/{card['id']}")
    assert r.status_code == 200
    cards = client.get("/api/board").json()["columns"][0]["cards"]
    assert not any(c["id"] == card["id"] for c in cards)


def test_delete_renumbers_remaining(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    ids = [
        client.post("/api/cards", json={"column_id": col_id, "title": f"Card {i}"}).json()["id"]
        for i in range(3)
    ]
    client.delete(f"/api/cards/{ids[1]}")
    positions = [c["position"] for c in client.get("/api/board").json()["columns"][0]["cards"]]
    assert positions == [0, 1]


def test_delete_card_not_found(client):
    assert client.delete("/api/cards/9999").status_code == 404


# --- PATCH /api/cards/{id}/move ---

def test_move_card_same_column(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    ids = [
        client.post("/api/cards", json={"column_id": col_id, "title": f"Card {i}"}).json()["id"]
        for i in range(3)
    ]
    r = client.patch(f"/api/cards/{ids[0]}/move", json={"column_id": col_id, "position": 2})
    assert r.status_code == 200
    card_ids = [c["id"] for c in client.get("/api/board").json()["columns"][0]["cards"]]
    assert card_ids == [ids[1], ids[2], ids[0]]


def test_move_card_different_column(client):
    cols = client.get("/api/board").json()["columns"]
    col_a, col_b = cols[0]["id"], cols[1]["id"]
    card_id = client.post("/api/cards", json={"column_id": col_a, "title": "Mover"}).json()["id"]

    r = client.patch(f"/api/cards/{card_id}/move", json={"column_id": col_b, "position": 0})
    assert r.status_code == 200

    cols = client.get("/api/board").json()["columns"]
    a_cards = next(c["cards"] for c in cols if c["id"] == col_a)
    b_cards = next(c["cards"] for c in cols if c["id"] == col_b)
    assert not any(c["id"] == card_id for c in a_cards)
    assert b_cards[0]["id"] == card_id


def test_move_card_different_column_renumbers_source(client):
    cols = client.get("/api/board").json()["columns"]
    col_a, col_b = cols[0]["id"], cols[1]["id"]
    ids = [
        client.post("/api/cards", json={"column_id": col_a, "title": f"Card {i}"}).json()["id"]
        for i in range(3)
    ]
    client.patch(f"/api/cards/{ids[0]}/move", json={"column_id": col_b, "position": 0})
    positions = [c["position"] for c in client.get("/api/board").json()["columns"][0]["cards"]]
    assert positions == [0, 1]


def test_move_card_not_found(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    r = client.patch("/api/cards/9999/move", json={"column_id": col_id, "position": 0})
    assert r.status_code == 404


def test_move_card_column_not_found(client):
    card = _make_card(client)
    r = client.patch(f"/api/cards/{card['id']}/move", json={"column_id": 9999, "position": 0})
    assert r.status_code == 404
