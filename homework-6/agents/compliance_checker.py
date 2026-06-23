"""Agent 3 of the runtime pipeline: AML/sanctions + final disposition."""
from __future__ import annotations

from decimal import Decimal

from agents import base

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
            reasons: list[str] = []
            for reason in list(fraud_flags) + violations + list(policy_reasons):
                if reason not in reasons:
                    reasons.append(reason)
            data["reason"] = "; ".join(reasons) if reasons else "high fraud risk"
        return base.make_message(self.name, base.TARGET_RESULTS, data)
