from agents.compliance_checker import ComplianceChecker
from agents import base


def fraud_msg(fraud_risk="low", fraud_flags=None, **over):
    data = {
        "transaction_id": "TXN001",
        "amount": "1500.00",
        "currency": "USD",
        "metadata": {"country": "US"},
        "status": "validated",
        "fraud_risk": fraud_risk,
        "fraud_flags": fraud_flags or [],
    }
    data.update(over)
    return base.make_message("fraud_detector", "compliance_checker", data)


def test_clean_transaction_is_approved():
    out = ComplianceChecker().process_message(fraud_msg())
    assert out["target_agent"] == base.TARGET_RESULTS
    assert out["data"]["status"] == "approved"


def test_any_fraud_flag_forces_review():
    out = ComplianceChecker().process_message(fraud_msg(fraud_flags=["structuring"]))
    assert out["data"]["status"] == "needs_review"
    assert "structuring" in out["data"]["reason"]


def test_high_fraud_risk_forces_review():
    out = ComplianceChecker().process_message(fraud_msg(fraud_risk="high"))
    assert out["data"]["status"] == "needs_review"


def test_cross_border_violation():
    out = ComplianceChecker().process_message(fraud_msg(metadata={"country": "DE"}))
    assert "cross_border" in out["data"]["compliance_violations"]
    assert out["data"]["status"] == "needs_review"


def test_aml_threshold_violation():
    out = ComplianceChecker().process_message(fraud_msg(amount="25000.00", fraud_flags=["high_value"]))
    assert "aml_reporting" in out["data"]["compliance_violations"]
    assert out["data"]["status"] == "needs_review"


def test_blocked_country_is_blocked():
    checker = ComplianceChecker()
    checker.BLOCKED_COUNTRIES = {"IR"}
    out = checker.process_message(fraud_msg(metadata={"country": "IR"}))
    assert out["data"]["status"] == "blocked"
