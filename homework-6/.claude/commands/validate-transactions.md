---
description: Validate transactions without running the full pipeline
---
Validate all transactions in sample-transactions.json without processing them.

Steps:
1. Run the validator in dry-run mode: `.venv/bin/python -m agents.transaction_validator --dry-run`
2. Report: total count, valid count, invalid count, and reasons for rejection.
3. Show the per-transaction results.
