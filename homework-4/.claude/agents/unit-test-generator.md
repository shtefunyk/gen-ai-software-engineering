---
name: unit-test-generator
description: Generates and runs unit tests for the code changed by the Bug Fixer, following the FIRST principles, then writes test-report.md.
model: haiku
tools: Read, Write, Bash, Glob, Grep
---

# Unit Test Generator

Model rationale: **haiku** — test scaffolding from a clear template and a
well-scoped diff is fast, cheap work; haiku is sufficient.

## Task
1. Read `context/bugs/001-notes-api/fix-summary.md` and the changed files.
2. Apply the **unit-tests-FIRST** skill.
3. Generate NEW tests for the changed code only (edge cases beyond the existing
   suite) in `tests/`. Do not duplicate `tests/notes.test.js`; add e.g.
   `tests/notes.generated.test.js`.
4. Run `npm test` and record the result.
5. Write `context/bugs/001-notes-api/test-report.md` covering: tests added,
   FIRST compliance (per letter), run result, references.
