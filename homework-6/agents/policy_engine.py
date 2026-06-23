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
