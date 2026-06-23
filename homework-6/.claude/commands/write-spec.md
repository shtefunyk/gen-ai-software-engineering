---
description: Agent 1 — generate specification.md from the project template
---
Generate `specification.md` for the multi-agent banking pipeline following this structure:
1. High-Level Objective (one sentence)
2. Mid-Level Objectives (4–5 testable items)
3. Implementation Notes (decimal money, ISO 4217, audit logging, PII masking)
4. Context (beginning: sample-transactions.json; ending: shared/results/ + coverage ≥ 90%)
5. Low-Level Tasks — one entry per agent (Task / Prompt / File to CREATE / Function / Details)

Use the approved design at docs/superpowers/specs/2026-06-16-homework-6-banking-pipeline-design.md
as the source of truth. Write the file to homework-6/specification.md.
