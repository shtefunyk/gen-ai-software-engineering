---
name: unit-tests-FIRST
description: Use when generating unit tests to ensure they follow the FIRST principles (Fast, Independent, Repeatable, Self-validating, Timely).
---

# Unit Tests — FIRST

Every generated test must satisfy FIRST:

- **Fast** — no network/disk/sleep; run in milliseconds. Use in-memory app + supertest.
- **Independent** — no shared state between tests; reset the store in `beforeEach`. Order must not matter.
- **Repeatable** — deterministic; no reliance on dates, randomness, or environment. Freeze/avoid `Date.now()` assertions.
- **Self-validating** — explicit `expect(...)` assertions; pass/fail is unambiguous, no manual inspection.
- **Timely** — written for the code changed in this fix only; cover the new/changed behaviour and its edge cases.

## Checklist before writing each test
- [ ] Targets only code listed in `fix-summary.md`.
- [ ] Resets shared state in `beforeEach`.
- [ ] Asserts a concrete value or status code.
- [ ] No external I/O or timing dependence.
- [ ] Includes at least one edge case (empty/invalid input).

`test-report.md` must state how the generated tests satisfy each FIRST letter.
