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
