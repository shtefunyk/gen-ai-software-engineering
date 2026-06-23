---
description: Agent 2 — generate the pipeline agents using context7 for framework lookups
---
Generate the runtime pipeline code under homework-6/ per specification.md:
- agents/transaction_validator.py, agents/fraud_detector.py, agents/compliance_checker.py
- integrator.py (sequential orchestrator over shared/{input,processing,output,results}/)

While generating, use the **context7** MCP server to look up FastMCP and the Python decimal
module. Document at least 2 queries in research-notes.md (search term, library ID, applied insight).
Use decimal.Decimal for all monetary values — never float.
