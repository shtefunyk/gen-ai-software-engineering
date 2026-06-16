"""Run the test suite with coverage and block if below the gate."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

THRESHOLD = 80.0
ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    cov_json = ROOT / "coverage.json"
    if cov_json.exists():
        cov_json.unlink()
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "--cov", "--cov-report", "json:coverage.json", "-q"],
        cwd=ROOT,
    )
    if not cov_json.exists():
        print("Coverage report not produced; failing closed.", file=sys.stderr)
        return 1
    pct = json.loads(cov_json.read_text(encoding="utf-8"))["totals"]["percent_covered"]
    print(f"Coverage: {pct:.2f}% (gate {THRESHOLD:.0f}%)")
    if proc.returncode != 0:
        print("Tests failed; blocking.", file=sys.stderr)
        return proc.returncode
    if pct < THRESHOLD:
        print(f"BLOCKED: coverage {pct:.2f}% < {THRESHOLD:.0f}% gate.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
