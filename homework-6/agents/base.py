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
AGENT_POLICY = "policy_engine"
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
