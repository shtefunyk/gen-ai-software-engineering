# Homework-6 Capstone Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the homework-6 banking pipeline with a configurable rule-engine agent, a FastAPI REST gateway, and a zero-step `demo.sh`, without breaking the file-based baseline.

**Architecture:** Insert a new `PolicyEngine` agent (driven by `config/rules.yaml`) between Fraud and Compliance; Compliance becomes config-driven and folds in the policy decision. A FastAPI factory wraps the existing `Pipeline` in-process and exposes HTTP endpoints. `demo/demo.sh` boots the API, submits the sample set, and prints verdicts.

**Tech Stack:** Python 3.13, PyYAML (rule config), FastAPI + uvicorn + httpx (gateway + TestClient), pytest + pytest-cov.

## Global Constraints

- Monetary values use `decimal.Decimal` — never `float`. (Rule engine coerces via `Decimal(str(x))`.)
- All work happens under `homework-6/`; commands run from that directory unless noted.
- Coverage gate is **80%** (`scripts/coverage_gate.py`, `THRESHOLD = 80.0`); target **≥90%**.
- Preserve the file-based baseline: agents keep the `class .name + process_message(message) -> message` shape; the `Pipeline.run` batch path stays valid.
- Message envelope is built only via `agents.base.make_message`; never hand-construct messages.
- Branch: `homework-6-final-workshop` (already created, base `homework-6-submission`). PR base = `homework-6-submission`.
- New disposition oracle for `sample-transactions.json` (8 records): **approved 2, needs_review 3, blocked 1, rejected 2**. TXN005 becomes `blocked` via the `high_value_wire_block` rule.

## File Structure

| File | Responsibility |
|---|---|
| `homework-6/rule_engine.py` (create) | Pure declarative rule engine: load + evaluate, no transport |
| `homework-6/config/rules.yaml` (create) | Declarative rules + watchlists (the configurable surface) |
| `homework-6/agents/policy_engine.py` (create) | `PolicyEngine` agent: annotate policy decision, forward to Compliance |
| `homework-6/agents/base.py` (modify) | Add `AGENT_POLICY` constant |
| `homework-6/agents/fraud_detector.py` (modify) | Forward to `policy_engine` instead of `compliance_checker` |
| `homework-6/agents/compliance_checker.py` (modify) | Config-driven blocked lists + fold `policy_decision` |
| `homework-6/integrator.py` (modify) | Load ruleset, add policy stage, add `process_one` |
| `homework-6/api/__init__.py` (create) | Make `api` an importable package |
| `homework-6/api/app.py` (create) | FastAPI factory wrapping `Pipeline` |
| `homework-6/demo/demo.sh` (create) | Zero-step demo orchestrator |
| `homework-6/demo/sample-requests.http` (create) | REST Client examples (CLAUDE.md `demo/` convention) |
| `homework-6/requirements.txt` (modify) | Add pyyaml, fastapi, uvicorn, httpx |
| `homework-6/pyproject.toml` (modify) | Add `rule_engine`, `api` to coverage source |
| `homework-6/README.md`, `homework-6/HOWTORUN.md` (modify) | Document new agent, API, demo |
| `homework-6/tests/test_rule_engine.py` (create) | Rule engine unit tests |
| `homework-6/tests/test_policy_engine.py` (create) | Policy agent unit tests |
| `homework-6/tests/test_api.py` (create) | API endpoint tests via TestClient |
| `homework-6/tests/test_fraud_detector.py` (modify) | Forward-target assertion → policy |
| `homework-6/tests/test_compliance_checker.py` (modify) | Config + policy folding tests |
| `homework-6/tests/test_integrator.py` (modify) | New oracle + `process_one` tests |

---

### Task 1: Configurable rule engine

**Files:**
- Create: `homework-6/rule_engine.py`
- Create: `homework-6/config/rules.yaml`
- Modify: `homework-6/requirements.txt`
- Test: `homework-6/tests/test_rule_engine.py`

**Interfaces:**
- Consumes: nothing (pure, stdlib + PyYAML).
- Produces:
  - `load_ruleset(path) -> RuleSet`
  - `RuleSet(rules, blocked_countries: list, blocked_currencies: list, raw: dict)` with `.evaluate(data: dict) -> PolicyResult`
  - `PolicyResult(decision: str, matched_rules: list, reasons: list)` where `decision ∈ {"allow","flag","review","block"}`
  - `Rule(id, when, action, reason, description)` with `.matches(data) -> bool`

- [ ] **Step 1: Add PyYAML to requirements and install**

Edit `homework-6/requirements.txt` to add `pyyaml>=6.0` (keep existing lines):

```
pyyaml>=6.0
fastmcp>=2.0.0
pytest>=8.0.0
pytest-cov>=5.0.0
```

Run:
```bash
cd homework-6 && .venv/bin/python -m pip install -q -r requirements.txt
```

- [ ] **Step 2: Create the rules config**

Create `homework-6/config/rules.yaml`:

```yaml
version: 1
rules:
  - id: high_value_wire_block
    description: Hard-block very large wire transfers
    when:
      all:
        - { field: amount, op: ">=", value: 50000 }
        - { field: transaction_type, op: "==", value: wire_transfer }
    action: block
    reason: high_value_wire
  - id: cross_border_review
    description: Route cross-border transactions to manual review
    when:
      - { field: metadata.country, op: "!=", value: US }
    action: review
    reason: cross_border
  - id: structuring_flag
    description: Flag amounts just under the $10k reporting threshold
    when:
      - { field: amount, op: between, value: [9000, 9999.99] }
    action: flag
    reason: structuring
watchlists:
  blocked_countries: [IR, KP, SY]
  blocked_currencies: []
```

- [ ] **Step 3: Write the failing tests**

Create `homework-6/tests/test_rule_engine.py`:

```python
from pathlib import Path

import rule_engine

CONFIG = Path(__file__).resolve().parent.parent / "config" / "rules.yaml"


def write_rules(tmp_path, text):
    p = tmp_path / "rules.yaml"
    p.write_text(text, encoding="utf-8")
    return p


def test_simple_clause_greater_equal(tmp_path):
    path = write_rules(tmp_path, """
rules:
  - id: big
    when: [ { field: amount, op: ">=", value: 1000 } ]
    action: review
    reason: big_amount
""")
    res = rule_engine.load_ruleset(path).evaluate({"amount": "1500.00"})
    assert res.decision == "review"
    assert "big" in res.matched_rules
    assert "big_amount" in res.reasons


def test_no_match_is_allow(tmp_path):
    path = write_rules(tmp_path, """
rules:
  - id: big
    when: [ { field: amount, op: ">=", value: 1000 } ]
    action: review
""")
    assert rule_engine.load_ruleset(path).evaluate({"amount": "10.00"}).decision == "allow"


def test_all_group_requires_both(tmp_path):
    path = write_rules(tmp_path, """
rules:
  - id: wire_block
    when:
      all:
        - { field: amount, op: ">=", value: 50000 }
        - { field: transaction_type, op: "==", value: wire_transfer }
    action: block
""")
    rs = rule_engine.load_ruleset(path)
    assert rs.evaluate({"amount": "75000", "transaction_type": "wire_transfer"}).decision == "block"
    assert rs.evaluate({"amount": "75000", "transaction_type": "transfer"}).decision == "allow"


def test_any_group(tmp_path):
    path = write_rules(tmp_path, """
rules:
  - id: either
    when:
      any:
        - { field: currency, op: "==", value: RUB }
        - { field: metadata.country, op: "==", value: IR }
    action: review
""")
    rs = rule_engine.load_ruleset(path)
    assert rs.evaluate({"currency": "USD", "metadata": {"country": "IR"}}).decision == "review"


def test_between_operator(tmp_path):
    path = write_rules(tmp_path, """
rules:
  - id: struct
    when: [ { field: amount, op: between, value: [9000, 9999.99] } ]
    action: flag
""")
    rs = rule_engine.load_ruleset(path)
    assert rs.evaluate({"amount": "9999.99"}).decision == "flag"
    assert rs.evaluate({"amount": "8000"}).decision == "allow"


def test_missing_dotted_field_does_not_match(tmp_path):
    path = write_rules(tmp_path, """
rules:
  - id: c
    when: [ { field: metadata.country, op: "!=", value: US } ]
    action: review
""")
    assert rule_engine.load_ruleset(path).evaluate({"amount": "1"}).decision == "allow"


def test_in_operator(tmp_path):
    path = write_rules(tmp_path, """
rules:
  - id: blocked_cur
    when: [ { field: currency, op: in, value: [RUB, IRR] } ]
    action: block
""")
    rs = rule_engine.load_ruleset(path)
    assert rs.evaluate({"currency": "RUB"}).decision == "block"
    assert rs.evaluate({"currency": "USD"}).decision == "allow"


def test_priority_block_beats_review(tmp_path):
    path = write_rules(tmp_path, """
rules:
  - id: r1
    when: [ { field: amount, op: ">=", value: 1 } ]
    action: review
  - id: r2
    when: [ { field: amount, op: ">=", value: 1 } ]
    action: block
""")
    res = rule_engine.load_ruleset(path).evaluate({"amount": "5"})
    assert res.decision == "block"
    assert set(res.matched_rules) == {"r1", "r2"}


def test_real_config_loads():
    rs = rule_engine.load_ruleset(CONFIG)
    assert any(r.id == "high_value_wire_block" for r in rs.rules)
    assert "IR" in rs.blocked_countries
    assert rs.raw["version"] == 1
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd homework-6 && .venv/bin/python -m pytest tests/test_rule_engine.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'rule_engine'`.

- [ ] **Step 5: Implement the rule engine**

Create `homework-6/rule_engine.py`:

```python
"""Configurable rule engine: declarative condition->action rules over a transaction dict."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

import yaml

PRIORITY = {"allow": 0, "flag": 1, "review": 2, "block": 3}


def _num(value) -> Decimal:
    return Decimal(str(value))


OPERATORS = {
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    ">": lambda a, b: _num(a) > _num(b),
    ">=": lambda a, b: _num(a) >= _num(b),
    "<": lambda a, b: _num(a) < _num(b),
    "<=": lambda a, b: _num(a) <= _num(b),
    "in": lambda a, b: a in b,
    "not_in": lambda a, b: a not in b,
    "between": lambda a, b: _num(b[0]) <= _num(a) <= _num(b[1]),
}


def _get_field(data: dict, path: str):
    cur = data
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _eval_clause(clause: dict, data: dict) -> bool:
    value = _get_field(data, clause["field"])
    if value is None:
        return False
    return OPERATORS[clause["op"]](value, clause["value"])


def _eval_when(when, data: dict) -> bool:
    if isinstance(when, dict) and "all" in when:
        return all(_eval_clause(c, data) for c in when["all"])
    if isinstance(when, dict) and "any" in when:
        return any(_eval_clause(c, data) for c in when["any"])
    if isinstance(when, list):
        return all(_eval_clause(c, data) for c in when)
    return _eval_clause(when, data)


@dataclass
class Rule:
    id: str
    when: object
    action: str
    reason: str = ""
    description: str = ""

    def matches(self, data: dict) -> bool:
        return _eval_when(self.when, data)


@dataclass
class PolicyResult:
    decision: str
    matched_rules: list
    reasons: list


@dataclass
class RuleSet:
    rules: list
    blocked_countries: list = field(default_factory=list)
    blocked_currencies: list = field(default_factory=list)
    raw: dict = field(default_factory=dict)

    def evaluate(self, data: dict) -> PolicyResult:
        decision = "allow"
        matched: list = []
        reasons: list = []
        for rule in self.rules:
            if rule.matches(data):
                matched.append(rule.id)
                if rule.reason:
                    reasons.append(rule.reason)
                if PRIORITY[rule.action] > PRIORITY[decision]:
                    decision = rule.action
        return PolicyResult(decision, matched, reasons)


def load_ruleset(path) -> RuleSet:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    rules = [
        Rule(
            id=r["id"],
            when=r["when"],
            action=r["action"],
            reason=r.get("reason", ""),
            description=r.get("description", ""),
        )
        for r in raw.get("rules", [])
    ]
    watchlists = raw.get("watchlists", {}) or {}
    return RuleSet(
        rules=rules,
        blocked_countries=list(watchlists.get("blocked_countries", []) or []),
        blocked_currencies=list(watchlists.get("blocked_currencies", []) or []),
        raw=raw,
    )
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd homework-6 && .venv/bin/python -m pytest tests/test_rule_engine.py -q`
Expected: PASS (10 passed).

- [ ] **Step 7: Commit**

```bash
git add homework-6/rule_engine.py homework-6/config/rules.yaml homework-6/requirements.txt homework-6/tests/test_rule_engine.py
git commit -m "feat(homework-6): add configurable rule engine + rules.yaml"
```

---

### Task 2: Policy Engine agent

**Files:**
- Create: `homework-6/agents/policy_engine.py`
- Modify: `homework-6/agents/base.py` (add `AGENT_POLICY`)
- Test: `homework-6/tests/test_policy_engine.py`

**Interfaces:**
- Consumes: `rule_engine.load_ruleset`, `RuleSet.evaluate`, `agents.base.make_message`, `agents.base.AGENT_COMPLIANCE`.
- Produces:
  - `agents.base.AGENT_POLICY = "policy_engine"`
  - `PolicyEngine(ruleset)` with `name = base.AGENT_POLICY` and `process_message(message) -> message` that adds `policy_decision`, `policy_rules`, `policy_reasons` to `data` and targets `compliance_checker`.

- [ ] **Step 1: Add the AGENT_POLICY constant**

Modify `homework-6/agents/base.py` — after the existing agent constants (around line 19), add `AGENT_POLICY`:

```python
AGENT_INTEGRATOR = "integrator"
AGENT_VALIDATOR = "transaction_validator"
AGENT_FRAUD = "fraud_detector"
AGENT_POLICY = "policy_engine"
AGENT_COMPLIANCE = "compliance_checker"
TARGET_RESULTS = "results"
```

- [ ] **Step 2: Write the failing tests**

Create `homework-6/tests/test_policy_engine.py`:

```python
import rule_engine
from agents import base
from agents.policy_engine import PolicyEngine

RULES = """
rules:
  - id: block_big_wire
    when:
      all:
        - { field: amount, op: ">=", value: 50000 }
        - { field: transaction_type, op: "==", value: wire_transfer }
    action: block
    reason: high_value_wire
"""


def make_engine(tmp_path):
    p = tmp_path / "rules.yaml"
    p.write_text(RULES, encoding="utf-8")
    return PolicyEngine(rule_engine.load_ruleset(p))


def msg(**over):
    data = {"transaction_id": "TXN001", "amount": "1000", "transaction_type": "transfer"}
    data.update(over)
    return base.make_message("fraud_detector", "policy_engine", data)


def test_forwards_to_compliance(tmp_path):
    out = make_engine(tmp_path).process_message(msg())
    assert out["target_agent"] == base.AGENT_COMPLIANCE


def test_allow_when_no_rule_matches(tmp_path):
    out = make_engine(tmp_path).process_message(msg())
    assert out["data"]["policy_decision"] == "allow"
    assert out["data"]["policy_rules"] == []


def test_block_decision_and_reason(tmp_path):
    out = make_engine(tmp_path).process_message(
        msg(amount="75000", transaction_type="wire_transfer"))
    assert out["data"]["policy_decision"] == "block"
    assert "block_big_wire" in out["data"]["policy_rules"]
    assert "high_value_wire" in out["data"]["policy_reasons"]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd homework-6 && .venv/bin/python -m pytest tests/test_policy_engine.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'agents.policy_engine'`.

- [ ] **Step 4: Implement the agent**

Create `homework-6/agents/policy_engine.py`:

```python
"""Runtime agent: configurable policy rule engine (between fraud and compliance)."""
from __future__ import annotations

from agents import base


class PolicyEngine:
    name = base.AGENT_POLICY

    def __init__(self, ruleset) -> None:
        self.ruleset = ruleset

    def process_message(self, message: dict) -> dict:
        data = dict(message["data"])
        result = self.ruleset.evaluate(data)
        data["policy_decision"] = result.decision
        data["policy_rules"] = result.matched_rules
        data["policy_reasons"] = result.reasons
        return base.make_message(self.name, base.AGENT_COMPLIANCE, data)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd homework-6 && .venv/bin/python -m pytest tests/test_policy_engine.py -q`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add homework-6/agents/base.py homework-6/agents/policy_engine.py homework-6/tests/test_policy_engine.py
git commit -m "feat(homework-6): add PolicyEngine agent driven by rule engine"
```

---

### Task 3: Wire Fraud→Policy and make Compliance config-driven

**Files:**
- Modify: `homework-6/agents/fraud_detector.py:50`
- Modify: `homework-6/agents/compliance_checker.py`
- Test: `homework-6/tests/test_fraud_detector.py:54-57`
- Test: `homework-6/tests/test_compliance_checker.py`

**Interfaces:**
- Consumes: `base.AGENT_POLICY`, `rule_engine.RuleSet` (`.blocked_countries`, `.blocked_currencies`), `data["policy_decision"]`, `data["policy_reasons"]`.
- Produces:
  - `FraudDetector.process_message` now targets `base.AGENT_POLICY`.
  - `ComplianceChecker(ruleset=None)` — populates `BLOCKED_COUNTRIES`/`BLOCKED_CURRENCIES` from the ruleset when given; folds `policy_decision` into the final status (`block` → blocked, `review` → needs_review).

- [ ] **Step 1: Update the fraud-detector forward-target test (red)**

In `homework-6/tests/test_fraud_detector.py`, replace `test_process_message_forwards_to_compliance` (lines 54-57) with:

```python
def test_process_message_forwards_to_policy():
    out = FraudDetector().process_message(base.make_message("v", "fraud_detector", txn()))
    assert out["target_agent"] == base.AGENT_POLICY
    assert out["data"]["fraud_risk"] == "low"
```

- [ ] **Step 2: Add the new compliance tests (red)**

Append to `homework-6/tests/test_compliance_checker.py`:

```python
import rule_engine


def test_policy_block_forces_blocked():
    out = ComplianceChecker().process_message(
        fraud_msg(policy_decision="block", policy_reasons=["high_value_wire"]))
    assert out["data"]["status"] == "blocked"
    assert "high_value_wire" in out["data"]["reason"]


def test_policy_review_forces_needs_review():
    out = ComplianceChecker().process_message(
        fraud_msg(policy_decision="review", policy_reasons=["cross_border"]))
    assert out["data"]["status"] == "needs_review"


def test_ruleset_populates_blocked_lists(tmp_path):
    p = tmp_path / "rules.yaml"
    p.write_text("watchlists:\n  blocked_countries: [IR]\n  blocked_currencies: [RUB]\n",
                 encoding="utf-8")
    checker = ComplianceChecker(ruleset=rule_engine.load_ruleset(p))
    assert checker.BLOCKED_COUNTRIES == {"IR"}
    out = checker.process_message(fraud_msg(metadata={"country": "IR"}))
    assert out["data"]["status"] == "blocked"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd homework-6 && .venv/bin/python -m pytest tests/test_fraud_detector.py tests/test_compliance_checker.py -q`
Expected: FAIL — fraud test fails on target assertion; compliance tests fail (`ComplianceChecker()` takes no `ruleset`, `policy_decision` ignored).

- [ ] **Step 4: Change the fraud forward target**

In `homework-6/agents/fraud_detector.py`, change the return in `process_message` (line 50) from `base.AGENT_COMPLIANCE` to `base.AGENT_POLICY`:

```python
        return base.make_message(self.name, base.AGENT_POLICY, data)
```

- [ ] **Step 5: Make Compliance config-driven and policy-aware**

Replace the body of `homework-6/agents/compliance_checker.py` (keep the module docstring and imports) with:

```python
AML_THRESHOLD = Decimal("10000")


class ComplianceChecker:
    name = base.AGENT_COMPLIANCE

    def __init__(self, ruleset=None) -> None:
        if ruleset is not None:
            self.BLOCKED_COUNTRIES = set(ruleset.blocked_countries)
            self.BLOCKED_CURRENCIES = set(ruleset.blocked_currencies)
        else:
            self.BLOCKED_COUNTRIES = set()
            self.BLOCKED_CURRENCIES = set()

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
        policy_decision = data.get("policy_decision", "allow")
        policy_reasons = data.get("policy_reasons", [])
        hard_block = any(v.startswith("blocked_") for v in violations) or policy_decision == "block"

        if hard_block:
            status = "blocked"
        elif policy_decision == "review":
            status = "needs_review"
        elif fraud_risk != "high" and not fraud_flags and not violations:
            status = "approved"
        else:
            status = "needs_review"

        data["compliance_violations"] = violations
        data["status"] = status
        if status != "approved":
            reasons = list(fraud_flags) + violations + list(policy_reasons)
            data["reason"] = "; ".join(reasons) if reasons else "high fraud risk"
        return base.make_message(self.name, base.TARGET_RESULTS, data)
```

- [ ] **Step 6: Run the affected tests to verify they pass**

Run: `cd homework-6 && .venv/bin/python -m pytest tests/test_fraud_detector.py tests/test_compliance_checker.py -q`
Expected: PASS (all green — old compliance tests still pass because the default `policy_decision="allow"` path is unchanged).

- [ ] **Step 7: Commit**

```bash
git add homework-6/agents/fraud_detector.py homework-6/agents/compliance_checker.py homework-6/tests/test_fraud_detector.py homework-6/tests/test_compliance_checker.py
git commit -m "feat(homework-6): fraud->policy routing; config-driven, policy-aware compliance"
```

---

### Task 4: Integrator — 4-stage pipeline + `process_one`

**Files:**
- Modify: `homework-6/integrator.py`
- Test: `homework-6/tests/test_integrator.py`

**Interfaces:**
- Consumes: `rule_engine.load_ruleset`, `PolicyEngine`, `ComplianceChecker(ruleset=...)`, `base.AGENT_POLICY`.
- Produces:
  - `Pipeline(base_dir, rules_path=None)` with `self.ruleset`, `self.policy`.
  - `Pipeline.process_one(txn: dict) -> dict` — runs one transaction through all four stages without clearing prior results; returns the final `data` record.
  - `Pipeline.run` now executes Validator → Fraud → Policy → Compliance.

- [ ] **Step 1: Update the integrator tests (red)**

In `homework-6/tests/test_integrator.py`, replace `test_pipeline_processes_all_sample_transactions` (lines 13-18) with the new oracle and extend `test_specific_dispositions` (after line 34) with the TXN005 assertion, then append the `process_one` tests:

```python
def test_pipeline_processes_all_sample_transactions(tmp_path):
    summary = Pipeline(tmp_path).run(load_sample())
    assert summary["total"] == 8
    assert summary["counts"]["approved"] == 2
    assert summary["counts"]["needs_review"] == 3
    assert summary["counts"]["blocked"] == 1
    assert summary["counts"]["rejected"] == 2
```

Add inside `test_specific_dispositions`, after the existing `assert status("TXN007") == "rejected"`:

```python
    assert status("TXN005") == "blocked"
```

Append two new tests at end of file:

```python
def test_process_one_returns_verdict(tmp_path):
    result = Pipeline(tmp_path).process_one(load_sample()[0])
    assert result["transaction_id"] == "TXN001"
    assert result["status"] == "approved"


def test_process_one_accumulates_results(tmp_path):
    p = Pipeline(tmp_path)
    p.process_one(load_sample()[0])   # TXN001 approved
    p.process_one(load_sample()[4])   # TXN005 blocked
    assert (tmp_path / "results" / "TXN001.json").exists()
    assert (tmp_path / "results" / "TXN005.json").exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd homework-6 && .venv/bin/python -m pytest tests/test_integrator.py -q`
Expected: FAIL — counts mismatch (`needs_review == 4`, no `blocked`), `process_one` AttributeError.

- [ ] **Step 3: Add imports and ruleset/policy wiring**

In `homework-6/integrator.py`, update the imports block (lines 7-10) to add the rule engine and policy agent:

```python
from agents import base
from agents.compliance_checker import ComplianceChecker
from agents.fraud_detector import FraudDetector
from agents.policy_engine import PolicyEngine
from agents.transaction_validator import TransactionValidator
import rule_engine
```

Replace `Pipeline.__init__` (lines 16-25) with:

```python
    def __init__(self, base_dir, rules_path=None) -> None:
        self.base = Path(base_dir)
        self.input = self.base / "input"
        self.processing = self.base / "processing"
        self.output = self.base / "output"
        self.results = self.base / "results"
        self.log_path = self.base.parent / "logs" / "audit.log"
        self.rules_path = Path(rules_path) if rules_path else Path(__file__).resolve().parent / "config" / "rules.yaml"
        self.ruleset = rule_engine.load_ruleset(self.rules_path)
        self.validator = TransactionValidator()
        self.fraud = FraudDetector()
        self.policy = PolicyEngine(self.ruleset)
        self.compliance = ComplianceChecker(ruleset=self.ruleset)
```

- [ ] **Step 4: Add the policy stage to `run` and add `process_one`**

In `Pipeline.run` (lines 75-84), insert the policy stage between fraud and compliance:

```python
    def run(self, transactions: list[dict]) -> dict:
        self.setup_dirs()
        self.clear()
        self.load(transactions)
        self.run_stage(self.validator, self.input)
        self.run_stage(self.fraud, self.output)
        self.run_stage(self.policy, self.output)
        self.run_stage(self.compliance, self.output)
        summary = self.summarize()
        (self.results / SUMMARY_NAME).write_text(json.dumps(summary, indent=2), encoding="utf-8")
        return summary
```

Add a new method directly after `run`:

```python
    def process_one(self, txn: dict) -> dict:
        self.setup_dirs()
        base.write_message(self.input,
                           base.make_message(base.AGENT_INTEGRATOR, base.AGENT_VALIDATOR, dict(txn)))
        self.run_stage(self.validator, self.input)
        self.run_stage(self.fraud, self.output)
        self.run_stage(self.policy, self.output)
        self.run_stage(self.compliance, self.output)
        path = self.results / f"{txn.get('transaction_id')}.json"
        return json.loads(path.read_text(encoding="utf-8"))["data"]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd homework-6 && .venv/bin/python -m pytest tests/test_integrator.py -q`
Expected: PASS (6 passed).

- [ ] **Step 6: Commit**

```bash
git add homework-6/integrator.py homework-6/tests/test_integrator.py
git commit -m "feat(homework-6): 4-stage pipeline with policy engine + process_one"
```

---

### Task 5: REST API gateway

**Files:**
- Create: `homework-6/api/__init__.py`
- Create: `homework-6/api/app.py`
- Modify: `homework-6/requirements.txt`
- Test: `homework-6/tests/test_api.py`

**Interfaces:**
- Consumes: `integrator.Pipeline` (`.process_one`, `.results`, `.summarize`, `.ruleset.raw`), `pipeline_status.get_status`, `pipeline_status.list_results`.
- Produces:
  - `api.app.create_app(base_dir=None, rules_path=None) -> FastAPI`
  - module-level `api.app.app` for uvicorn (`uvicorn api.app:app`)
  - Endpoints: `GET /health`, `POST /transactions` (201), `GET /transactions/{id}` (404 if missing), `GET /transactions`, `GET /summary`, `GET /rules`.

- [ ] **Step 1: Add API deps and install**

Edit `homework-6/requirements.txt` to add the gateway deps (final file):

```
pyyaml>=6.0
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
httpx>=0.27.0
fastmcp>=2.0.0
pytest>=8.0.0
pytest-cov>=5.0.0
```

Run:
```bash
cd homework-6 && .venv/bin/python -m pip install -q -r requirements.txt
```

- [ ] **Step 2: Write the failing API tests**

Create `homework-6/tests/test_api.py`:

```python
import json
from pathlib import Path

from fastapi.testclient import TestClient

from api.app import create_app

SAMPLE = Path(__file__).resolve().parent.parent / "sample-transactions.json"


def client(tmp_path):
    return TestClient(create_app(base_dir=tmp_path))


def sample(idx):
    return json.loads(SAMPLE.read_text(encoding="utf-8"))[idx]


def test_health(tmp_path):
    assert client(tmp_path).get("/health").json() == {"status": "ok"}


def test_submit_valid_returns_verdict(tmp_path):
    r = client(tmp_path).post("/transactions", json=sample(0))  # TXN001
    assert r.status_code == 201
    assert r.json()["transaction_id"] == "TXN001"
    assert r.json()["status"] == "approved"


def test_submit_blocked_by_policy(tmp_path):
    r = client(tmp_path).post("/transactions", json=sample(4))  # TXN005, 75k wire
    assert r.json()["status"] == "blocked"


def test_submit_invalid_currency_is_rejected(tmp_path):
    r = client(tmp_path).post("/transactions", json=sample(5))  # TXN006, XYZ
    assert r.status_code == 201
    assert r.json()["status"] == "rejected"


def test_get_transaction_after_submit(tmp_path):
    c = client(tmp_path)
    c.post("/transactions", json=sample(0))
    r = c.get("/transactions/TXN001")
    assert r.status_code == 200
    assert r.json()["status"] == "approved"


def test_get_unknown_transaction_404(tmp_path):
    assert client(tmp_path).get("/transactions/NOPE").status_code == 404


def test_list_and_summary(tmp_path):
    c = client(tmp_path)
    c.post("/transactions", json=sample(0))
    c.post("/transactions", json=sample(4))
    assert c.get("/transactions").json()["total"] == 2
    assert c.get("/summary").json()["total"] == 2


def test_rules_endpoint_exposes_config(tmp_path):
    body = client(tmp_path).get("/rules").json()
    assert any(r["id"] == "high_value_wire_block" for r in body["rules"])


def test_malformed_payload_422(tmp_path):
    r = client(tmp_path).post("/transactions", json={"transaction_id": "X"})
    assert r.status_code == 422
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd homework-6 && .venv/bin/python -m pytest tests/test_api.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'api'`.

- [ ] **Step 4: Create the package marker**

Create `homework-6/api/__init__.py` (empty file):

```python
```

- [ ] **Step 5: Implement the FastAPI factory**

Create `homework-6/api/app.py`:

```python
"""FastAPI gateway wrapping the file-based banking pipeline.

Run: `uvicorn api.app:app` from the homework-6/ directory.
The pipeline runs synchronously in-process; each POST returns the final verdict.
"""
from __future__ import annotations

import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from fastapi import FastAPI, HTTPException  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

import pipeline_status  # noqa: E402
from integrator import Pipeline  # noqa: E402


class TransactionIn(BaseModel):
    transaction_id: str
    timestamp: str
    source_account: str
    destination_account: str
    amount: str
    currency: str
    transaction_type: str
    description: str | None = None
    metadata: dict = Field(default_factory=dict)


def create_app(base_dir=None, rules_path=None) -> FastAPI:
    shared = Path(base_dir) if base_dir else BASE / "shared"
    pipeline = Pipeline(shared, rules_path=rules_path)
    pipeline.setup_dirs()
    app = FastAPI(title="Banking Pipeline API", version="1.0")

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/transactions", status_code=201)
    def submit(txn: TransactionIn) -> dict:
        return pipeline.process_one(txn.model_dump())

    @app.get("/transactions/{transaction_id}")
    def get_transaction(transaction_id: str) -> dict:
        status = pipeline_status.get_status(pipeline.results, transaction_id)
        if status["status"] == "not_found":
            raise HTTPException(status_code=404, detail="transaction not found")
        return status

    @app.get("/transactions")
    def list_transactions() -> dict:
        return pipeline_status.list_results(pipeline.results)

    @app.get("/summary")
    def summary() -> dict:
        return pipeline.summarize()

    @app.get("/rules")
    def rules() -> dict:
        return pipeline.ruleset.raw

    return app


app = create_app()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd homework-6 && .venv/bin/python -m pytest tests/test_api.py -q`
Expected: PASS (9 passed).

- [ ] **Step 7: Commit**

```bash
git add homework-6/api/__init__.py homework-6/api/app.py homework-6/requirements.txt homework-6/tests/test_api.py
git commit -m "feat(homework-6): add FastAPI REST gateway over the pipeline"
```

---

### Task 6: Zero-step demo script

**Files:**
- Create: `homework-6/demo/demo.sh`
- Create: `homework-6/demo/sample-requests.http`

**Interfaces:**
- Consumes: `api.app:app` via uvicorn, `sample-transactions.json`, the running HTTP endpoints.
- Produces: an executable `demo/demo.sh` that boots the API, submits the sample set, prints a verdict table + summary, and cleans up; exit 0.

- [ ] **Step 1: Create the demo script**

Create `homework-6/demo/demo.sh`:

```bash
#!/usr/bin/env bash
# Zero-step demo: boots the API gateway, submits the sample transactions,
# prints each verdict and the pipeline summary, then shuts down. No manual steps.
set -euo pipefail

HW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HW_DIR"

PORT="${PORT:-8077}"
BASE_URL="http://127.0.0.1:${PORT}"
VENV_PY=".venv/bin/python"

echo "==> [1/5] Virtualenv + dependencies"
if [ ! -x "$VENV_PY" ]; then
  python3 -m venv .venv
fi
"$VENV_PY" -m pip install -q -r requirements.txt

echo "==> [2/5] Starting API gateway on ${BASE_URL}"
"$VENV_PY" -m uvicorn api.app:app --host 127.0.0.1 --port "$PORT" --log-level warning &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> [3/5] Waiting for /health"
for _ in $(seq 1 40); do
  if curl -sf "${BASE_URL}/health" >/dev/null 2>&1; then
    echo "    API is up."
    break
  fi
  sleep 0.5
done

echo "==> [4/5] Submitting sample transactions"
"$VENV_PY" - "$BASE_URL" <<'PYEOF'
import json, sys, urllib.request, urllib.error
base = sys.argv[1]
txns = json.load(open("sample-transactions.json", encoding="utf-8"))
print(f"    {'TXN':9} {'STATUS':12} REASON")
print("    " + "-" * 52)
for t in txns:
    data = json.dumps(t).encode()
    req = urllib.request.Request(base + "/transactions", data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        body = json.load(urllib.request.urlopen(req))
        print(f"    {body.get('transaction_id',''):9} {body.get('status',''):12} {body.get('reason','')}")
    except urllib.error.HTTPError as e:
        print(f"    {t.get('transaction_id',''):9} HTTP {e.code}")
PYEOF

echo
echo "==> [5/5] Pipeline summary"
if command -v jq >/dev/null 2>&1; then
  curl -s "${BASE_URL}/summary" | jq .
else
  curl -s "${BASE_URL}/summary" | "$VENV_PY" -m json.tool
fi

echo
echo "Note: TXN005 (75,000 wire) is BLOCKED by the configurable rule 'high_value_wire_block'."
echo "      Edit config/rules.yaml and re-run to watch the disposition change."
echo "Demo complete. Swagger UI: ${BASE_URL}/docs"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x homework-6/demo/demo.sh`

- [ ] **Step 3: Create the REST Client examples**

Create `homework-6/demo/sample-requests.http`:

```
@base = http://127.0.0.1:8077

### Health
GET {{base}}/health

### Submit an approved transaction
POST {{base}}/transactions
Content-Type: application/json

{
  "transaction_id": "TXN001",
  "timestamp": "2026-03-16T09:00:00Z",
  "source_account": "ACC-1001",
  "destination_account": "ACC-2001",
  "amount": "1500.00",
  "currency": "USD",
  "transaction_type": "transfer",
  "description": "Monthly rent payment",
  "metadata": { "channel": "online", "country": "US" }
}

### Submit a transaction blocked by the rule engine
POST {{base}}/transactions
Content-Type: application/json

{
  "transaction_id": "TXN005",
  "timestamp": "2026-03-16T10:00:00Z",
  "source_account": "ACC-1005",
  "destination_account": "ACC-6600",
  "amount": "75000.00",
  "currency": "USD",
  "transaction_type": "wire_transfer",
  "description": "Property settlement",
  "metadata": { "channel": "branch", "country": "US" }
}

### Get one transaction
GET {{base}}/transactions/TXN001

### List all results
GET {{base}}/transactions

### Pipeline summary
GET {{base}}/summary

### Current rules
GET {{base}}/rules
```

- [ ] **Step 4: Syntax-check and run the demo end to end**

Run: `bash -n homework-6/demo/demo.sh`
Expected: no output (valid syntax).

Run: `homework-6/demo/demo.sh`
Expected: exits 0; the verdict table shows `TXN001 approved`, `TXN005 blocked`, `TXN006 rejected`, `TXN007 rejected`; the summary shows `approved 2, needs_review 3, blocked 1, rejected 2`.

- [ ] **Step 5: Commit**

```bash
git add homework-6/demo/demo.sh homework-6/demo/sample-requests.http
git commit -m "feat(homework-6): add zero-step demo.sh + sample-requests.http"
```

---

### Task 7: Coverage config, docs, and full gate

**Files:**
- Modify: `homework-6/pyproject.toml`
- Modify: `homework-6/README.md`
- Modify: `homework-6/HOWTORUN.md`

**Interfaces:**
- Consumes: nothing new — verifies the whole suite.
- Produces: coverage source covering `rule_engine` + `api`; updated docs; a passing gate.

- [ ] **Step 1: Extend coverage source**

In `homework-6/pyproject.toml`, update the coverage source line:

```toml
[tool.coverage.run]
source = ["agents", "integrator", "pipeline_status", "rule_engine", "api"]
omit = ["tests/*", "scripts/*", "mcp/*"]
```

- [ ] **Step 2: Update README**

In `homework-6/README.md`, add the Policy Engine to the **Agents** list (after Fraud Detector):

```markdown
- **Policy Engine** — applies declarative rules from `config/rules.yaml` (condition → flag /
  review / block); emits `policy_decision`, `policy_rules`, `policy_reasons`.
```

Replace the **Architecture** diagram block with the 4-agent + API version:

```
 sample-transactions.json                         HTTP client / demo.sh
            |                                              |
            v                                              v
   +-----------+   +--------+   +--------+   +------------+   FastAPI gateway
   | Validator |-->| Fraud  |-->| Policy |-->| Compliance |   (POST /transactions,
   +-----------+   +--------+   +--------+   +------------+    GET /transactions/{id},
            |          (rules.yaml) ^             |           /summary, /rules, /docs)
            +---------------(rejected)------------+
                                     v
                               shared/results/  (+ pipeline-summary.json)
                                     |
                                     v
                     FastMCP server (get_transaction_status,
                     list_pipeline_results, pipeline://summary)
```

Add to the **Tech Stack** table these rows:

```markdown
| API | FastAPI + uvicorn (synchronous gateway) |
| Rules | PyYAML-backed configurable rule engine |
```

- [ ] **Step 3: Update HOWTORUN**

In `homework-6/HOWTORUN.md`, append a new section after the existing steps:

```markdown
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
```

- [ ] **Step 4: Run the full coverage gate**

Run: `cd homework-6 && .venv/bin/python scripts/coverage_gate.py`
Expected: prints `Coverage: <pct>% (gate 80%)` with `<pct>` ≥ 90, and exits 0. Confirm with `echo $?` → `0`.

- [ ] **Step 5: Commit**

```bash
git add homework-6/pyproject.toml homework-6/README.md homework-6/HOWTORUN.md
git commit -m "docs(homework-6): document policy engine, API gateway, demo; extend coverage source"
```

---

### Task 8: Push branch and open the PR

**Files:** none (git/GitHub operations).

**Interfaces:**
- Consumes: all prior commits on `homework-6-final-workshop`.
- Produces: a pushed branch and an open PR with base `homework-6-submission`.

- [ ] **Step 1: Final verification before pushing**

Run: `cd homework-6 && .venv/bin/python scripts/coverage_gate.py && echo GATE_OK`
Expected: `Coverage: <≥90>% (gate 80%)` then `GATE_OK` (exit 0).

- [ ] **Step 2: Push the branch**

```bash
git push -u origin homework-6-final-workshop
```

- [ ] **Step 3: Open the PR (base = homework-6-submission)**

```bash
gh pr create --base homework-6-submission --head homework-6-final-workshop \
  --title "Homework-6 capstone extension: policy rule engine + REST gateway + demo" \
  --body "$(cat <<'EOF'
## Summary
Extends the homework-6 banking pipeline with three capstone capabilities on top of the file-based baseline:

1. **New agent + configurable rule engine** — `PolicyEngine` (Validator → Fraud → **Policy** → Compliance) evaluates declarative condition→action rules from `config/rules.yaml`; Compliance is now config-driven (fills the previously empty blocked-lists) and folds in the policy decision.
2. **REST API gateway** — FastAPI (`api/app.py`) wraps the pipeline in-process: `POST /transactions`, `GET /transactions/{id}`, `GET /transactions`, `GET /summary`, `GET /rules`, `GET /docs` (Swagger).
3. **Zero-step demo** — `demo/demo.sh` boots the API, submits the sample set, prints verdicts + summary, and cleans up.

The default rules make **TXN005 (75k wire)** `blocked`, so the sample oracle is now approved 2 / needs_review 3 / blocked 1 / rejected 2.

## AI tools / prompts used
Built with Claude Code via the superpowers brainstorming → writing-plans → subagent-driven-development workflow. Spec: `docs/superpowers/specs/2026-06-23-homework-6-capstone-extension-design.md`; plan: `docs/superpowers/plans/2026-06-23-homework-6-capstone-extension.md`.

## Tests
`scripts/coverage_gate.py` — full suite green, coverage ≥ 90% (gate 80%).

## Screenshots
_To be added: demo.sh run, Swagger /docs, POST+GET responses, rules.yaml live edit + flipped disposition, coverage ≥90%._

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Report the PR URL** to the user and remind them to capture the screenshots listed in the PR body.

---

## Self-Review

**Spec coverage** (each spec section → task):
- §3 Risk Policy Engine + rule engine → Tasks 1 (engine + config), 2 (agent), 3 (compliance folding), 4 (integrator wiring). ✓
- §4 REST API gateway (endpoints, sync model, `process_one`, 201, 404, 422) → Tasks 4 (`process_one`) + 5 (factory, routes, tests). ✓
- §5 `demo/demo.sh` + `sample-requests.http` → Task 6. ✓
- §6 Tests / coverage (rule_engine, policy_engine, api, compliance, integrator; ≥90%; new deps; coverage source) → Tasks 1–5 (tests) + 7 (coverage source + gate). ✓
- §7 Docs + Git (README/HOWTORUN, branch, PR base) → Tasks 7 (docs) + 8 (push/PR). ✓
- §8 Presentation plan → not code; captured in the spec, exercised by Task 6 demo. ✓
- §9 Out of scope (async, auth, fraud/validator externalization) → respected; no task adds them. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — every code step contains complete code. The only intentional placeholder is the PR body **Screenshots** line, which the user fills after running (per CLAUDE.md). ✓

**Type consistency:**
- `AGENT_POLICY = "policy_engine"` defined in Task 2, consumed in Tasks 2/3/4. ✓
- `PolicyEngine(ruleset)` / `.process_message` — defined Task 2, consumed Task 4. ✓
- `ComplianceChecker(ruleset=None)` — defined Task 3, consumed Task 4 (`ComplianceChecker(ruleset=self.ruleset)`). ✓
- `RuleSet.evaluate -> PolicyResult(decision, matched_rules, reasons)` — defined Task 1, consumed Task 2 (`result.decision/matched_rules/reasons`). ✓
- `RuleSet.blocked_countries/blocked_currencies/raw` — defined Task 1, consumed Tasks 3 (lists) and 5 (`pipeline.ruleset.raw`). ✓
- `Pipeline(base_dir, rules_path=None)`, `.process_one`, `.results`, `.summarize`, `.ruleset` — defined Task 4, consumed Task 5. ✓
- API verdict field names (`transaction_id`, `status`, `reason`) match the `data` record written by Compliance/Validator. ✓
