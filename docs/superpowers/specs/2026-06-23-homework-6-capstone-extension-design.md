# Homework-6 Capstone Extension — Design

**Date:** 2026-06-23
**Author:** Bohdan Shtefunyk
**Branch:** `homework-6-final-workshop` (base: `homework-6-submission`)

## 1. Objective

Extend the existing homework-6 multi-agent banking pipeline with three capstone capabilities,
without breaking the file-based baseline:

1. **A new agent + configurable rule engine** — a Risk Policy Engine agent driven by declarative
   rules loaded from `config/rules.yaml`.
2. **A REST API gateway** — FastAPI wrapper exposing the file-based pipeline over HTTP.
3. **A demo script** — a single `demo/demo.sh` that boots everything, submits transactions, and
   prints results with zero manual steps.

The work is graded across five categories (100 pts total): capstone baseline, new agent, API
gateway, demo script, code quality. The design optimizes for all five while keeping the baseline
intact.

## 2. Existing Baseline (must be preserved)

- File-based message passing. A message is JSON: `message_id`, `timestamp`, `source_agent`,
  `target_agent`, `message_type`, `data`.
- `agents/base.py` — shared primitives (ISO 4217 set, `make_message` / `read_messages_for` /
  `write_message`, `mask_account`, `audit_log`, `parse_amount`).
- Three runtime agents, each a class with `name` + `process_message(message) -> message`:
  `TransactionValidator` → `FraudDetector` → `ComplianceChecker`.
- `integrator.py` (`Pipeline.run`) — sequential in-process orchestrator over `shared/{input,
  processing,output,results}/`, writes `pipeline-summary.json`.
- `pipeline_status.py` (pure query logic) + a FastMCP server (`mcp/server.py`, 2 tools + 1 resource).
- pytest + coverage gate (80% gate, ≥90% target).
- `ComplianceChecker` already exposes empty `BLOCKED_COUNTRIES` / `BLOCKED_CURRENCIES` sets — the
  natural hooks for the configurable rule engine.

## 3. Component 1 — Risk Policy Engine + Rule Engine

### 3.1 New pipeline order

```
Validator → Fraud Detector → Policy Engine → Compliance Checker
```

### 3.2 `rule_engine.py` (pure module, no transport, fully unit-tested)

- `load_ruleset(path) -> RuleSet` — reads `config/rules.yaml`.
- `RuleSet.evaluate(data) -> PolicyResult` — matches rules against a transaction, aggregates the
  action by priority `block > review > flag > allow`, returns `matched_rules` (rule ids) and
  `reasons`.
- `RuleSet.blocked_countries` / `blocked_currencies` — exposed from the `watchlists` section for
  Compliance to consume.
- Safe operator set only: `==`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not_in`, `between`. Field paths
  support dotted access (`metadata.country`). **No `eval`** — explicit operator dispatch keeps it
  safe and testable.
- A condition is either a single `{field, op, value}` clause, a list of clauses (implicit AND), or
  an explicit `{all: [...]}` / `{any: [...]}` group.

### 3.3 `config/rules.yaml` (declarative, the "configurable" surface)

```yaml
version: 1
rules:
  - id: high_value_wire_block
    description: Hard-block very large wires
    when:
      all:
        - { field: amount, op: ">=", value: 50000 }
        - { field: transaction_type, op: "==", value: wire_transfer }
    action: block
    reason: high_value_wire
  - id: cross_border_review
    when:
      - { field: metadata.country, op: "!=", value: US }
    action: review
    reason: cross_border
  - id: structuring_flag
    when:
      - { field: amount, op: between, value: [9000, 9999.99] }
    action: flag
    reason: structuring
watchlists:
  blocked_countries: [IR, KP, SY]
  blocked_currencies: []
```

### 3.4 `agents/policy_engine.py`

`PolicyEngine` class: `name = "policy_engine"`. Holds an injected `RuleSet`. `process_message`
reads `data`, calls `ruleset.evaluate(data)`, annotates `policy_decision` (allow/review/block),
`policy_rules` (matched ids), `policy_reasons`, and forwards to `compliance_checker`.

### 3.5 Compliance update (single final-disposition authority)

- Reads `blocked_countries` / `blocked_currencies` from the shared `RuleSet` (fills the existing
  empty sets) instead of hardcoded empties.
- Folds in `policy_decision`: `block` → `blocked`; `review` → at least `needs_review`; reasons from
  `policy_reasons` are merged into the final `reason`.
- Remains the only place that assigns the final disposition (no duplicate "blocked" logic).

### 3.6 Integrator update

- Loads the `RuleSet` once (default `config/rules.yaml`) and injects it into both `PolicyEngine`
  and `ComplianceChecker` (no double file read).
- Adds the policy stage between fraud and compliance.

## 4. Component 2 — REST API Gateway (FastAPI, synchronous)

`api/app.py` wraps the existing file-based pipeline in-process; the baseline pipeline is untouched.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | liveness probe |
| `POST` | `/transactions` | submit one transaction → pipeline runs inline → verdict in response |
| `GET` | `/transactions/{id}` | status / result for that id |
| `GET` | `/transactions` | list all results |
| `GET` | `/summary` | pipeline summary |
| `GET` | `/rules` | currently loaded rules (demonstrates configurability) |
| `GET` | `/docs` | auto-generated Swagger UI (free with FastAPI) |

### 4.1 Execution model

- **Synchronous**: `POST /transactions` runs the full 4-agent pipeline for that one transaction and
  returns the final verdict immediately.
- Domain validation stays in the `Validator` agent (faithful to the baseline). A submission always
  creates a result record, so the endpoint returns **HTTP 201** with the verdict in the body — even
  when that verdict is `status: rejected` (not 422). Only malformed JSON triggers Pydantic's
  automatic 422.
- New `Pipeline.process_one(txn) -> result`: writes the txn into `input/`, runs the four stages for
  that single message, **does not clear** existing results (accumulates), returns the final record.
  Reuses `run_stage`. This keeps the file-based mechanism faithful and shared between batch and API.
- Single uvicorn worker for the demo. State is per-transaction-id JSON files, so no write collisions
  for the demo workload. (Not designed for high concurrency — explicitly out of scope.)

### 4.2 Request model

`TransactionIn` (Pydantic) does minimal structural typing and passes a dict to the pipeline; the
`Validator` agent owns all domain rules so the API faithfully returns the pipeline verdict.

## 5. Component 3 — `demo/demo.sh` (zero manual steps)

`set -euo pipefail` + an `EXIT` trap for cleanup. Sequence:

1. Ensure `.venv` exists and deps are installed (`pip install -r requirements.txt -q`).
2. Start uvicorn in the background, capture PID.
3. Poll `GET /health` until ready (with timeout).
4. Submit the sample transactions one by one via `POST /transactions`.
5. Highlight a transaction caught by a configurable rule (e.g., blocked country / threshold).
6. `GET /transactions` (list) + `GET /summary`, pretty-printed via `jq` (fallback
   `python -m json.tool`).
7. Print a summary table; the trap kills the server; exit 0.

Also add `demo/sample-requests.http` (REST Client format) to satisfy the CLAUDE.md `demo/`
convention that homework-6 currently lacks.

## 6. Tests / Code Quality

New / updated tests:

- `tests/test_rule_engine.py` — operators, dotted fields, all/any groups, action aggregation,
  watchlists.
- `tests/test_policy_engine.py` — annotation + forwarding.
- `tests/test_api.py` — FastAPI `TestClient`: health, submit valid, submit invalid (→ rejected),
  get-by-id, list, summary, rules.
- `tests/test_compliance_checker.py` — updated for config-driven blocked lists + policy folding.
- `tests/test_integrator.py` — updated for the 4-stage pipeline and the new disposition oracle.

Coverage ≥90% maintained (gate 80%). New deps: `fastapi`, `uvicorn[standard]`, `httpx` (TestClient),
`pyyaml`, added to `requirements.txt`; `pyproject` coverage `source` extended with `api` and
`rule_engine`.

## 7. Docs + Git

- README / HOWTORUN: new agent, rule engine, API endpoint table with curl examples, how to run
  `demo.sh`. Updated ASCII architecture diagram (4 agents + API gateway).
- Branch `homework-6-final-workshop` off `homework-6-submission`; PR base = `homework-6-submission`
  (clean diff showing only the extension).

## 8. Presentation Plan (5 scoring categories)

| # | Category | How to show (demo order) | ~time |
|---|---|---|---|
| 1 | Demo script | Run `./demo/demo.sh` — instant "wow", everything boots and prints itself | 1 min |
| 2 | New agent + rule engine | Open `config/rules.yaml`, live-edit a rule (add blocked country / lower threshold), re-run, show the disposition flip; `GET /rules` | 2 min |
| 3 | API gateway | Open `/docs` (Swagger), live `POST /transactions` → `GET /transactions/{id}` → `GET /summary` | 1.5 min |
| 4 | Capstone baseline | `python integrator.py` — original 3-agent pipeline still works; show `pipeline-summary.json` + masked `audit.log` | 1 min |
| 5 | Code quality | Test run with coverage ≥90%, coverage-gate hook, clean module boundaries (`rule_engine` pure, agents isolated) | 1 min |

Order rationale: lead with `demo.sh` (immediate result), then the live rule edit (strongest proof of
configurability), then `/docs`, then tests/coverage, closing on baseline integrity. Plus a 30-second
ASCII architecture slide up front.

Screenshots to capture for the PR / submission (user takes these): full `demo.sh` run, Swagger
`/docs`, POST+GET responses, `rules.yaml` + flipped disposition, coverage ≥90% + gate exit 0,
baseline `integrator.py` run.

## 9. Out of Scope (YAGNI)

- Async/queued processing, persistence beyond JSON files, authentication, multi-worker concurrency.
- Externalizing fraud/validator thresholds (focused rule-engine scope: new agent + Compliance
  blocked lists only).
- A live web leaderboard UI (the leaderboard is run by the course, not built by us).
