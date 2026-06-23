import json
from pathlib import Path

from fastapi.testclient import TestClient

from api.app import create_app

SAMPLE = Path(__file__).resolve().parent.parent / "sample-transactions.json"


def client(tmp_path):
    return TestClient(create_app(base_dir=tmp_path))


def sample(idx):
    return json.loads(SAMPLE.read_text(encoding="utf-8"))[idx]


def test_health(tmp_path):
    assert client(tmp_path).get("/health").json() == {"status": "ok"}


def test_submit_valid_returns_verdict(tmp_path):
    r = client(tmp_path).post("/transactions", json=sample(0))  # TXN001
    assert r.status_code == 201
    assert r.json()["transaction_id"] == "TXN001"
    assert r.json()["status"] == "approved"


def test_submit_blocked_by_policy(tmp_path):
    r = client(tmp_path).post("/transactions", json=sample(4))  # TXN005, 75k wire
    assert r.json()["status"] == "blocked"


def test_submit_invalid_currency_is_rejected(tmp_path):
    r = client(tmp_path).post("/transactions", json=sample(5))  # TXN006, XYZ
    assert r.status_code == 201
    assert r.json()["status"] == "rejected"


def test_get_transaction_after_submit(tmp_path):
    c = client(tmp_path)
    c.post("/transactions", json=sample(0))
    r = c.get("/transactions/TXN001")
    assert r.status_code == 200
    assert r.json()["status"] == "approved"


def test_get_unknown_transaction_404(tmp_path):
    assert client(tmp_path).get("/transactions/NOPE").status_code == 404


def test_list_and_summary(tmp_path):
    c = client(tmp_path)
    c.post("/transactions", json=sample(0))
    c.post("/transactions", json=sample(4))
    assert c.get("/transactions").json()["total"] == 2
    assert c.get("/summary").json()["total"] == 2


def test_rules_endpoint_exposes_config(tmp_path):
    body = client(tmp_path).get("/rules").json()
    assert any(r["id"] == "high_value_wire_block" for r in body["rules"])


def test_malformed_payload_422(tmp_path):
    r = client(tmp_path).post("/transactions", json={"transaction_id": "X"})
    assert r.status_code == 422
