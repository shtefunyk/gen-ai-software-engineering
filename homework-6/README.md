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
- **Compliance Checker** — applies cross-border + AML (≥ $10,000) + blocked-list rules and sets the
  final disposition (approved / needs_review / blocked).

## Architecture

```
 sample-transactions.json
            |
            v
   +-----------------+      +----------------+      +--------------------+
   |   input/        | ---> |   output/      | ---> |   output/          |
   | Validator       |      | Fraud Detector |      | Compliance Checker |
   +-----------------+      +----------------+      +--------------------+
            |  (rejected)            |                        |
            +------------------------+------------------------+
                                     v
                               shared/results/
                          (+ pipeline-summary.json)
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
| Tests | pytest + pytest-cov (gate 80%, target ≥ 90%) |
| Automation | Claude Code slash commands + PreToolUse coverage hook |
