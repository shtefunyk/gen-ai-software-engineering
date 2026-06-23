# Homework 6 — AI-Powered Multi-Agent Banking Pipeline

**Created by Bohdan Shtefunyk**

A multi-agent system that processes banking transactions through three cooperating agents. Raw
records from `sample-transactions.json` are validated, scored for fraud, and checked against
compliance rules; auditable results land in `shared/results/`. The system is built by four
meta-agents (Claude Code slash commands) and is queryable through a custom FastMCP server.

Transactions flow through file-based message passing. Each agent reads JSON messages from its inbox
directory, processes them, and writes to the next stage — a deterministic, fully testable pipeline.

## Agents
- **Transaction Validator** — checks required fields, positive amount (≤ 2 decimals), ISO 4217
  currency, `ACC-XXXX` accounts, allowed transaction types.
- **Fraud Detector** — scores 0–100 and flags high-value, overnight, and near-threshold transactions.
- **Policy Engine** — applies declarative rules from `config/rules.yaml` (condition → flag /
  review / block); emits `policy_decision`, `policy_rules`, `policy_reasons`.
- **Compliance Checker** — applies cross-border + AML (≥ $10,000) + blocked-list rules, folds in the
  policy decision, and sets the final disposition (approved / needs_review / blocked).

## Architecture

```
 sample-transactions.json                          HTTP client / demo.sh
            |                                              |
            v                                              v
   +-----------+  +--------+  +--------+  +------------+   FastAPI gateway
   | Validator |->| Fraud  |->| Policy |->| Compliance |   (POST /transactions,
   +-----------+  +--------+  +--------+  +------------+    GET /transactions/{id},
            |          (rules.yaml) ^           |           /summary, /rules, /docs)
            +--------------(rejected)-----------+
                                     v
                               shared/results/  (+ pipeline-summary.json)
                                     |
                                     v
                     FastMCP server (get_transaction_status,
                     list_pipeline_results, pipeline://summary)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Python 3.13 |
| Money | `decimal.Decimal` |
| MCP | FastMCP (custom server) + context7 |
| API | FastAPI + uvicorn (synchronous gateway) |
| Rules | PyYAML-backed configurable rule engine |
| Tests | pytest + pytest-cov (gate 80%, target ≥ 90%) |
| Automation | Claude Code slash commands + PreToolUse coverage hook |
