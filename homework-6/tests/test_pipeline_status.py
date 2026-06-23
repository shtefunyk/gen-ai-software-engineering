import json
from pathlib import Path

import pipeline_status


def seed_results(results_dir: Path):
    results_dir.mkdir(parents=True, exist_ok=True)
    msg = {"data": {"transaction_id": "TXN001", "status": "approved", "reason": ""}}
    (results_dir / "TXN001.json").write_text(json.dumps(msg), encoding="utf-8")
    summary = {"total": 1, "counts": {"approved": 1}, "results": [msg["data"]],
               "generated_at": "2026-03-16T10:00:00Z"}
    (results_dir / "pipeline-summary.json").write_text(json.dumps(summary), encoding="utf-8")


def test_get_status_found(tmp_path):
    seed_results(tmp_path)
    assert pipeline_status.get_status(tmp_path, "TXN001")["status"] == "approved"


def test_get_status_not_found(tmp_path):
    seed_results(tmp_path)
    assert pipeline_status.get_status(tmp_path, "TXN999")["status"] == "not_found"


def test_list_results(tmp_path):
    seed_results(tmp_path)
    out = pipeline_status.list_results(tmp_path)
    assert out["total"] == 1
    assert out["results"][0]["transaction_id"] == "TXN001"


def test_summary_text(tmp_path):
    seed_results(tmp_path)
    text = pipeline_status.summary_text(tmp_path)
    assert "Total: 1" in text
    assert "approved" in text


def test_summary_text_missing(tmp_path):
    assert "No pipeline" in pipeline_status.summary_text(tmp_path)
