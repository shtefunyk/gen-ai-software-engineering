"""Sequential in-process orchestrator for the banking pipeline."""
from __future__ import annotations

import json
from pathlib import Path

from agents import base
from agents.compliance_checker import ComplianceChecker
from agents.fraud_detector import FraudDetector
from agents.transaction_validator import TransactionValidator

SUMMARY_NAME = "pipeline-summary.json"


class Pipeline:
    def __init__(self, base_dir) -> None:
        self.base = Path(base_dir)
        self.input = self.base / "input"
        self.processing = self.base / "processing"
        self.output = self.base / "output"
        self.results = self.base / "results"
        self.log_path = self.base.parent / "logs" / "audit.log"
        self.validator = TransactionValidator()
        self.fraud = FraudDetector()
        self.compliance = ComplianceChecker()

    def setup_dirs(self) -> None:
        for directory in (self.input, self.processing, self.output, self.results):
            directory.mkdir(parents=True, exist_ok=True)

    def clear(self) -> None:
        for directory in (self.input, self.processing, self.output, self.results):
            if directory.exists():
                for path in directory.glob("*.json"):
                    path.unlink()

    def load(self, transactions: list[dict]) -> None:
        for txn in transactions:
            base.write_message(self.input,
                               base.make_message(base.AGENT_INTEGRATOR, base.AGENT_VALIDATOR, dict(txn)))

    def run_stage(self, agent, src_dir: Path) -> None:
        for path, msg in base.read_messages_for(src_dir, agent.name):
            proc_path = self.processing / path.name
            path.rename(proc_path)
            result = agent.process_message(msg)
            data = result["data"]
            outcome = data.get("status") or f"-> {result['target_agent']}"
            base.audit_log(self.log_path, agent.name, data.get("transaction_id", ""), outcome)
            dest = self.results if result["target_agent"] == base.TARGET_RESULTS else self.output
            base.write_message(dest, result)
            proc_path.unlink()

    def summarize(self) -> dict:
        records = []
        for path in sorted(self.results.glob("*.json")):
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
        return {
            "generated_at": base.utc_now_iso(),
            "total": len(records),
            "counts": counts,
            "results": records,
        }

    def run(self, transactions: list[dict]) -> dict:
        self.setup_dirs()
        self.clear()
        self.load(transactions)
        self.run_stage(self.validator, self.input)
        self.run_stage(self.fraud, self.output)
        self.run_stage(self.compliance, self.output)
        summary = self.summarize()
        (self.results / SUMMARY_NAME).write_text(json.dumps(summary, indent=2), encoding="utf-8")
        return summary


def print_summary(summary: dict) -> None:  # pragma: no cover
    print("\n=== Pipeline Summary ===")
    print(f"Total: {summary['total']}")
    for status, count in sorted(summary["counts"].items()):
        print(f"  {status}: {count}")
    rejected = [r for r in summary["results"] if r["status"] in ("rejected", "needs_review", "blocked")]
    if rejected:
        print("\nFlagged / rejected:")
        for rec in rejected:
            print(f"  {rec['transaction_id']} [{rec['status']}] {rec['reason']}")


if __name__ == "__main__":  # pragma: no cover
    root = Path(__file__).resolve().parent
    txns = json.loads((root / "sample-transactions.json").read_text(encoding="utf-8"))
    result = Pipeline(root / "shared").run(txns)
    print_summary(result)
