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
