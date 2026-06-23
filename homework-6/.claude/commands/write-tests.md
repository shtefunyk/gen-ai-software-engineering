---
description: Agent 3 — generate the pytest suite targeting >= 90% coverage
---
Generate tests under homework-6/tests/ covering each agent and the full pipeline:
- unit tests per agent (validator, fraud detector, compliance checker)
- 1 integration test running sample-transactions.json end-to-end
- isolate from real shared/ using tmp_path

Run `.venv/bin/python scripts/coverage_gate.py` and ensure coverage >= 80% (aim >= 90%).
