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
