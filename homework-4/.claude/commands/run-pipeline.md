---
description: Run the 4-agent pipeline (research verify → fix → security → tests) on the Notes API.
---

# /run-pipeline

Orchestrate the 4-agent pipeline in order. Run each step by dispatching the named
subagent via the Agent tool. Stop and report if a step's required input file is
missing or a step fails. After all steps, print a summary table of statuses and
the produced artifact paths.

## Preconditions
- `context/bugs/001-notes-api/research/codebase-research.md` exists.
- `context/bugs/001-notes-api/implementation-plan.md` exists.
If either is missing, stop with an error.

## Steps (run sequentially)

1. **Research Verifier** — dispatch the `research-verifier` subagent.
   Instruction: "Verify codebase-research.md per the research-quality-measurement
   skill and write verified-research.md."
   Gate: confirm `research/verified-research.md` was created.

2. **Bug Fixer** — dispatch the `bug-fixer` subagent.
   Instruction: "Apply implementation-plan.md to src/, run `npm test`, write
   fix-summary.md."
   Gate: confirm `fix-summary.md` exists and reports tests passing.

3. **Security Verifier** — dispatch the `security-verifier` subagent.
   Instruction: "Review the changed files per fix-summary.md and write
   security-report.md. Report only."
   Gate: confirm `security-report.md` exists.

4. **Unit Test Generator** — dispatch the `unit-test-generator` subagent.
   Instruction: "Generate FIRST-compliant tests for the changed code, run
   `npm test`, write test-report.md."
   Gate: confirm `test-report.md` exists and tests pass.

## Final output
Print a table: step | model | artifact | status (✅/❌).
