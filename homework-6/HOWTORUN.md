# How to Run — Homework 6

All commands run from the `homework-6/` directory.

1. Create the virtualenv and install dependencies:
   ```bash
   python3 -m venv .venv
   .venv/bin/python -m pip install -r requirements.txt
   ```
2. Validate transactions only (dry-run):
   ```bash
   .venv/bin/python -m agents.transaction_validator --dry-run
   ```
3. Run the full pipeline:
   ```bash
   .venv/bin/python integrator.py
   ```
   Results appear in `shared/results/` (+ `pipeline-summary.json`).
4. Run the tests with coverage:
   ```bash
   .venv/bin/python scripts/coverage_gate.py
   ```
   Expected: coverage ≥ 90%, exit code 0.
5. MCP servers: configured in `mcp.json` (context7 + pipeline-status). Launch Claude Code from
   `homework-6/` to load them; call `get_transaction_status` / `list_pipeline_results` or read
   `pipeline://summary`.
6. Slash commands (run Claude Code from `homework-6/`): `/run-pipeline`, `/validate-transactions`,
   `/write-spec`, `/generate-pipeline`, `/write-tests`, `/write-docs`.
7. Coverage gate hook: attempting `git push` with coverage < 80% is blocked by the PreToolUse hook
   (and the git pre-push hook if installed via `git config core.hooksPath homework-6/.githooks`).
8. REST API gateway:
   ```bash
   .venv/bin/python -m uvicorn api.app:app --port 8077
   ```
   - `GET  /health`
   - `POST /transactions` — submit one transaction, returns the verdict (201)
   - `GET  /transactions/{id}` — status for one transaction (404 if unknown)
   - `GET  /transactions` — list all results
   - `GET  /summary` — pipeline summary
   - `GET  /rules` — currently loaded rules
   - `GET  /docs` — Swagger UI

   Example:
   ```bash
   curl -s -X POST http://127.0.0.1:8077/transactions \
     -H 'Content-Type: application/json' \
     -d '{"transaction_id":"TXN001","timestamp":"2026-03-16T09:00:00Z","source_account":"ACC-1001","destination_account":"ACC-2001","amount":"1500.00","currency":"USD","transaction_type":"transfer","metadata":{"country":"US"}}'
   ```
9. One-shot demo (zero manual steps): `./demo/demo.sh`
10. Configurable rules live in `config/rules.yaml`. Edit a rule (e.g. lower the
    `high_value_wire_block` threshold) and re-run to see dispositions change.
