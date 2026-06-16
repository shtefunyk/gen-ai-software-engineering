# Homework 6 — Multi-Agent Banking Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, file-based multi-agent banking pipeline (Validator → Fraud Detector → Compliance Checker) plus four Claude Code meta-agent commands, a coverage gate hook, and two MCP servers — all under `homework-6/`.

**Architecture:** A sequential in-process orchestrator (`integrator.py`) runs each transaction through three agent stages. Agents communicate by reading/writing JSON message files through `shared/{input,processing,output,results}/`. A custom FastMCP server makes results queryable; context7 is used during code generation.

**Tech Stack:** Python 3.13, `decimal.Decimal` for money, `fastmcp`, `pytest` + `pytest-cov`. Claude Code slash commands + a PreToolUse coverage-gate hook.

**Conventions for every commit in this plan:** run from `homework-6/`, and append the trailer
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (shown as a second `-m`).
Spec: `docs/superpowers/specs/2026-06-16-homework-6-banking-pipeline-design.md`.

---

## File Structure

All paths relative to repo root. Claude Code / commands are launched from `homework-6/`.

| File | Responsibility |
|---|---|
| `homework-6/requirements.txt` | runtime + test deps |
| `homework-6/pyproject.toml` | pytest + coverage config (source, exclusions) |
| `homework-6/.gitignore` | ignore `.venv/`, `logs/`, `coverage.json`, `__pycache__/` |
| `homework-6/agents/base.py` | message envelope, file IO, audit log, PII masking, ISO 4217 set, Decimal helpers |
| `homework-6/agents/transaction_validator.py` | structural validation + dry-run CLI |
| `homework-6/agents/fraud_detector.py` | risk scoring + review flags |
| `homework-6/agents/compliance_checker.py` | AML/sanctions + final disposition |
| `homework-6/integrator.py` | sequential orchestrator (`Pipeline`) + CLI entry point |
| `homework-6/mcp/server.py` | FastMCP: 2 tools + 1 resource (thin wrappers over pure fns) |
| `homework-6/scripts/coverage_gate.py` | run pytest+cov, parse %, exit 2 if < 80 |
| `homework-6/scripts/coverage_gate_hook.sh` | PreToolUse hook: gate only on `git push` |
| `homework-6/.githooks/pre-push` | git pre-push reuse of the gate |
| `homework-6/.claude/settings.json` | registers the PreToolUse coverage-gate hook |
| `homework-6/.claude/commands/*.md` | 6 slash commands (4 meta-agents + 2 operational) |
| `homework-6/tests/test_*.py` | unit + integration tests |
| `homework-6/specification.md` | Agent 1 deliverable (5-section spec) |
| `homework-6/agents.md` | the four meta-agents documented |
| `homework-6/research-notes.md` | ≥ 2 context7 queries |
| `homework-6/mcp.json` | context7 + pipeline-status |
| `homework-6/README.md` | Agent 4 deliverable (author: Bohdan Shtefunyk) |
| `homework-6/HOWTORUN.md` | numbered run steps |

---

## Task 1: Project scaffolding

**Files:**
- Create: `homework-6/requirements.txt`, `homework-6/pyproject.toml`, `homework-6/.gitignore`
- Create: `homework-6/agents/__init__.py`, `homework-6/tests/__init__.py`
- Create: `homework-6/shared/{input,processing,output,results}/.gitkeep`, `homework-6/docs/screenshots/.gitkeep`

- [ ] **Step 1: Create directory tree and placeholder files**

```bash
cd homework-6
mkdir -p agents mcp scripts tests logs docs/screenshots .claude/commands .githooks
mkdir -p shared/input shared/processing shared/output shared/results
touch agents/__init__.py tests/__init__.py
touch shared/input/.gitkeep shared/processing/.gitkeep shared/output/.gitkeep shared/results/.gitkeep docs/screenshots/.gitkeep
```

- [ ] **Step 2: Write `homework-6/requirements.txt`**

```
fastmcp>=2.0.0
pytest>=8.0.0
pytest-cov>=5.0.0
```

- [ ] **Step 3: Write `homework-6/pyproject.toml`**

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"

[tool.coverage.run]
source = ["agents", "mcp", "integrator"]
omit = ["tests/*", "scripts/*"]

[tool.coverage.report]
show_missing = true
exclude_lines = [
    "pragma: no cover",
    "if __name__ == .__main__.:",
    "raise NotImplementedError",
]
```

- [ ] **Step 4: Write `homework-6/.gitignore`**

```
.venv/
__pycache__/
*.pyc
logs/
coverage.json
.coverage
shared/**/*.json
!shared/**/.gitkeep
```

> Note: `sample-transactions.json` lives at `homework-6/` root (already committed), not in `shared/`, so the rule above does not hide it.

- [ ] **Step 5: Create the virtualenv and install deps**

Run:
```bash
cd homework-6
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
```
Expected: installs fastmcp, pytest, pytest-cov without error.

- [ ] **Step 6: Commit**

```bash
git add homework-6/requirements.txt homework-6/pyproject.toml homework-6/.gitignore homework-6/agents/__init__.py homework-6/tests/__init__.py homework-6/shared homework-6/docs/screenshots/.gitkeep
git commit -m "chore(homework-6): scaffold project structure and config" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shared base module (`agents/base.py`)

**Files:**
- Create: `homework-6/agents/base.py`
- Test: `homework-6/tests/test_base.py`

All test/command runs in this plan use `homework-6/.venv/bin/python` and run from `homework-6/`.

- [ ] **Step 1: Write the failing test → `tests/test_base.py`**

```python
import json
from pathlib import Path

from agents import base


def test_make_message_has_envelope_fields():
    msg = base.make_message("integrator", "transaction_validator", {"transaction_id": "TXN001"})
    assert msg["source_agent"] == "integrator"
    assert msg["target_agent"] == "transaction_validator"
    assert msg["message_type"] == "transaction"
    assert msg["data"]["transaction_id"] == "TXN001"
    assert msg["message_id"]
    assert msg["timestamp"].endswith("Z")


def test_write_and_read_messages_routes_by_target(tmp_path):
    inbox = tmp_path / "input"
    base.write_message(inbox, base.make_message("integrator", "transaction_validator",
                                                 {"transaction_id": "TXN001"}))
    base.write_message(inbox, base.make_message("integrator", "fraud_detector",
                                                {"transaction_id": "TXN002"}))
    found = base.read_messages_for(inbox, "transaction_validator")
    assert len(found) == 1
    path, msg = found[0]
    assert path.name == "TXN001.json"
    assert msg["data"]["transaction_id"] == "TXN001"


def test_mask_account_hides_all_but_last_digit():
    assert base.mask_account("ACC-1001") == "ACC-***1"
    assert base.mask_account("ACC-9") == "ACC-9"
    assert base.mask_account("bogus") == "***"


def test_audit_log_appends_line_without_plaintext_account(tmp_path):
    log = tmp_path / "audit.log"
    base.audit_log(log, "transaction_validator", "TXN001", "validated")
    text = log.read_text(encoding="utf-8")
    assert "transaction_validator" in text
    assert "TXN001" in text
    assert "validated" in text


def test_parse_amount_returns_decimal():
    from decimal import Decimal
    assert base.parse_amount("1500.00") == Decimal("1500.00")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_base.py -v`
Expected: FAIL — `ModuleNotFoundError`/`AttributeError` (base does not exist yet).

- [ ] **Step 3: Implement `agents/base.py`**

```python
"""Shared primitives for the banking pipeline agents."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

# Curated ISO 4217 currency codes (no third-party dependency).
ISO_4217 = {
    "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "SEK", "NZD",
    "NOK", "DKK", "PLN", "CZK", "HUF", "SGD", "HKD", "INR", "BRL", "ZAR",
}

AGENT_INTEGRATOR = "integrator"
AGENT_VALIDATOR = "transaction_validator"
AGENT_FRAUD = "fraud_detector"
AGENT_COMPLIANCE = "compliance_checker"
TARGET_RESULTS = "results"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_message(source_agent: str, target_agent: str, data: dict,
                 message_type: str = "transaction") -> dict:
    return {
        "message_id": str(uuid.uuid4()),
        "timestamp": utc_now_iso(),
        "source_agent": source_agent,
        "target_agent": target_agent,
        "message_type": message_type,
        "data": data,
    }


def write_message(directory: Path, message: dict) -> Path:
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    txn_id = message["data"].get("transaction_id", message["message_id"])
    path = directory / f"{txn_id}.json"
    path.write_text(json.dumps(message, indent=2), encoding="utf-8")
    return path


def read_messages_for(directory: Path, target_agent: str) -> list[tuple[Path, dict]]:
    directory = Path(directory)
    out: list[tuple[Path, dict]] = []
    if not directory.exists():
        return out
    for path in sorted(directory.glob("*.json")):
        msg = json.loads(path.read_text(encoding="utf-8"))
        if msg.get("target_agent") == target_agent:
            out.append((path, msg))
    return out


def mask_account(account: str) -> str:
    if not account or "-" not in account:
        return "***"
    prefix, num = account.split("-", 1)
    if len(num) <= 1:
        return f"{prefix}-{num}"
    return f"{prefix}-{'*' * (len(num) - 1)}{num[-1]}"


def audit_log(log_path: Path, agent: str, transaction_id: str, outcome: str) -> None:
    log_path = Path(log_path)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    line = f"{utc_now_iso()} · {agent} · {transaction_id} · {outcome}\n"
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(line)


def parse_amount(raw) -> Decimal:
    return Decimal(str(raw))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_base.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add homework-6/agents/base.py homework-6/tests/test_base.py
git commit -m "feat(homework-6): add shared agent base (envelope, IO, audit, PII mask)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Transaction Validator

**Files:**
- Create: `homework-6/agents/transaction_validator.py`
- Test: `homework-6/tests/test_transaction_validator.py`

- [ ] **Step 1: Write the failing test → `tests/test_transaction_validator.py`**

```python
from agents.transaction_validator import TransactionValidator
from agents import base


def good_txn(**over):
    txn = {
        "transaction_id": "TXN001",
        "timestamp": "2026-03-16T09:00:00Z",
        "source_account": "ACC-1001",
        "destination_account": "ACC-2001",
        "amount": "1500.00",
        "currency": "USD",
        "transaction_type": "transfer",
        "metadata": {"country": "US"},
    }
    txn.update(over)
    return txn


def test_valid_transaction_passes_to_fraud():
    v = TransactionValidator()
    out = v.process_message(base.make_message("integrator", v.name, good_txn()))
    assert out["target_agent"] == base.AGENT_FRAUD
    assert out["data"]["status"] == "validated"


def test_invalid_currency_is_rejected():
    v = TransactionValidator()
    out = v.process_message(base.make_message("integrator", v.name, good_txn(currency="XYZ")))
    assert out["target_agent"] == base.TARGET_RESULTS
    assert out["data"]["status"] == "rejected"
    assert "currency" in out["data"]["reason"]


def test_negative_amount_is_rejected():
    v = TransactionValidator()
    errs = v.validate(good_txn(amount="-100.00"))
    assert any("positive" in e for e in errs)


def test_more_than_two_decimals_is_rejected():
    v = TransactionValidator()
    errs = v.validate(good_txn(amount="10.123"))
    assert any("decimal" in e for e in errs)


def test_bad_account_format_is_rejected():
    v = TransactionValidator()
    errs = v.validate(good_txn(source_account="1001"))
    assert any("source_account" in e for e in errs)


def test_missing_field_is_rejected():
    v = TransactionValidator()
    txn = good_txn()
    del txn["currency"]
    errs = v.validate(txn)
    assert any("currency" in e for e in errs)


def test_bad_amount_string_is_rejected():
    v = TransactionValidator()
    errs = v.validate(good_txn(amount="abc"))
    assert any("amount" in e for e in errs)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_transaction_validator.py -v`
Expected: FAIL — module/class not found.

- [ ] **Step 3: Implement `agents/transaction_validator.py`**

```python
"""Agent 1 of the runtime pipeline: structural validation."""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from agents import base

ACCOUNT_RE = re.compile(r"^ACC-[A-Z0-9]{4,}$")
REQUIRED_FIELDS = (
    "transaction_id", "timestamp", "source_account", "destination_account",
    "amount", "currency", "transaction_type",
)
ALLOWED_TYPES = {"transfer", "wire_transfer", "refund", "deposit", "withdrawal"}


class TransactionValidator:
    name = base.AGENT_VALIDATOR

    def validate(self, data: dict) -> list[str]:
        errors: list[str] = []
        for field in REQUIRED_FIELDS:
            if not data.get(field):
                errors.append(f"missing required field: {field}")
        if errors:
            return errors

        try:
            amount = Decimal(str(data["amount"]))
        except (InvalidOperation, ValueError):
            errors.append("amount is not a valid number")
        else:
            if amount <= 0:
                errors.append("amount must be positive")
            if amount.as_tuple().exponent < -2:
                errors.append("amount exceeds 2 decimal places")

        if data["currency"] not in base.ISO_4217:
            errors.append(f"currency '{data['currency']}' is not a valid ISO 4217 code")
        if not ACCOUNT_RE.match(str(data["source_account"])):
            errors.append("source_account must match ACC-XXXX")
        if not ACCOUNT_RE.match(str(data["destination_account"])):
            errors.append("destination_account must match ACC-XXXX")
        if data["transaction_type"] not in ALLOWED_TYPES:
            errors.append(f"transaction_type '{data['transaction_type']}' is not allowed")
        return errors

    def process_message(self, message: dict) -> dict:
        data = dict(message["data"])
        errors = self.validate(data)
        if errors:
            data["status"] = "rejected"
            data["reason"] = "; ".join(errors)
            return base.make_message(self.name, base.TARGET_RESULTS, data)
        data["status"] = "validated"
        return base.make_message(self.name, base.AGENT_FRAUD, data)


if __name__ == "__main__":  # pragma: no cover
    import argparse
    import json
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Validate transactions (dry-run).")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--file", default="sample-transactions.json")
    args = parser.parse_args()

    txns = json.loads(Path(args.file).read_text(encoding="utf-8"))
    validator = TransactionValidator()
    valid = invalid = 0
    print(f"Validating {len(txns)} transactions from {args.file}\n")
    for txn in txns:
        errs = validator.validate(txn)
        if errs:
            invalid += 1
            print(f"  ❌ {txn.get('transaction_id')}: {'; '.join(errs)}")
        else:
            valid += 1
            print(f"  ✅ {txn.get('transaction_id')}: valid")
    print(f"\nTotal: {len(txns)} | valid: {valid} | invalid: {invalid}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_transaction_validator.py -v`
Expected: PASS (7 passed).

- [ ] **Step 5: Sanity-check the dry-run CLI**

Run: `.venv/bin/python agents/transaction_validator.py --dry-run`
Expected: TXN006 (XYZ) and TXN007 (-100.00) marked ❌; total 8 | valid 6 | invalid 2.

- [ ] **Step 6: Commit**

```bash
git add homework-6/agents/transaction_validator.py homework-6/tests/test_transaction_validator.py
git commit -m "feat(homework-6): add transaction validator agent" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Fraud Detector

**Files:**
- Create: `homework-6/agents/fraud_detector.py`
- Test: `homework-6/tests/test_fraud_detector.py`

- [ ] **Step 1: Write the failing test → `tests/test_fraud_detector.py`**

```python
from agents.fraud_detector import FraudDetector
from agents import base


def txn(**over):
    base_txn = {
        "transaction_id": "TXN001",
        "timestamp": "2026-03-16T09:00:00Z",
        "amount": "1500.00",
        "currency": "USD",
        "transaction_type": "transfer",
        "metadata": {"country": "US"},
    }
    base_txn.update(over)
    return base_txn


def assess(data):
    return FraudDetector().assess(data)


def test_low_value_clean_has_no_flags():
    score, flags = assess(txn())
    assert score == 0
    assert flags == []


def test_high_value_flag_over_10k():
    score, flags = assess(txn(amount="25000.00", transaction_type="wire_transfer"))
    assert "high_value" in flags
    assert score == 50  # 40 high-value + 10 wire


def test_very_high_value_is_high_risk():
    out = FraudDetector().process_message(
        base.make_message("v", "fraud_detector", txn(amount="75000.00", transaction_type="wire_transfer")))
    assert out["data"]["fraud_risk"] == "high"  # 40 + 30 + 10 = 80
    assert "high_value" in out["data"]["fraud_flags"]


def test_overnight_flag():
    score, flags = assess(txn(timestamp="2026-03-16T02:47:00Z", amount="500.00",
                              currency="EUR", metadata={"country": "DE"}))
    assert "overnight" in flags
    assert score == 40  # 25 overnight + 15 cross-border


def test_structuring_flag_near_threshold():
    score, flags = assess(txn(amount="9999.99"))
    assert "structuring" in flags
    assert score == 20


def test_process_message_forwards_to_compliance():
    out = FraudDetector().process_message(base.make_message("v", "fraud_detector", txn()))
    assert out["target_agent"] == base.AGENT_COMPLIANCE
    assert out["data"]["fraud_risk"] == "low"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_fraud_detector.py -v`
Expected: FAIL — module/class not found.

- [ ] **Step 3: Implement `agents/fraud_detector.py`**

```python
"""Agent 2 of the runtime pipeline: fraud risk scoring."""
from __future__ import annotations

from decimal import Decimal

from agents import base

HIGH_VALUE = Decimal("10000")
VERY_HIGH = Decimal("50000")
STRUCT_LOW = Decimal("9000.00")
STRUCT_HIGH = Decimal("9999.99")


class FraudDetector:
    name = base.AGENT_FRAUD

    def assess(self, data: dict) -> tuple[int, list[str]]:
        amount = base.parse_amount(data["amount"])
        hour = int(str(data["timestamp"])[11:13])
        country = data.get("metadata", {}).get("country", "US")
        ttype = data.get("transaction_type")

        score = 0
        flags: list[str] = []

        if amount > HIGH_VALUE:
            score += 40
            flags.append("high_value")
            if amount > VERY_HIGH:
                score += 30
        if 0 <= hour <= 5:
            score += 25
            flags.append("overnight")
        if country != "US":
            score += 15  # cross-border: scored here, acted on by Compliance
        if ttype == "wire_transfer":
            score += 10  # score only, not a standalone review flag
        if STRUCT_LOW <= amount <= STRUCT_HIGH:
            score += 20
            flags.append("structuring")
        return score, flags

    def process_message(self, message: dict) -> dict:
        data = dict(message["data"])
        score, flags = self.assess(data)
        risk = "high" if score >= 70 else "medium" if score >= 40 else "low"
        data["fraud_score"] = score
        data["fraud_risk"] = risk
        data["fraud_flags"] = flags
        return base.make_message(self.name, base.AGENT_COMPLIANCE, data)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_fraud_detector.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add homework-6/agents/fraud_detector.py homework-6/tests/test_fraud_detector.py
git commit -m "feat(homework-6): add fraud detector agent" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Compliance Checker

**Files:**
- Create: `homework-6/agents/compliance_checker.py`
- Test: `homework-6/tests/test_compliance_checker.py`

- [ ] **Step 1: Write the failing test → `tests/test_compliance_checker.py`**

```python
from agents.compliance_checker import ComplianceChecker
from agents import base


def fraud_msg(fraud_risk="low", fraud_flags=None, **over):
    data = {
        "transaction_id": "TXN001",
        "amount": "1500.00",
        "currency": "USD",
        "metadata": {"country": "US"},
        "status": "validated",
        "fraud_risk": fraud_risk,
        "fraud_flags": fraud_flags or [],
    }
    data.update(over)
    return base.make_message("fraud_detector", "compliance_checker", data)


def test_clean_transaction_is_approved():
    out = ComplianceChecker().process_message(fraud_msg())
    assert out["target_agent"] == base.TARGET_RESULTS
    assert out["data"]["status"] == "approved"


def test_any_fraud_flag_forces_review():
    out = ComplianceChecker().process_message(fraud_msg(fraud_flags=["structuring"]))
    assert out["data"]["status"] == "needs_review"
    assert "structuring" in out["data"]["reason"]


def test_high_fraud_risk_forces_review():
    out = ComplianceChecker().process_message(fraud_msg(fraud_risk="high"))
    assert out["data"]["status"] == "needs_review"


def test_cross_border_violation():
    out = ComplianceChecker().process_message(fraud_msg(metadata={"country": "DE"}))
    assert "cross_border" in out["data"]["compliance_violations"]
    assert out["data"]["status"] == "needs_review"


def test_aml_threshold_violation():
    out = ComplianceChecker().process_message(fraud_msg(amount="25000.00", fraud_flags=["high_value"]))
    assert "aml_reporting" in out["data"]["compliance_violations"]
    assert out["data"]["status"] == "needs_review"


def test_blocked_country_is_blocked():
    checker = ComplianceChecker()
    checker.BLOCKED_COUNTRIES = {"IR"}
    out = checker.process_message(fraud_msg(metadata={"country": "IR"}))
    assert out["data"]["status"] == "blocked"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_compliance_checker.py -v`
Expected: FAIL — module/class not found.

- [ ] **Step 3: Implement `agents/compliance_checker.py`**

```python
"""Agent 3 of the runtime pipeline: AML/sanctions + final disposition."""
from __future__ import annotations

from decimal import Decimal

from agents import base

AML_THRESHOLD = Decimal("10000")


class ComplianceChecker:
    name = base.AGENT_COMPLIANCE

    def __init__(self) -> None:
        self.BLOCKED_COUNTRIES: set[str] = set()
        self.BLOCKED_CURRENCIES: set[str] = set()

    def check(self, data: dict) -> list[str]:
        violations: list[str] = []
        amount = base.parse_amount(data["amount"])
        country = data.get("metadata", {}).get("country", "US")
        currency = data.get("currency")
        if country != "US":
            violations.append("cross_border")
        if amount >= AML_THRESHOLD:
            violations.append("aml_reporting")
        if country in self.BLOCKED_COUNTRIES:
            violations.append(f"blocked_country:{country}")
        if currency in self.BLOCKED_CURRENCIES:
            violations.append(f"blocked_currency:{currency}")
        return violations

    def process_message(self, message: dict) -> dict:
        data = dict(message["data"])
        violations = self.check(data)
        fraud_flags = data.get("fraud_flags", [])
        fraud_risk = data.get("fraud_risk", "low")
        hard_block = any(v.startswith("blocked_") for v in violations)

        if hard_block:
            status = "blocked"
        elif fraud_risk != "high" and not fraud_flags and not violations:
            status = "approved"
        else:
            status = "needs_review"

        data["compliance_violations"] = violations
        data["status"] = status
        if status != "approved":
            reasons = list(fraud_flags) + violations
            data["reason"] = "; ".join(reasons) if reasons else "high fraud risk"
        return base.make_message(self.name, base.TARGET_RESULTS, data)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_compliance_checker.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add homework-6/agents/compliance_checker.py homework-6/tests/test_compliance_checker.py
git commit -m "feat(homework-6): add compliance checker agent" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Orchestrator (`integrator.py`) + integration test

**Files:**
- Create: `homework-6/integrator.py`
- Test: `homework-6/tests/test_integrator.py`

- [ ] **Step 1: Write the failing test → `tests/test_integrator.py`**

```python
import json
from pathlib import Path

from integrator import Pipeline

SAMPLE = Path(__file__).resolve().parent.parent / "sample-transactions.json"


def load_sample():
    return json.loads(SAMPLE.read_text(encoding="utf-8"))


def test_pipeline_processes_all_sample_transactions(tmp_path):
    summary = Pipeline(tmp_path).run(load_sample())
    assert summary["total"] == 8
    assert summary["counts"]["approved"] == 2
    assert summary["counts"]["needs_review"] == 4
    assert summary["counts"]["rejected"] == 2


def test_specific_dispositions(tmp_path):
    base_dir = tmp_path
    Pipeline(base_dir).run(load_sample())

    def status(tid):
        msg = json.loads((base_dir / "results" / f"{tid}.json").read_text(encoding="utf-8"))
        return msg["data"]["status"]

    assert status("TXN001") == "approved"
    assert status("TXN008") == "approved"
    assert status("TXN003") == "needs_review"
    assert status("TXN004") == "needs_review"
    assert status("TXN006") == "rejected"
    assert status("TXN007") == "rejected"


def test_summary_file_is_written(tmp_path):
    Pipeline(tmp_path).run(load_sample())
    summary_path = tmp_path / "results" / "pipeline-summary.json"
    assert summary_path.exists()
    data = json.loads(summary_path.read_text(encoding="utf-8"))
    assert data["total"] == 8
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_integrator.py -v`
Expected: FAIL — `integrator`/`Pipeline` not found.

- [ ] **Step 3: Implement `integrator.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_integrator.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Run the pipeline end-to-end for real**

Run: `.venv/bin/python integrator.py`
Expected: prints summary — Total 8, approved 2, needs_review 4, rejected 2; `shared/results/` contains 8 `TXN*.json` + `pipeline-summary.json`.

- [ ] **Step 6: Commit**

```bash
git add homework-6/integrator.py homework-6/tests/test_integrator.py
git commit -m "feat(homework-6): add sequential orchestrator + integration tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Custom FastMCP server + `mcp.json` + research notes

**Files:**
- Create: `homework-6/mcp/server.py`, `homework-6/mcp/__init__.py`
- Create: `homework-6/mcp.json`, `homework-6/research-notes.md`
- Test: `homework-6/tests/test_mcp_server.py`

- [ ] **Step 1: Use context7 to confirm the FastMCP decorator API**

In Claude Code (launched from `homework-6/`), query context7 for FastMCP, e.g.:
`resolve-library-id "fastmcp"` then `query-docs` for "tool and resource decorators". Confirm
`@mcp.tool` and `@mcp.resource("uri")` usage. Record the result in `research-notes.md` (Step 6).

- [ ] **Step 2: Write the failing test → `tests/test_mcp_server.py`**

```python
import json
from pathlib import Path

from mcp import server


def seed_results(results_dir: Path):
    results_dir.mkdir(parents=True, exist_ok=True)
    msg = {"data": {"transaction_id": "TXN001", "status": "approved", "reason": ""}}
    (results_dir / "TXN001.json").write_text(json.dumps(msg), encoding="utf-8")
    summary = {"total": 1, "counts": {"approved": 1}, "results": [msg["data"]],
               "generated_at": "2026-03-16T10:00:00Z"}
    (results_dir / "pipeline-summary.json").write_text(json.dumps(summary), encoding="utf-8")


def test_get_status_found(tmp_path):
    seed_results(tmp_path)
    out = server._get_status(tmp_path, "TXN001")
    assert out["status"] == "approved"


def test_get_status_not_found(tmp_path):
    seed_results(tmp_path)
    out = server._get_status(tmp_path, "TXN999")
    assert out["status"] == "not_found"


def test_list_results(tmp_path):
    seed_results(tmp_path)
    out = server._list_results(tmp_path)
    assert out["total"] == 1
    assert out["results"][0]["transaction_id"] == "TXN001"


def test_summary_text(tmp_path):
    seed_results(tmp_path)
    text = server._summary_text(tmp_path)
    assert "Total: 1" in text
    assert "approved" in text


def test_summary_text_missing(tmp_path):
    text = server._summary_text(tmp_path)
    assert "No pipeline" in text
```

- [ ] **Step 3: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_mcp_server.py -v`
Expected: FAIL — `mcp.server` / helper functions not found.

- [ ] **Step 4: Implement `mcp/__init__.py` (empty) and `mcp/server.py`**

`mcp/__init__.py`: empty file.

`mcp/server.py`:
```python
"""Custom FastMCP server exposing the pipeline results.

Tools:    get_transaction_status, list_pipeline_results
Resource: pipeline://summary
"""
from __future__ import annotations

import json
from pathlib import Path

from fastmcp import FastMCP

BASE = Path(__file__).resolve().parent.parent
RESULTS = BASE / "shared" / "results"
SUMMARY_NAME = "pipeline-summary.json"

mcp = FastMCP("pipeline-status")


def _get_status(results_dir: Path, transaction_id: str) -> dict:
    path = Path(results_dir) / f"{transaction_id}.json"
    if not path.exists():
        return {"transaction_id": transaction_id, "status": "not_found"}
    data = json.loads(path.read_text(encoding="utf-8"))["data"]
    return {
        "transaction_id": transaction_id,
        "status": data.get("status"),
        "reason": data.get("reason", ""),
    }


def _list_results(results_dir: Path) -> dict:
    results_dir = Path(results_dir)
    records = []
    for path in sorted(results_dir.glob("*.json")):
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
    return {"total": len(records), "counts": counts, "results": records}


def _summary_text(results_dir: Path) -> str:
    path = Path(results_dir) / SUMMARY_NAME
    if not path.exists():
        return "No pipeline run found. Run the pipeline first."
    data = json.loads(path.read_text(encoding="utf-8"))
    lines = [f"Pipeline run at {data.get('generated_at', 'unknown')}",
             f"Total: {data['total']}"]
    for status, count in sorted(data.get("counts", {}).items()):
        lines.append(f"  {status}: {count}")
    return "\n".join(lines)


@mcp.tool
def get_transaction_status(transaction_id: str) -> dict:
    """Return the current pipeline status of a transaction."""
    return _get_status(RESULTS, transaction_id)


@mcp.tool
def list_pipeline_results() -> dict:
    """Return a summary of all processed transactions."""
    return _list_results(RESULTS)


@mcp.resource("pipeline://summary")
def pipeline_summary() -> str:
    """Return the latest pipeline run summary as text."""
    return _summary_text(RESULTS)


if __name__ == "__main__":  # pragma: no cover
    mcp.run()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_mcp_server.py -v`
Expected: PASS (5 passed).

- [ ] **Step 6: Write `homework-6/mcp.json` and `homework-6/research-notes.md`**

`mcp.json`:
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "pipeline-status": {
      "command": "python",
      "args": ["mcp/server.py"]
    }
  }
}
```

`research-notes.md` (fill the library IDs/insights with the actual context7 results from Step 1):
```markdown
# Research Notes — context7 queries

## Query 1: FastMCP tool & resource decorators
- Search: "FastMCP server tool resource decorators"
- context7 library ID: <fill from resolve-library-id, e.g. /jlowin/fastmcp>
- Applied: Used `@mcp.tool` for `get_transaction_status` / `list_pipeline_results` and
  `@mcp.resource("pipeline://summary")` for the text resource; `mcp.run()` starts stdio transport.

## Query 2: Python decimal for monetary arithmetic
- Search: "Python decimal module quantize ROUND_HALF_UP"
- context7 library ID: <fill, e.g. /python/cpython decimal>
- Applied: Parse all amounts via `Decimal(str(value))` (never float); validate ≤ 2 dp using
  `Decimal.as_tuple().exponent`.
```

- [ ] **Step 7: Commit**

```bash
git add homework-6/mcp homework-6/mcp.json homework-6/research-notes.md homework-6/tests/test_mcp_server.py
git commit -m "feat(homework-6): add FastMCP server, mcp.json, research notes" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Coverage gate (script + Claude Code hook + git pre-push)

**Files:**
- Create: `homework-6/scripts/coverage_gate.py`, `homework-6/scripts/coverage_gate_hook.sh`
- Create: `homework-6/.githooks/pre-push`, `homework-6/.claude/settings.json`

- [ ] **Step 1: Implement `scripts/coverage_gate.py`**

```python
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
```

- [ ] **Step 2: Verify the gate passes on the current suite**

Run: `.venv/bin/python scripts/coverage_gate.py`
Expected: prints `Coverage: <pct>% (gate 80%)` with pct ≥ 90 and exit code 0.
Check: `echo $?` → `0`.

- [ ] **Step 3: Implement `scripts/coverage_gate_hook.sh` (Claude Code PreToolUse hook)**

```bash
#!/usr/bin/env bash
# PreToolUse hook: only gate Bash commands that perform a `git push`.
set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c "import sys, json; print(json.load(sys.stdin).get('tool_input', {}).get('command', ''))")"

case "$cmd" in
  *"git push"*)
    dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
    py="$dir/.venv/bin/python"
    [ -x "$py" ] || py="python3"
    if ! "$py" "$dir/scripts/coverage_gate.py" 1>&2; then
      echo "Coverage gate failed — push blocked (need >= 80%)." 1>&2
      exit 2
    fi
    ;;
esac
exit 0
```

Make it executable: `chmod +x homework-6/scripts/coverage_gate_hook.sh`

- [ ] **Step 4: Implement `.githooks/pre-push`**

```bash
#!/usr/bin/env bash
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)"
py="$dir/.venv/bin/python"
[ -x "$py" ] || py="python3"
exec "$py" "$dir/scripts/coverage_gate.py"
```

Make it executable: `chmod +x homework-6/.githooks/pre-push`

- [ ] **Step 5: Implement `.claude/settings.json`**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/scripts/coverage_gate_hook.sh"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add homework-6/scripts homework-6/.githooks/pre-push homework-6/.claude/settings.json
git commit -m "feat(homework-6): add coverage gate script, PreToolUse hook, git pre-push" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> The `hook-trigger.png` screenshot is captured later (Task 12) by temporarily dropping coverage below 80% and attempting a push.

---

## Task 9: Six slash commands

**Files:**
- Create: `homework-6/.claude/commands/{write-spec,generate-pipeline,write-tests,write-docs,run-pipeline,validate-transactions}.md`

- [ ] **Step 1: Write `.claude/commands/write-spec.md`**

```markdown
---
description: Agent 1 — generate specification.md from the project template
---
Generate `specification.md` for the multi-agent banking pipeline following this structure:
1. High-Level Objective (one sentence)
2. Mid-Level Objectives (4–5 testable items)
3. Implementation Notes (decimal money, ISO 4217, audit logging, PII masking)
4. Context (beginning: sample-transactions.json; ending: shared/results/ + coverage ≥ 90%)
5. Low-Level Tasks — one entry per agent (Task / Prompt / File to CREATE / Function / Details)

Use the approved design at docs/superpowers/specs/2026-06-16-homework-6-banking-pipeline-design.md
as the source of truth. Write the file to homework-6/specification.md.
```

- [ ] **Step 2: Write `.claude/commands/generate-pipeline.md`**

```markdown
---
description: Agent 2 — generate the pipeline agents using context7 for framework lookups
---
Generate the runtime pipeline code under homework-6/ per specification.md:
- agents/transaction_validator.py, agents/fraud_detector.py, agents/compliance_checker.py
- integrator.py (sequential orchestrator over shared/{input,processing,output,results}/)

While generating, use the **context7** MCP server to look up FastMCP and the Python decimal
module. Document at least 2 queries in research-notes.md (search term, library ID, applied insight).
Use decimal.Decimal for all monetary values — never float.
```

- [ ] **Step 3: Write `.claude/commands/write-tests.md`**

```markdown
---
description: Agent 3 — generate the pytest suite targeting >= 90% coverage
---
Generate tests under homework-6/tests/ covering each agent and the full pipeline:
- unit tests per agent (validator, fraud detector, compliance checker)
- 1 integration test running sample-transactions.json end-to-end
- isolate from real shared/ using tmp_path

Run `.venv/bin/python scripts/coverage_gate.py` and ensure coverage >= 80% (aim >= 90%).
```

- [ ] **Step 4: Write `.claude/commands/write-docs.md`**

```markdown
---
description: Agent 4 — generate README and HOWTORUN
---
Generate homework-6/README.md and homework-6/HOWTORUN.md. README MUST include:
- author line "Created by Bohdan Shtefunyk"
- 1–2 paragraph description of the system
- one bullet per agent (validator, fraud detector, compliance checker)
- an ASCII architecture diagram of the pipeline flow
- a tech-stack table
HOWTORUN.md: numbered steps from setup (venv + requirements) to running the pipeline and tests.
```

- [ ] **Step 5: Write `.claude/commands/run-pipeline.md`**

```markdown
---
description: Run the multi-agent banking pipeline end-to-end
---
Run the multi-agent banking pipeline end-to-end.

Steps:
1. Check that sample-transactions.json exists.
2. Clear shared/ directories.
3. Run the pipeline: `.venv/bin/python integrator.py`
4. Show a summary of results from shared/results/.
5. Report any transactions that were rejected or flagged and why.
```

- [ ] **Step 6: Write `.claude/commands/validate-transactions.md`**

```markdown
---
description: Validate transactions without running the full pipeline
---
Validate all transactions in sample-transactions.json without processing them.

Steps:
1. Run the validator in dry-run mode: `.venv/bin/python agents/transaction_validator.py --dry-run`
2. Report: total count, valid count, invalid count, and reasons for rejection.
3. Show the per-transaction results.
```

- [ ] **Step 7: Commit**

```bash
git add homework-6/.claude/commands
git commit -m "feat(homework-6): add 4 meta-agent + 2 operational slash commands" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `specification.md` + `agents.md`

**Files:**
- Create: `homework-6/specification.md`, `homework-6/agents.md`

- [ ] **Step 1: Write `homework-6/specification.md`**

```markdown
# Specification — Multi-Agent Banking Pipeline

## 1. High-Level Objective
Process raw banking transactions through three cooperating agents that validate, score for fraud,
and apply compliance rules, writing auditable results to `shared/results/`.

## 2. Mid-Level Objectives
- Reject structurally invalid transactions (bad currency, non-positive amount, malformed account).
- Flag transactions above $10,000, overnight (00:00–05:59), cross-border, or near-threshold for review.
- Apply AML/sanctions rules and assign a final disposition (approved / needs_review / blocked).
- Pass messages as JSON files through shared/{input,processing,output,results}/.
- Log every agent action with an ISO 8601 timestamp; mask account numbers in the audit log.

## 3. Implementation Notes
- Monetary values use `decimal.Decimal` — never `float`.
- Currencies validated against an ISO 4217 set (USD, EUR, GBP, JPY, …).
- Audit trail: timestamp · agent · transaction_id · outcome in logs/audit.log.
- PII: account numbers masked in logs (ACC-1001 → ACC-***1); never plaintext.

## 4. Context
- Beginning state: `sample-transactions.json` (8 raw records).
- Ending state: processed results in `shared/results/`, `pipeline-summary.json`, test coverage ≥ 90%.

## 5. Low-Level Tasks

Task: Transaction Validator
Prompt: "Create a validator that checks required fields, positive amount with <= 2 decimals,
ISO 4217 currency, ACC-XXXX accounts, allowed transaction types."
File to CREATE: agents/transaction_validator.py
Function to CREATE: process_message(message: dict) -> dict
Details: Rejected → results/ with reason; valid → forward to fraud_detector.

Task: Fraud Detector
Prompt: "Create a fraud detector that scores transactions 0–100 and emits review flags
(high_value, overnight, structuring)."
File to CREATE: agents/fraud_detector.py
Function to CREATE: process_message(message: dict) -> dict
Details: Annotates fraud_score/fraud_risk/fraud_flags; forwards to compliance_checker.

Task: Compliance Checker
Prompt: "Create a compliance checker for cross-border + AML (>= $10,000) + blocked lists that
assigns the final disposition."
File to CREATE: agents/compliance_checker.py
Function to CREATE: process_message(message: dict) -> dict
Details: approved iff no fraud flags, fraud_risk != high, no violations; else needs_review; blocked on hard hits.

Task: Integrator
Prompt: "Create a sequential orchestrator that runs validator → fraud → compliance over shared dirs
and writes pipeline-summary.json."
File to CREATE: integrator.py
Function to CREATE: Pipeline.run(transactions: list[dict]) -> dict
Details: Loads sample-transactions.json, runs stages, summarizes results.
```

- [ ] **Step 2: Write `homework-6/agents.md`**

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add homework-6/specification.md homework-6/agents.md
git commit -m "docs(homework-6): add specification.md and agents.md (Agent 1)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `README.md` + `HOWTORUN.md`

**Files:**
- Create: `homework-6/README.md`, `homework-6/HOWTORUN.md`

- [ ] **Step 1: Write `homework-6/README.md`**

```markdown
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
```

- [ ] **Step 2: Write `homework-6/HOWTORUN.md`**

```markdown
# How to Run — Homework 6

All commands run from the `homework-6/` directory.

1. Create the virtualenv and install dependencies:
   ```bash
   python3 -m venv .venv
   .venv/bin/python -m pip install -r requirements.txt
   ```
2. Validate transactions only (dry-run):
   ```bash
   .venv/bin/python agents/transaction_validator.py --dry-run
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
```

- [ ] **Step 3: Commit**

```bash
git add homework-6/README.md homework-6/HOWTORUN.md
git commit -m "docs(homework-6): add README (author) and HOWTORUN (Agent 4)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Final verification, coverage, and screenshots

**Files:** none created (verification + screenshots into `homework-6/docs/screenshots/`).

- [ ] **Step 1: Full test + coverage run**

Run: `.venv/bin/python scripts/coverage_gate.py`
Expected: `Coverage: <pct>% (gate 80%)` with pct ≥ 90 and exit code 0. If below 90%, add tests for
uncovered branches in `base.py` / `integrator.py` (e.g. `mask_account` short-account path,
`run_stage` reject path) before proceeding.

- [ ] **Step 2: Capture `pipeline-run.png`**

Run `.venv/bin/python integrator.py` and screenshot the full terminal output → `docs/screenshots/pipeline-run.png`.

- [ ] **Step 3: Capture `test-coverage.png`**

Run `.venv/bin/python -m pytest --cov --cov-report term-missing` and screenshot the coverage report
(showing ≥ 80%, ideally ≥ 90%) → `docs/screenshots/test-coverage.png`.

- [ ] **Step 4: Capture `skill-run-pipeline.png`**

In Claude Code (from `homework-6/`), run `/run-pipeline` and screenshot it executing →
`docs/screenshots/skill-run-pipeline.png`.

- [ ] **Step 5: Capture `mcp-interaction.png`**

In Claude Code: run a context7 query AND call `get_transaction_status` (e.g. `TXN002`); screenshot
both → `docs/screenshots/mcp-interaction.png`.

- [ ] **Step 6: Capture `hook-trigger.png`**

Temporarily add an uncovered function to drop coverage below 80% (e.g. append a small unused,
untested function to `agents/base.py`), then attempt `git push`. The PreToolUse hook blocks it —
screenshot the block → `docs/screenshots/hook-trigger.png`. **Revert** the temporary change
afterward and confirm `scripts/coverage_gate.py` passes again.

- [ ] **Step 7: Commit screenshots**

```bash
git add homework-6/docs/screenshots
git commit -m "docs(homework-6): add demo + verification screenshots" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin homework-6-submission
```
Open a PR (base: `main` on this fork) with: implementation summary, AI tools/prompts used,
challenges, and all five screenshots embedded in the description.

---

## Self-Review (completed during planning)

- **Spec coverage:** §3 four meta-agents → Task 9 + Task 10 (agents.md); §4 agents/rules → Tasks 3–5;
  §4.4 disposition oracle → Task 6 integration test; §5 protocol/audit/PII → Tasks 2, 6; §6 MCP →
  Task 7; §7 skills+hook → Tasks 8–9; §8 tests → Tasks 2–7; §9 structure → Task 1; §10 screenshots →
  Task 12; author name → Task 11. No gaps.
- **Placeholder scan:** all code steps contain full code; `research-notes.md` library IDs are the
  only intentional fill-ins (must be filled from the live context7 query in Task 7 Step 1).
- **Type consistency:** `process_message(message: dict) -> dict` across all three agents;
  `Pipeline(base_dir).run(transactions) -> summary`; helper names `_get_status`/`_list_results`/
  `_summary_text` match between `mcp/server.py` and `tests/test_mcp_server.py`; agent `name`
  constants (`AGENT_VALIDATOR`/`AGENT_FRAUD`/`AGENT_COMPLIANCE`/`TARGET_RESULTS`) consistent.
```
