# Specification — Multi-Agent Banking Pipeline

## 1. High-Level Objective
Process raw banking transactions through three cooperating agents that validate, score for fraud,
and apply compliance rules, writing auditable results to `shared/results/`.

## 2. Mid-Level Objectives
- Reject structurally invalid transactions (bad currency, non-positive amount, malformed account).
- Flag transactions above $10,000, overnight (00:00–05:59), cross-border, or near-threshold for review.
- Apply AML/sanctions rules and assign a final disposition (approved / needs_review / blocked).
- Pass messages as JSON files through shared/{input,processing,output,results}/.
- Log every agent action with an ISO 8601 timestamp; mask account numbers in the audit log.

## 3. Implementation Notes
- Monetary values use `decimal.Decimal` — never `float`.
- Currencies validated against an ISO 4217 set (USD, EUR, GBP, JPY, …).
- Audit trail: timestamp · agent · transaction_id · outcome in logs/audit.log.
- PII: account numbers masked in logs (ACC-1001 → ACC-***1); never plaintext.

## 4. Context
- Beginning state: `sample-transactions.json` (8 raw records).
- Ending state: processed results in `shared/results/`, `pipeline-summary.json`, test coverage ≥ 90%.

## 5. Low-Level Tasks

Task: Transaction Validator
Prompt: "Create a validator that checks required fields, positive amount with <= 2 decimals,
ISO 4217 currency, ACC-XXXX accounts, allowed transaction types."
File to CREATE: agents/transaction_validator.py
Function to CREATE: process_message(message: dict) -> dict
Details: Rejected → results/ with reason; valid → forward to fraud_detector.

Task: Fraud Detector
Prompt: "Create a fraud detector that scores transactions 0–100 and emits review flags
(high_value, overnight, structuring)."
File to CREATE: agents/fraud_detector.py
Function to CREATE: process_message(message: dict) -> dict
Details: Annotates fraud_score/fraud_risk/fraud_flags; forwards to compliance_checker.

Task: Compliance Checker
Prompt: "Create a compliance checker for cross-border + AML (>= $10,000) + blocked lists that
assigns the final disposition."
File to CREATE: agents/compliance_checker.py
Function to CREATE: process_message(message: dict) -> dict
Details: approved iff no fraud flags, fraud_risk != high, no violations; else needs_review; blocked on hard hits.

Task: Integrator
Prompt: "Create a sequential orchestrator that runs validator → fraud → compliance over shared dirs
and writes pipeline-summary.json."
File to CREATE: integrator.py
Function to CREATE: Pipeline.run(transactions: list[dict]) -> dict
Details: Loads sample-transactions.json, runs stages, summarizes results.
