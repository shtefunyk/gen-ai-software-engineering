from agents.transaction_validator import TransactionValidator
from agents import base


def good_txn(**over):
    txn = {
        "transaction_id": "TXN001",
        "timestamp": "2026-03-16T09:00:00Z",
        "source_account": "ACC-1001",
        "destination_account": "ACC-2001",
        "amount": "1500.00",
        "currency": "USD",
        "transaction_type": "transfer",
        "metadata": {"country": "US"},
    }
    txn.update(over)
    return txn


def test_valid_transaction_passes_to_fraud():
    v = TransactionValidator()
    out = v.process_message(base.make_message("integrator", v.name, good_txn()))
    assert out["target_agent"] == base.AGENT_FRAUD
    assert out["data"]["status"] == "validated"


def test_invalid_currency_is_rejected():
    v = TransactionValidator()
    out = v.process_message(base.make_message("integrator", v.name, good_txn(currency="XYZ")))
    assert out["target_agent"] == base.TARGET_RESULTS
    assert out["data"]["status"] == "rejected"
    assert "currency" in out["data"]["reason"]


def test_negative_amount_is_rejected():
    v = TransactionValidator()
    errs = v.validate(good_txn(amount="-100.00"))
    assert any("positive" in e for e in errs)


def test_more_than_two_decimals_is_rejected():
    v = TransactionValidator()
    errs = v.validate(good_txn(amount="10.123"))
    assert any("decimal" in e for e in errs)


def test_bad_account_format_is_rejected():
    v = TransactionValidator()
    errs = v.validate(good_txn(source_account="1001"))
    assert any("source_account" in e for e in errs)


def test_missing_field_is_rejected():
    v = TransactionValidator()
    txn = good_txn()
    del txn["currency"]
    errs = v.validate(txn)
    assert any("currency" in e for e in errs)


def test_bad_amount_string_is_rejected():
    v = TransactionValidator()
    errs = v.validate(good_txn(amount="abc"))
    assert any("amount" in e for e in errs)
