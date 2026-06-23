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
