# Meta-Agents

This project is built by four meta-agents (reusable Claude Code workflows). Each is a slash command
in `.claude/commands/`. Their output is the runtime pipeline (three cooperating agents).

## Agent 1 — Specification (`/write-spec`)
Produces `specification.md` from the approved design. Prompt: generate the 5-section spec.

## Agent 2 — Code generation (`/generate-pipeline`)
Generates the three runtime agents + `integrator.py`. Uses the **context7** MCP server to look up
FastMCP and the Python `decimal` module; queries recorded in `research-notes.md`.

## Agent 3 — Unit tests (`/write-tests`)
Generates the pytest suite (unit + integration) targeting ≥ 90% coverage. A coverage-gate hook
blocks `git push` below 80%.

## Agent 4 — Documentation (`/write-docs`)
Generates `README.md` (author: Bohdan Shtefunyk) and `HOWTORUN.md`.

## Runtime pipeline (the produced system)
`Transaction Validator → Fraud Detector → Compliance Checker`, communicating via JSON files in
`shared/{input,processing,output,results}/`. Operational commands `/run-pipeline` and
`/validate-transactions` drive the demo.
