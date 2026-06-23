from agents.fraud_detector import FraudDetector
from agents import base


def txn(**over):
    base_txn = {
        "transaction_id": "TXN001",
        "timestamp": "2026-03-16T09:00:00Z",
        "amount": "1500.00",
        "currency": "USD",
        "transaction_type": "transfer",
        "metadata": {"country": "US"},
    }
    base_txn.update(over)
    return base_txn


def assess(data):
    return FraudDetector().assess(data)


def test_low_value_clean_has_no_flags():
    score, flags = assess(txn())
    assert score == 0
    assert flags == []


def test_high_value_flag_over_10k():
    score, flags = assess(txn(amount="25000.00", transaction_type="wire_transfer"))
    assert "high_value" in flags
    assert score == 50  # 40 high-value + 10 wire


def test_very_high_value_is_high_risk():
    out = FraudDetector().process_message(
        base.make_message("v", "fraud_detector", txn(amount="75000.00", transaction_type="wire_transfer")))
    assert out["data"]["fraud_risk"] == "high"  # 40 + 30 + 10 = 80
    assert "high_value" in out["data"]["fraud_flags"]


def test_overnight_flag():
    score, flags = assess(txn(timestamp="2026-03-16T02:47:00Z", amount="500.00",
                              currency="EUR", metadata={"country": "DE"}))
    assert "overnight" in flags
    assert score == 40  # 25 overnight + 15 cross-border


def test_structuring_flag_near_threshold():
    score, flags = assess(txn(amount="9999.99"))
    assert "structuring" in flags
    assert score == 20


def test_process_message_forwards_to_policy():
    out = FraudDetector().process_message(base.make_message("v", "fraud_detector", txn()))
    assert out["target_agent"] == base.AGENT_POLICY
    assert out["data"]["fraud_risk"] == "low"
