# Homework 6 — AI-Powered Multi-Agent Banking Pipeline — Design

- **Date:** 2026-06-16
- **Author:** Bohdan Shtefunyk
- **Branch:** `homework-6-submission`
- **Status:** Approved design (brainstorming output) — ready for implementation planning

---

## 1. Overview & context

The capstone has a deliberate double meaning:

- **Four meta-agents** (reusable AI/automation workflows) that *create* the system.
- **The resulting system** — a runtime multi-agent banking pipeline that processes transactions.

Both are deliverables. The four meta-agents are realized as Claude Code slash commands; the
resulting system is a Python pipeline of three cooperating runtime agents that communicate by
passing JSON files through shared directories.

**Stack:** Python 3.13 (matches Homework 5; Task 4 requires a FastMCP `mcp/server.py`; the spec
recommends `decimal.Decimal`). Monetary values use `decimal.Decimal` everywhere — never `float`.

---

## 2. Goals & non-goals

**Goals**
- Three cooperating runtime agents (Validator → Fraud Detector → Compliance Checker) with a
  deterministic, file-based message protocol.
- Four meta-agents as slash commands, plus two operational commands.
- Two MCP servers wired together: `context7` (used during code-gen) + a custom FastMCP server.
- Coverage gate hook that blocks `git push` when coverage < 80%; test suite targets ≥ 90%.
- README authored by **Bohdan Shtefunyk**, HOWTORUN, five screenshots, thorough PR description.

**Non-goals**
- No long-running agent daemons / polling (rejected — see §5).
- No persistent database; `shared/` files + an audit log are the source of truth.
- No extra MCP surface beyond the required 2 tools + 1 resource.
- No third-party currency library — a curated ISO 4217 set keeps dependencies minimal.

---

## 3. The four meta-agents (deliverable #1)

Each meta-agent is a reusable AI workflow (a slash command). `agents.md` documents all four with
the exact prompts used.

| Meta-agent | Slash command | Produces | "Plus" requirement |
|---|---|---|---|
| Agent 1 — Specification | `/write-spec` | `specification.md` | Skill that generates the spec from the template |
| Agent 2 — Code generation | `/generate-pipeline` | `agents/*.py`, `integrator.py` | Uses **context7** to look up a framework; ≥2 queries in `research-notes.md` |
| Agent 3 — Unit tests | `/write-tests` | `tests/*.py` | Coverage hook **blocks push** if coverage < 80% |
| Agent 4 — Documentation | `/write-docs` | `README.md`, `HOWTORUN.md` | README must include the author's name |

Two operational commands support the demo:
- `/run-pipeline` — clears `shared/`, runs the pipeline end-to-end, summarizes results, reports rejects.
- `/validate-transactions` — runs the validator in dry-run mode; reports total/valid/invalid + reasons.

Commands live in `homework-6/.claude/commands/`; settings in `homework-6/.claude/settings.json`.
Claude Code is launched from `homework-6/` so that directory is the project root.

---

## 4. Runtime pipeline — agents & rules (deliverable #2)

Each agent is a class exposing a pure `process_message(message: dict) -> dict`. Deterministic and
unit-testable in isolation.

### 4.1 Transaction Validator — structural validity
- All required fields present (`transaction_id`, `timestamp`, `source_account`,
  `destination_account`, `amount`, `currency`, `transaction_type`).
- `amount` parses to `Decimal`, is **> 0**, and has **≤ 2 decimal places**.
- `currency` is a valid ISO 4217 code (curated set).
- `source_account` / `destination_account` match `^ACC-[A-Z0-9]{4,}$`.
- `transaction_type` ∈ {transfer, wire_transfer, refund, deposit, withdrawal}.
- **Fail** → `status: rejected` + `reason`, written straight to `shared/results/`.
- **Pass** → `status: validated`, forwarded to the Fraud Detector.

### 4.2 Fraud Detector — risk scoring (0–100), flags, never rejects
The detector emits two distinct things: a numeric **score** (with a band) and a list of discrete
**review flags**. They are separated on purpose so the final disposition is derivable from rules
(a low score can still carry a review flag — see TXN003).

*Score contributors:*
- `amount > $10,000` → +40; additionally `> $50,000` → +30.
- transaction hour in 00:00–05:59 → +25 (overnight anomaly).
- cross-border (`metadata.country != "US"`) → +15.
- `wire_transfer` → +10 (score only — not a standalone review flag).
- near-threshold `$9,000.00`–`$9,999.99` → +20 (structuring signal).
- Bands: score ≥ 70 → `high`; 40–69 → `medium`; < 40 → `low`.

*Review flags* (drive disposition regardless of band): `high_value` (amount > $10,000),
`overnight` (00:00–05:59), `structuring` (near-threshold). `cross_border` is surfaced but acted on
by Compliance. `wire` is a score contributor only.

Annotates `fraud_score`, `fraud_risk`, and `fraud_flags`; forwards to the Compliance Checker.

### 4.3 Compliance Checker — final disposition (AML / sanctions)
*Compliance violations:*
- cross-border (`metadata.country != "US"`) → requires review.
- `amount ≥ $10,000` → AML report flag (CTR-like).
- blocked-country / blocked-currency lists → hard `blocked` (rule exists; none present in sample data).

*Disposition rule:*
- `blocked` if any hard blocked-list hit.
- else `approved` **iff** `fraud_risk != high` **and** there are no `fraud_flags` **and** no
  compliance violation.
- else `needs_review`.
- Writes the final result to `shared/results/`.

This makes the §4.4 oracle fully derivable: TXN003 carries a `structuring` flag (low score, but a
flag) → `needs_review`; TXN001/008 carry no flags and no violations → `approved`.

### 4.4 Expected disposition over `sample-transactions.json` (integration oracle)

| TXN | Amount | Outcome | Reason |
|---|---|---|---|
| 001 | $1,500 transfer | approved | clean |
| 002 | $25,000 wire | needs_review | high-value + AML |
| 003 | $9,999.99 | needs_review | near-threshold structuring |
| 004 | €500 @ 02:47 DE | needs_review | overnight + cross-border |
| 005 | $75,000 wire | needs_review | very-high + AML |
| 006 | $200 **XYZ** | rejected | invalid currency |
| 007 | **-$100** GBP | rejected | negative amount |
| 008 | $3,200 transfer | approved | clean |

Totals: **2 approved, 4 needs_review, 2 rejected.** This table is the integration test oracle.

---

## 5. File-based protocol, message format, audit & PII

**Execution model — Variant A (sequential in-process orchestrator).** `integrator.py` imports the
agent classes and runs each transaction through the stages synchronously. Each agent still **reads
JSON from its inbox directory and writes to the next directory**, so files genuinely migrate through
`shared/` as the assignment requires — but execution is deterministic with no races, which is what
makes ≥ 90% coverage and stable screenshots achievable. (Polling daemons / watchdog rejected as
flaky and untestable.)

**Message envelope (assignment standard):**
```json
{
  "message_id": "uuid4",
  "timestamp": "2026-03-16T10:00:00Z",
  "source_agent": "transaction_validator",
  "target_agent": "fraud_detector",
  "message_type": "transaction",
  "data": { "<transaction fields + accumulated annotations: fraud_score, flags, reason>" }
}
```

**Flow through `shared/`:**
```
integrator → input/      (one TXN###.json per transaction, target=validator)
validator  → input → processing → output/ (target=fraud)   |  or → results/ if rejected
fraud      → output → processing → output/ (target=compliance)
compliance → output → processing → results/  (final: approved / needs_review / blocked)
```
- Routing is by the `target_agent` field; each agent only picks up its own messages.
- Files are named `TXN###.json` for readability; `message_id` lives inside the envelope.
- A run summary is written to `shared/results/pipeline-summary.json` (fed to the MCP resource).

**Audit log** (`logs/audit.log`): every agent appends `ISO-8601 timestamp · agent · transaction_id ·
outcome`.

**PII:** account numbers and names are **masked** in the audit log (`ACC-1001` → `ACC-***1`); never
logged in plaintext. They remain in `shared/` working files (operational data).

---

## 6. MCP integration (deliverable #4)

### 6.1 Custom FastMCP server — `mcp/server.py`
- 🔧 `get_transaction_status(transaction_id: str)` → reads `shared/results/`, returns current status + reason.
- 🔧 `list_pipeline_results()` → summary of all processed transactions (counts + list).
- 📄 Resource `pipeline://summary` → latest run summary as text (reads `pipeline-summary.json`).

Exactly two tools + one resource — no more.

### 6.2 context7 during code generation (Agent 2)
Documented in `research-notes.md` (≥ 2 queries; format: search term → library ID → applied insight):
1. **FastMCP** — `@mcp.tool` / `@mcp.resource` decorator API (the "specific framework" requirement).
2. **Python `decimal`** — `quantize` + `ROUND_HALF_UP` for monetary arithmetic.
3. *(bonus)* **pytest-cov** — coverage threshold configuration (informs the hook).

### 6.3 `homework-6/mcp.json` — both servers
```json
{
  "mcpServers": {
    "context7":        { "command": "npx",    "args": ["-y", "@upstash/context7-mcp@latest"] },
    "pipeline-status": { "command": "python", "args": ["mcp/server.py"] }
  }
}
```
The Homework-5 root `.mcp.json` symlink is not active on this branch; Homework 6 uses its own
`homework-6/mcp.json`, run from that directory. Exact wiring confirmed during implementation.

---

## 7. Skills & coverage hook (deliverable #3)

Six slash commands (see §3). **Coverage gate hook** — required in `.claude/settings.json`:
- A **Claude Code PreToolUse hook** matching Bash `git push` commands runs `scripts/coverage_gate.py`
  (which runs `pytest --cov` and parses the percentage). If coverage **< 80%**, it exits 2 → the push
  is denied.
- The same script is reused as a git `pre-push` hook so a manual `git push` is also gated (more robust
  for the "blocks push" screenshot).
- **Demo for `hook-trigger.png`:** deliberately add an uncovered function to drop below 80%, attempt a
  push, watch the hook block it.

Thresholds: gate = **80%** (hard block); test target = **≥ 90%**.

---

## 8. Tests (deliverable #5)

- `pytest` + `pytest-cov`; tests isolated from real `shared/` via `tmp_path`.
- `test_transaction_validator.py` — amounts (valid/invalid/negative/>2dp), currency (XYZ), account
  format, missing fields.
- `test_fraud_detector.py` — each scoring rule + band boundaries, overnight, cross-border, near-threshold.
- `test_compliance_checker.py` — cross-border, AML threshold, disposition combinations.
- `test_integrator.py` — **integration**: full run over `sample-transactions.json`, asserts the
  disposition oracle (2 approved / 4 needs_review / 2 rejected).
- `test_mcp_server.py` — the two tools + the resource.
- Coverage config in `pyproject.toml`; target ≥ 90%, gate 80%.

---

## 9. File / directory structure

```
homework-6/
├── .claude/
│   ├── commands/  write-spec.md, generate-pipeline.md, write-tests.md,
│   │              write-docs.md, run-pipeline.md, validate-transactions.md
│   └── settings.json            # PreToolUse coverage-gate hook
├── agents/
│   ├── base.py                  # envelope, file IO, audit log, PII masking
│   ├── transaction_validator.py
│   ├── fraud_detector.py
│   └── compliance_checker.py
├── mcp/server.py                # FastMCP: 2 tools + 1 resource
├── scripts/coverage_gate.py     # shared by the hook + git pre-push
├── shared/{input,processing,output,results}/   (+ .gitkeep)
├── tests/  (5 files above)
├── logs/                        # audit.log (gitignored)
├── docs/screenshots/            # 5 screenshots
├── integrator.py                # orchestrator entry point
├── sample-transactions.json     # provided (already in place)
├── specification.md             # ← Agent 1 output
├── agents.md                    # the four meta-agents documented
├── research-notes.md            # context7 queries
├── mcp.json                     # context7 + pipeline-status
├── requirements.txt             # fastmcp, pytest, pytest-cov
├── pyproject.toml               # coverage config
├── README.md                    # ← Agent 4 output (includes author name)
└── HOWTORUN.md
```

**Dependencies:** `fastmcp`, `pytest`, `pytest-cov`. `decimal`/`uuid`/`json`/`datetime` are stdlib;
the ISO 4217 set is a curated constant (no extra package).

---

## 10. Screenshots (captured at demo/verification time)

| Screenshot | When |
|---|---|
| `pipeline-run.png` | after a successful `python integrator.py` (full terminal output) |
| `test-coverage.png` | coverage report ≥ 80% (target ≥ 90%) |
| `skill-run-pipeline.png` | `/run-pipeline` executing in Claude Code |
| `hook-trigger.png` | coverage hook firing / blocking a push |
| `mcp-interaction.png` | a context7 query result **and** a custom MCP tool call |

All five also embedded in the PR description.

---

## 11. Assignment deliverables → design mapping

- Task 1 (Agent 1): `specification.md`, `agents.md`, `/write-spec` — §3, §4.
- Task 2 (Agent 2): `integrator.py`, three agents, `research-notes.md`, context7 — §4, §5, §6.2.
- Task 3 (Agent 3): `/run-pipeline`, `/validate-transactions`, coverage-gate hook — §7.
- Task 4 (MCP): `mcp.json`, `mcp/server.py`, context7 queries — §6.
- Task 5 (Agent 4): `tests/`, `README.md` (author name), `HOWTORUN.md`, screenshots — §8, §10.

---

## 12. Open items / risks

- **MCP wiring on this branch:** the root `.mcp.json` points at Homework 5; confirm Homework 6's
  `mcp.json` is picked up when Claude Code is launched from `homework-6/`.
- **Hook portability:** Claude Code PreToolUse hook vs. git `pre-push` — both reuse one script;
  verify the PreToolUse matcher reliably catches `git push` Bash calls.
- **Coverage headroom:** include `test_mcp_server.py` and exercise `base.py` error paths to keep the
  margin above the 80% gate comfortably toward the 90% target.
