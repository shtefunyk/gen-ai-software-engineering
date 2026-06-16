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
