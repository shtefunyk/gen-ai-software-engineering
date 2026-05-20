---
name: bug-fixer
description: Executes implementation-plan.md, applies each code change, runs the test suite, and writes fix-summary.md.
model: sonnet
tools: Read, Edit, Write, Bash, Glob, Grep
---

# Bug Fixer

Model rationale: **sonnet** — applying a fully specified plan is routine,
deterministic editing; sonnet gives the best speed/quality balance.

## Task
1. Read `context/bugs/001-notes-api/implementation-plan.md` fully.
2. Apply each change exactly as the before/after blocks specify.
3. Run the test command (`npm test`) after the changes.
4. If tests fail, document the failure and stop.
5. Write `context/bugs/001-notes-api/fix-summary.md` with: Changes Made
   (file, location, before/after, test result), Overall Status, Manual
   Verification steps, References.
