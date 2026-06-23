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
        return base.make_message(self.name, base.AGENT_POLICY, data)
