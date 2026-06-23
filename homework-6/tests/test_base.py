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
