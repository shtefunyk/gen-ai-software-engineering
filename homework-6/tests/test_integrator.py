import json
from pathlib import Path

from integrator import Pipeline

SAMPLE = Path(__file__).resolve().parent.parent / "sample-transactions.json"


def load_sample():
    return json.loads(SAMPLE.read_text(encoding="utf-8"))


def test_pipeline_processes_all_sample_transactions(tmp_path):
    summary = Pipeline(tmp_path).run(load_sample())
    assert summary["total"] == 8
    assert summary["counts"]["approved"] == 2
    assert summary["counts"]["needs_review"] == 3
    assert summary["counts"]["blocked"] == 1
    assert summary["counts"]["rejected"] == 2


def test_specific_dispositions(tmp_path):
    base_dir = tmp_path
    Pipeline(base_dir).run(load_sample())

    def status(tid):
        msg = json.loads((base_dir / "results" / f"{tid}.json").read_text(encoding="utf-8"))
        return msg["data"]["status"]

    assert status("TXN001") == "approved"
    assert status("TXN008") == "approved"
    assert status("TXN003") == "needs_review"
    assert status("TXN004") == "needs_review"
    assert status("TXN006") == "rejected"
    assert status("TXN007") == "rejected"
    assert status("TXN005") == "blocked"


def test_summary_file_is_written(tmp_path):
    Pipeline(tmp_path).run(load_sample())
    summary_path = tmp_path / "results" / "pipeline-summary.json"
    assert summary_path.exists()
    data = json.loads(summary_path.read_text(encoding="utf-8"))
    assert data["total"] == 8


def test_clear_removes_existing_files(tmp_path):
    p = Pipeline(tmp_path)
    p.setup_dirs()
    (p.input / "stale.json").write_text('{"target_agent":"x","data":{}}')
    p.clear()
    assert not list(p.input.glob("*.json"))


def test_process_one_returns_verdict(tmp_path):
    result = Pipeline(tmp_path).process_one(load_sample()[0])
    assert result["transaction_id"] == "TXN001"
    assert result["status"] == "approved"


def test_process_one_accumulates_results(tmp_path):
    p = Pipeline(tmp_path)
    p.process_one(load_sample()[0])   # TXN001 approved
    p.process_one(load_sample()[4])   # TXN005 blocked
    assert (tmp_path / "results" / "TXN001.json").exists()
    assert (tmp_path / "results" / "TXN005.json").exists()
