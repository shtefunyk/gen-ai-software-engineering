# Intelligent Customer Support System — Design Spec

**Date:** 2026-05-03
**Homework:** 2 — Intelligent Customer Support System
**Stack:** Node.js ≥ 20 (ESM) + Express 5.2 + `@google/genai` (gemini-2.0-flash) + Vitest 4
**Storage:** In-memory `Map<id, ticket>`
**Auto-classification:** LLM-only (Gemini 2.0 Flash with structured output). No rule-based fallback.
**Linting:** ESLint + Prettier (consistent with homework-1)

---

## 1. Goal & Scope

Build a REST API for support tickets that:
1. Imports tickets from CSV / JSON / XML files via raw-body endpoint with `?format=` query param.
2. Auto-classifies tickets (category + priority) using Gemini 2.0 Flash with a JSON response schema.
3. Provides full CRUD with filtering.
4. Ships with ≥85% test coverage, integration + performance tests, and four specialized doc files plus an `AI_USAGE.md` log.

Anything not explicitly listed in `homework-2/TASKS.md` is out of scope (no auth, no pagination, no persistence, no Docker, no CI workflow).

---

## 2. Project Structure

```
homework-2/
├── src/
│   ├── index.js                       # entry point: starts the server
│   ├── app.js                         # Express app (no listen — for tests)
│   ├── config.js                      # env: PORT, GEMINI_API_KEY, NODE_ENV
│   ├── routes/
│   │   └── tickets.js                 # all /tickets endpoints (thin)
│   ├── services/
│   │   ├── ticketService.js           # CRUD + filtering over store
│   │   ├── importService.js           # parse + create-many with summary
│   │   └── classificationService.js   # Gemini call, schema, audit log
│   ├── validators/
│   │   └── ticket.js                  # Zod schemas: create / update / row
│   ├── store/
│   │   └── tickets.js                 # in-memory Map<id, ticket>
│   ├── parsers/
│   │   ├── csv.js                     # csv-parse wrapper
│   │   ├── json.js                    # JSON.parse + array assertion
│   │   └── xml.js                     # fast-xml-parser wrapper
│   ├── middleware/
│   │   ├── errorHandler.js            # 4-arg handler → {error, details}
│   │   └── rawBodyParser.js           # text/csv | text/xml | application/json → req.rawBody
│   └── utils/
│       └── logger.js                  # console wrapper + classification audit
├── tests/                             # Vitest
│   ├── ticket-api.test.js             # 11 — REST endpoints
│   ├── ticket-model.test.js           # 9  — validation rules
│   ├── import-csv.test.js             # 6
│   ├── import-json.test.js            # 5
│   ├── import-xml.test.js             # 5
│   ├── categorization.test.js         # 10 — Gemini SDK mocked
│   ├── integration.test.js            # 5  — end-to-end workflows
│   ├── performance.test.js            # 5  — concurrency + thresholds
│   ├── live-classification.test.js    # opt-in real Gemini (RUN_LIVE=1)
│   └── fixtures/                      # CSV/JSON/XML samples + invalid
├── demo/
│   ├── run.sh                         # npm i + npm start
│   ├── sample-requests.http           # all 7 endpoints + imports + negative cases
│   ├── sample_tickets.csv             # 50 rows
│   ├── sample_tickets.json            # 20 items
│   ├── sample_tickets.xml             # 30 tickets
│   └── invalid/                       # broken-csv.csv, broken-json.json, broken-xml.xml
├── docs/
│   ├── API_REFERENCE.md
│   ├── ARCHITECTURE.md
│   ├── TESTING_GUIDE.md
│   ├── AI_USAGE.md                    # log of which AI tool/model produced what
│   ├── screenshots/                   # see §10
│   └── superpowers/
│       ├── specs/2026-05-03-customer-support-design.md   # this file
│       └── plans/2026-05-03-customer-support-plan.md     # written next
├── package.json                       # "type": "module"
├── vitest.config.js                   # coverage thresholds: lines 85, branches 85
├── .env.example                       # GEMINI_API_KEY=
├── .gitignore                         # .env, node_modules, coverage
├── README.md                          # main readme (Developers audience)
└── HOWTORUN.md
```

**Layering principles:**
- `routes` are thin: parse query/body, call a service, format response.
- `services` operate on `store` directly. Services do not call each other.
- `validators` contain only Zod schemas. No business logic.
- `parsers` are pure: `(text) => rawObjects[]`. No HTTP awareness.

---

## 3. Data Model

In-memory `Map<string, Ticket>`. Ticket shape:

| Field | Type | Constraint |
|---|---|---|
| `id` | string | UUID v4 (`crypto.randomUUID()`) |
| `customer_id` | string | required |
| `customer_email` | string | RFC5322 |
| `customer_name` | string | required |
| `subject` | string | length 1..200 |
| `description` | string | length 10..2000 |
| `category` | enum | `account_access \| technical_issue \| billing_question \| feature_request \| bug_report \| other` |
| `priority` | enum | `urgent \| high \| medium \| low` |
| `status` | enum | `new \| in_progress \| waiting_customer \| resolved \| closed`; default `new` |
| `created_at` | ISO 8601 | set on create |
| `updated_at` | ISO 8601 | refreshed on each PUT |
| `resolved_at` | ISO 8601 \| null | set when status transitions to `resolved` |
| `assigned_to` | string \| null | optional |
| `tags` | string[] | default `[]` |
| `metadata.source` | enum | `web_form \| email \| api \| chat \| phone` |
| `metadata.browser` | string | optional |
| `metadata.device_type` | enum | `desktop \| mobile \| tablet` (optional) |
| `classification` | object \| undefined | present only after auto-classify; see §5 |

---

## 4. HTTP Contract

| # | Method | Path | Inputs | Status |
|---|---|---|---|---|
| 1 | POST | `/tickets` | JSON body + `?auto_classify=true` (optional) | 201 |
| 2 | POST | `/tickets/import` | raw text body + `?format=csv\|json\|xml` + optional `?auto_classify=true` | 201 \| 400 \| 415 |
| 3 | GET | `/tickets` | `?category=&priority=&status=&assigned_to=&tag=&from=&to=` | 200 |
| 4 | GET | `/tickets/:id` | — | 200 \| 404 |
| 5 | PUT | `/tickets/:id` | partial JSON body | 200 \| 400 \| 404 |
| 6 | DELETE | `/tickets/:id` | — | 204 \| 404 |
| 7 | POST | `/tickets/:id/auto-classify` | — | 200 \| 404 \| 422 \| 502 |

**Bulk import response:**
```json
{ "total": 50, "successful": 48, "failed": [{ "row": 12, "error": "customer_email invalid" }] }
```
Status is always **201**, even when `successful=0` — the action of attempting the import succeeded; per-row failures are payload-level data.

**Filter semantics on `GET /tickets`:**
- All filter params combine with AND.
- `from` / `to` apply to `created_at` (ISO 8601 inclusive).
- Unknown filter values → 400.

**`Content-Type` for `/tickets/import`:**
- `text/csv`, `text/xml`, or `application/json` — matched against `?format=`. Mismatch → 400.

---

## 5. Auto-Classification

### 5.1 Trigger points
- Explicit: `POST /tickets/:id/auto-classify`.
- Implicit: `POST /tickets?auto_classify=true` and `POST /tickets/import?auto_classify=true`.

### 5.2 Pipeline (`classificationService.classify(ticket)`)
1. Build prompt: subject, description, allowed categories, allowed priorities + their hint phrases (`urgent → "can't access" / "production down" / "security"` etc., taken verbatim from TASKS.md and embedded in the system instruction).
2. Call:
   ```js
   ai.models.generateContent({
     model: 'gemini-2.0-flash',
     contents: prompt,
     config: { responseMimeType: 'application/json', responseSchema: SCHEMA }
   })
   ```
3. Parse `response.text` as JSON.
4. Zod-validate the parsed object against `ClassificationResult`.
5. Persist on the ticket as `ticket.classification = {...result, classified_at, model: 'gemini-2.0-flash'}` and apply `category` + `priority` to the top-level ticket fields.
6. `logger.info('[classify]', { ticket_id, model, prompt_chars, result })`.

### 5.3 Response schema (sent to Gemini)

```json
{
  "type": "object",
  "properties": {
    "category":   { "type": "string", "enum": ["account_access","technical_issue","billing_question","feature_request","bug_report","other"] },
    "priority":   { "type": "string", "enum": ["urgent","high","medium","low"] },
    "confidence": { "type": "number" },
    "reasoning":  { "type": "string" },
    "keywords":   { "type": "array", "items": { "type": "string" } }
  },
  "required": ["category","priority","confidence","reasoning","keywords"]
}
```

Local Zod mirror enforces `confidence ∈ [0, 1]` and validates enums (Gemini schema doesn't constrain numeric ranges).

### 5.4 Error semantics (no fallback)

**Explicit endpoint `POST /tickets/:id/auto-classify` — fails loud:**

| Cause | Status |
|---|---|
| Gemini SDK throws (network, 5xx, rate limit) | 502 `{error:"Classification provider failed"}` |
| LLM returns invalid JSON or fails Zod schema | 422 `{error:"Classification response invalid"}` |
| Ticket id not found | 404 |

**Implicit `?auto_classify=true` during create/import — fails soft:** the ticket **is still created** with `category="other"`, `priority="medium"`, no `ticket.classification` block, and the response includes `classification_error: "<reason>"`. Status remains 201. This keeps bulk import resilient when individual rows trip the LLM.

### 5.5 Manual override
`PUT /tickets/:id` with `category` and/or `priority` overwrites top-level fields. The original `ticket.classification` block is preserved (history).

---

## 6. Validation & Error Handling

**Single error envelope:**
```json
{ "error": "Validation failed", "details": [{ "field": "customer_email", "message": "must be a valid email" }] }
```

| Scenario | Status |
|---|---|
| Zod validation fails | 400 |
| Ticket not found | 404 |
| Unknown `?format=` value | 415 |
| Parser throws (broken CSV/XML/JSON) | 400 |
| Body type doesn't match `?format=` | 400 |
| Gemini API error | 502 |
| Gemini response invalid | 422 |
| Anything else | 500 |

Express 5 catches async errors automatically — no `try/catch + next(err)` in route handlers.

---

## 7. Testing Strategy

**Default `npm test`** — fully mocked, deterministic, no `GEMINI_API_KEY` required, ≥85% coverage. Anyone (including the instructor) can clone and run.

**Mock surface:** `vi.mock('@google/genai')` returns a stub `GoogleGenAI` class whose `models.generateContent` resolves with a per-test fixture. Everything else (parsers, validators, store, routes, middleware) runs unmocked.

**Test file → assertions count (matches TASKS.md totals):**

| File | Tests | Coverage focus |
|---|---|---|
| `ticket-api.test.js` | 11 | All 7 endpoints, happy + 400/404, combined filters, partial PUT, DELETE 204 |
| `ticket-model.test.js` | 9 | Email format, length bounds, enum membership, required fields, ISO dates, UUID, tags array, `metadata.source` enum |
| `import-csv.test.js` | 6 | Valid 50, missing column, malformed quote, BOM, empty, mixed valid/invalid → partial success |
| `import-json.test.js` | 5 | Valid array, single object → 400, malformed, empty array, schema violation in one element |
| `import-xml.test.js` | 5 | Valid 30, malformed, unexpected root, namespace, empty `<tickets/>` |
| `categorization.test.js` | 10 | Each of 6 categories returned, each of 4 priorities returned, 422 on invalid JSON, 502 on API error, ticket carries `classification_error` when `auto_classify=true` fails, manual override via PUT |
| `integration.test.js` | 5 | Full lifecycle (create→classify→update→resolve→close), bulk import + auto_classify, combined filters, idempotent GET, 20+ concurrent ops |
| `performance.test.js` | 5 | 20 concurrent POST < 1s, import 50 < 500ms, GET filter over 1000 < 100ms, mocked classify p95 < 50ms, heap delta sane after 1000 ops |

**Total: 56 tests** (matches TASKS.md sum).

**Live test:** `tests/live-classification.test.js` is wrapped in `describe.skipIf(process.env.RUN_LIVE !== '1')`. Run via `npm run test:live`. It is excluded from coverage. Used locally to capture screenshot #18.

**Coverage gate:** `vitest.config.js` sets `coverage.thresholds = { lines: 85, branches: 85, functions: 85, statements: 85 }`.

---

## 8. Documentation Deliverables

TASKS.md asks for "5 documentation files" but lists 4. Resolution: ship the 4 specialized files **plus** `AI_USAGE.md` as the 5th, logging which AI tool / model / prompt produced each artifact.

| File | Audience | Mermaid |
|---|---|---|
| `homework-2/README.md` | Developers | Component diagram |
| `homework-2/docs/API_REFERENCE.md` | API consumers (cURL examples per endpoint) | — |
| `homework-2/docs/ARCHITECTURE.md` | Tech leads | High-level diagram + sequence diagram for `/auto-classify` |
| `homework-2/docs/TESTING_GUIDE.md` | QA | Test pyramid |
| `homework-2/docs/AI_USAGE.md` | Reviewer / instructor | — |
| `homework-2/HOWTORUN.md` | Anyone running locally | — |

Mermaid count: **4 across documents** (≥3 satisfied). "Different AI models for different doc types" is satisfied by generating each doc in a separate Claude Code session with different system framing, all logged in `AI_USAGE.md`.

---

## 9. Demo Plan

### `demo/run.sh`
```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
[ ! -f .env ] && cp .env.example .env && echo "Created .env — fill GEMINI_API_KEY"
npm install
npm start
```

### `demo/sample-requests.http`
- One request per endpoint (7 total)
- Three imports (CSV / JSON / XML) referencing fixture files
- One `auto-classify` against a previously created ticket
- One validation-failure case (400)
- One not-found case (404)
- Top of file: `@host = http://localhost:3000`

### Sample data
- `sample_tickets.csv` — 50 rows, even category distribution
- `sample_tickets.json` — 20 elements
- `sample_tickets.xml` — 30 tickets
- `invalid/` — `broken-csv.csv`, `broken-json.json`, `broken-xml.xml` for negative demo

---

## 10. Screenshot Capture Plan

All paths under `homework-2/docs/screenshots/`. Filenames are stable so links in PR description don't break.

| # | Filename | Capture moment | What's on screen |
|---|---|---|---|
| 1 | `01-initial-prompt.png` | First Claude Code prompt for HW2 | Editor / terminal showing the kickoff prompt |
| 2 | `02-design-discussion.png` | The current brainstorming dialog | Terminal with rounds 1–4 |
| 3 | `03-spec-document.png` | After this spec is committed | Spec file open in IDE |
| 4 | `04-implementation-plan.png` | After writing-plans skill | Plan file in IDE |
| 5 | `05-server-running.png` | After `npm start` | Terminal: `Server listening on :3000` |
| 6 | `06-create-ticket-curl.png` | First live `POST /tickets` | curl + 201 response |
| 7 | `07-import-csv.png` | CSV import | curl with `?format=csv` + summary |
| 8 | `08-import-json.png` | JSON import | curl + summary |
| 9 | `09-import-xml.png` | XML import | curl + summary |
| 10 | `10-import-partial-failure.png` | `invalid/broken-csv.csv` | response with `failed[]` populated |
| 11 | `11-auto-classify-real-gemini.png` | Live `/auto-classify` | curl + Gemini result with reasoning + keywords |
| 12 | `12-list-with-filters.png` | Combined filters | `?category=billing_question&priority=high` |
| 13 | `13-validation-error.png` | POST with bad email | 400 with `{error, details}` |
| 14 | `14-not-found.png` | GET unknown id | 404 |
| 15 | `15-tests-passing.png` | `npm test` | Vitest summary, all green |
| 16 | `test_coverage.png` | `npm run coverage` | Coverage table, ≥85% — **filename mandated by TASKS.md** |
| 17 | `17-coverage-html.png` | `coverage/index.html` open in browser | Per-file breakdown |
| 18 | `18-live-classification-test.png` | `npm run test:live` | Real Gemini call passes |
| 19 | `19-claude-code-session.png` | Any deep agent interaction | Non-trivial prompt + response |
| 20 | `20-ai-tools-collage.png` | Optional | Other AI tools used (Cursor / chat / etc.) |

**Embedded in PR description (critical evidence):** #5, #7, #11, #15, `test_coverage.png`, #19. Rest linked as a folder.

---

## 11. Out of Scope (YAGNI)

- Authentication / authorization
- Pagination on `GET /tickets`
- Persistent storage
- Docker / containerization
- CI workflow files
- Rule-based classification fallback
- A 5th specialized doc beyond `AI_USAGE.md`

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `@google/genai` API drift between context7 snapshot and actual npm | Re-check `npm view @google/genai` and live docs at implementation start |
| Coverage drops below 85% on edge branches | Vitest threshold fails the run; we add tests for hot paths immediately |
| Instructor prefers `multipart/form-data` for import | Documented contract (raw body + `?format=`) is explicit; if reviewer flags it, add `/tickets/import/upload` later |
| `live-classification.test.js` runs without a key | `describe.skipIf(!RUN_LIVE)` skips entirely |
| LLM returns out-of-range `confidence` | Zod `z.number().min(0).max(1)` → 422 |
| Unicode/BOM in CSV | `csv-parse` `bom: true` |

---

## 13. Process After This Spec

1. User reviews this spec; revise if needed.
2. Invoke `superpowers:writing-plans` to produce a detailed implementation plan in `docs/superpowers/plans/2026-05-03-customer-support-plan.md`.
3. After plan approval, implementation proceeds in phases (no code is written before then).
4. End-of-homework: refresh root `CLAUDE.md` with HW2-specific best practices captured during execution.
