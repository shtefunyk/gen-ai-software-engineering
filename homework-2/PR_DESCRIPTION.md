## Summary

**Intelligent Customer Support System** — REST API with multi-format ticket import (CSV/JSON/XML) and Gemini 2.0 Flash auto-classification.

- 7 endpoints (CRUD + bulk import + auto-classify)
- LLM-only classification via `@google/genai` with structured JSON output (no rule-based fallback)
- In-memory `Map<id, ticket>`, Zod validation, single error envelope
- **91 tests / 17 files** + 1 opt-in live Gemini test
- **Coverage:** lines 95.77 / branches 89.34 / functions 94.23 / statements 93.8 (threshold 85)
- 4 Mermaid diagrams across 5 doc files

**Stack:** Node.js 20 (ESM), Express 5.2, `@google/genai` 1.51, Zod 3.23, Vitest 4, `csv-parse` 5, `fast-xml-parser` 5.

## How to verify

```bash
cd homework-2 && npm install && npm test            # 91/91, no API key needed
npm run coverage                                     # ≥85% across all metrics
npm start && curl http://localhost:3000/health       # then walk demo/sample-requests.http
npm run test:live                                    # optional, requires GEMINI_API_KEY
```

## AI tools

- **Claude Code (Opus 4.7)** with `superpowers` plugin: `brainstorming` → `writing-plans` → `subagent-driven-development` (hybrid: full review on critical tasks 13/14, lite on the rest). Library versions verified via `context7` MCP before bootstrap.
- **Gemini 2.0 Flash** at runtime for classification (mocked in default tests).
- Full prompt log in `docs/AI_USAGE.md`.

## Challenges

1. **ESLint 9 / `.eslintrc.cjs` mismatch** — flat-config only in v9, downgraded to 8.57. Caught by code-review subagent.
2. **`fast-xml-parser` v4 CVE** — bumped to v5.7.2 (API stayed compatible).
3. **Prompt-injection surface** — initial flat-string prompt let user content steer the model. Refactored to structured `contents` with `---BEGIN/END TICKET---` delimiters + empty-response guard.
4. **In-store mutation leak** — routes mutated live store refs, leaking transient `classification_error`. Added `ticketService.setClassification`; transient fields now compose into response only.
5. **Parser errors → 500 instead of 400** — wrapped `importService` call to re-emit non-`HttpError` as `HttpError(400)`.
6. **Vitest 4 mock quirks** — constructor mocks need `vi.fn(function() {...})` form; `mockRejectedValue` triggers unhandled-rejection tracking.

## Screenshots

**Design (4 brainstorming rounds → spec → plan):**

![](homework-2/docs/screenshots/02-design-discussion-1-tech-stack.png)
![](homework-2/docs/screenshots/02-design-discussion-2-classification.png)
![](homework-2/docs/screenshots/02-design-discussion-3-storage.png)
![](homework-2/docs/screenshots/02-design-discussion-4-screenshot-plan.png)
![](homework-2/docs/screenshots/03-spec-document.png)
![](homework-2/docs/screenshots/04-implementation-plan.png)

**Subagent-driven implementation:**

![](homework-2/docs/screenshots/19-claude-code-session-hybrid-choice.png)
![](homework-2/docs/screenshots/19-claude-code-session-task-progression.png)

**Tests passing (91/91):**

![](homework-2/docs/screenshots/15-tests-passing.png)

**Coverage (mandatory `test_coverage.png`):**

![](homework-2/docs/screenshots/test_coverage.png)

## Test plan

- [ ] `npm install && npm test` → 17 files / 91 passed
- [ ] `npm run coverage` → all metrics ≥85%
- [ ] `npm start` → `/health` returns 200
- [ ] `demo/sample-requests.http` walks all endpoints
- [ ] `npm run test:live` with `GEMINI_API_KEY` → real Gemini call passes

🤖 Generated with [Claude Code](https://claude.com/claude-code) (Opus 4.7)
