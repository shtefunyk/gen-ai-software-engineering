"""Pure query logic over pipeline results (no MCP / transport dependency)."""
from __future__ import annotations

import json
from pathlib import Path

SUMMARY_NAME = "pipeline-summary.json"


def get_status(results_dir, transaction_id: str) -> dict:
    path = Path(results_dir) / f"{transaction_id}.json"
    if not path.exists():
        return {"transaction_id": transaction_id, "status": "not_found"}
    data = json.loads(path.read_text(encoding="utf-8"))["data"]
    return {
        "transaction_id": transaction_id,
        "status": data.get("status"),
        "reason": data.get("reason", ""),
    }


def list_results(results_dir) -> dict:
    results_dir = Path(results_dir)
    records = []
    for path in sorted(results_dir.glob("*.json")):
        if path.name == SUMMARY_NAME:
            continue
        data = json.loads(path.read_text(encoding="utf-8"))["data"]
        records.append({
            "transaction_id": data.get("transaction_id"),
            "status": data.get("status"),
            "reason": data.get("reason", ""),
        })
    counts: dict[str, int] = {}
    for rec in records:
        counts[rec["status"]] = counts.get(rec["status"], 0) + 1
    return {"total": len(records), "counts": counts, "results": records}


def summary_text(results_dir) -> str:
    path = Path(results_dir) / SUMMARY_NAME
    if not path.exists():
        return "No pipeline run found. Run the pipeline first."
    data = json.loads(path.read_text(encoding="utf-8"))
    lines = [f"Pipeline run at {data.get('generated_at', 'unknown')}",
             f"Total: {data['total']}"]
    for status, count in sorted(data.get("counts", {}).items()):
        lines.append(f"  {status}: {count}")
    return "\n".join(lines)
