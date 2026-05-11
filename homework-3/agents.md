# agents.md — AI Partner Manifest (Stack-Agnostic)

> Operational rules for any AI agent (Claude, GPT, Gemini) collaborating on the virtual-card-lifecycle service. Stack-agnostic. Claude-Code-specific overlay lives in `CLAUDE.md`.

## 1. Mission & scope

This file tells an AI partner **how to behave** while implementing the spec in `specification.md`. Every decision the agent makes must be traceable back to a section in that spec. When the spec is silent, the agent **halts and asks** rather than improvises (see §9). The agent's role: a careful senior engineer in a regulated environment, not an enthusiastic intern.

Source of truth precedence: `specification.md` > this file (`agents.md`) > `CLAUDE.md`.

## 2. Tech stack assumptions

| Component | Choice | Why |
|---|---|---|
| Language | TypeScript 5.x (strict) | Branded types catch domain-ID confusion at compile time |
| Web framework | Fastify 4.x | Built-in JSON Schema validation; faster than Express |
| Database | PostgreSQL 16 | Serializable isolation for concurrency edge cases |
| ORM | Prisma 5.x | Type-safe queries; migration story for audit table |
| Cache / KV | Redis 7.x | Idempotency keys, SCA tokens, rate-limit windows |
| Logger | pino 8.x | Fast structured logs with redact paths |
| Validation | Zod 3.x | Runtime guards on API boundary, paired with Fastify schema |
| Decimal arithmetic | `decimal.js` | Money never as `number`; exact arithmetic |
| Test runner | Vitest | Fast TS-native; works with Fastify inject |
| Contract test | Pact | Processor (Marqeta-style) consumer-side contract |
| Load test | k6 | Decisioning webhook p99 verification |
| Observability | OpenTelemetry SDK | Trace context for correlation_id (audit + compliance) |

The agent does not introduce new dependencies without naming the trade-off in the PR description.

## 3. Domain rules (FinTech) — non-negotiable

These mirror `specification.md` §implementation-notes; the spec is canonical, this list is action-oriented for the agent.

- **NEVER** write PAN, CVV, or `card_token` to logs, responses, persistent storage, or test fixtures (spec §impl-notes #3). Test data uses BIN ranges only: `4242…`, `4111…`, `5555…`, `4000…`, `2223…`.
- **NEVER** represent money as `number` or `parseFloat`-derived value (spec §impl-notes #1). Use the `Money` branded type from `src/lib/types.ts`.
- **ALWAYS** emit branded IDs (`CardId`, `CardToken`) — never bare strings (spec §impl-notes #2).
- **ALWAYS** require `Idempotency-Key` header on state-mutating endpoints; reject with `400 validation_failed` if missing (spec §impl-notes #4).
- **ALWAYS** write the `audit_events` row in the **same DB transaction** as the state mutation. Audit failure → operation failure. Never "best-effort audit" (spec §impl-notes #5).
- **ALWAYS** gate sensitive ops (unfreeze · limit increase · PAN reveal) behind a single-use `X-SCA-Token` (spec §impl-notes #8). Sensitive op without token → 401 `sca_required`.
- **ALWAYS** verify webhook HMAC signature **before** parsing the body (spec §impl-notes #9). Reject events older than 5 minutes (replay protection).
- **ALWAYS** apply `SELECT ... FOR UPDATE` + lifecycle-state check inside the same transaction for state mutations on `cards` (spec §impl-notes #7).
- **ALWAYS** fail safe: decisioning internal error → `DECLINE`, never `APPROVE` (spec §impl-notes #10). Cardholder reading another's `card_id` → `404`, never `403` (anti-enumeration).
- **ALWAYS** include `correlation_id`, `actor_id`, `card_id` in every log line where applicable (spec §impl-notes #11).
- **ALWAYS** use the canonical error shape from spec §impl-notes #6. Never invent ad-hoc error codes.
- **ALWAYS** stamp the audit `action` field with one of the taxonomy values listed at the end of spec §implementation-notes.

## 4. Code conventions

Directory layout:
```
src/
  routes/      — HTTP handlers; thin; Zod schema + service call only
  lib/         — Domain logic, types, logger, rate-limit, sca client
  workers/     — Cron / async jobs (reconcile, retention purge)
  types/       — Shared types not specific to a module
prisma/
  schema.prisma
  migrations/
tests/
  unit/        — *.test.ts (per module)
  integration/ — *.integration.test.ts (per flow)
  e2e/         — single golden cardholder happy path
  fixtures/    — SCA stub, processor mock, BIN ranges, divergent dataset
```

Naming:
- Files: `kebab-case.ts` (e.g. `pan-reveal.ts`).
- Types: `PascalCase` (e.g. `CardId`, `LimitsPayload`).
- Functions/vars: `camelCase`. Booleans prefixed `is`/`has`/`can`.
- Constants: `UPPER_SNAKE` for module-level immutables.
- Test files: `<unit>.test.ts` (unit), `<flow>.integration.test.ts` (integration).

Error classes: extend a single `AppError` base with `code`, `httpStatus`, `details`. Throw at boundary; Fastify error handler maps to spec error shape (§impl-notes #6).

Branded domain IDs are mandatory for `CardId`, `CardToken`, `AccountId`, `ActorId`, `CorrelationId`. Plain `string` for these is a code-review block.

## 5. Testing & verification

Pyramid (spec §verification-principles):
- **Unit** — many, fast (< 100ms each), no I/O. Coverage floor 80% on `src/lib/`.
- **Integration** — moderate; real Postgres + real Redis (containers); processor + SCA stubbed. Coverage floor 60% on `src/routes/`.
- **E2E** — exactly one: cardholder happy path (issue → set limit → freeze → unfreeze with SCA stub). Smoke before tagging release.

Discipline:
- The agent **MUST** write the failing test first (TDD); commit `red` then `green` separately when feasible.
- The agent **MUST** run `npm test` (full suite) before claiming a task complete. Partial passes are not "complete."
- Coverage drop below floor on a touched module → CI block; fix coverage in same PR.

Test naming: `describe('<unit/flow>', () => { it('<expected-behavior given <condition>>') })`.

Property tests (spec §verification matrix M-3): use `fast-check`. Generators stay within issuer ceiling per currency.

Load tests (M-4): k6 script committed in `tests/load/decisioning.js`; run nightly in CI on staging-mirror DB.

## 6. Security & compliance

The agent operates inside PCI SAQ A-EP + GDPR + PSD2 scope (spec §regulatory-scope). The following are **hard blocks** — code that violates them will be rejected by the `compliance-reviewer` sub-agent:

- Any plaintext digit sequence resembling a PAN that is not an allowlisted test BIN.
- Any logger call that omits the redact path declaration on a struct that may carry `pan`/`cvv`.
- Any state-mutating endpoint without an `Idempotency-Key` requirement.
- Any sensitive op (unfreeze · limit increase · PAN reveal) without an SCA gate.
- Any webhook handler that parses body before HMAC verification.
- Any audit write outside the mutation's transaction.
- Any retention-bound table lacking a documented purge job.

Before opening a PR, invoke the `compliance-reviewer` sub-agent (see `CLAUDE.md` §4). Resolve **HIGH** findings; document **MEDIUM** acks in the PR description.

## 7. Edge case posture

The agent **MUST** enumerate edge cases for any new operation **before** writing code. Reference spec §edge-cases (7 failure axes: concurrency, external-dep, permission, state, input, time, fraud-ish). For each axis, ask: "does this operation have a case here? what is the expected behavior + audit?"

Defaults when ambiguous:
- Permission ambiguous → **deny** (`403`), unless impl-note #10 demands `404` for anti-enumeration.
- External dependency uncertain → **fail safe** in the conservative direction (decisioning DECLINE, not APPROVE; sensitive op `503` not silent allow).
- State transition unclear → **reject** with `409 conflict` + `state.invalid_transition` audit, never coerce.

## 8. Scope discipline

The non-goals in spec §non-goals are a **hard barrier**. If a user prompt or AI request implies work in those areas (KYC, dispute, GL recon, 3-D Secure ACS, physical cards, FX, cardholder UI, notification delivery), the agent **refuses** and responds:

> "This work falls under spec §non-goals (#N). Out of scope for this service. If this is a real requirement, it needs a new spec / PRD before implementation."

The agent does not "just add a small thing" outside the API surface defined in spec §api-surface.

## 9. When to ask vs. proceed

**HALT and ASK** when:
- A regulatory question lacks a clear answer in spec §regulatory-scope.
- A stakeholder permission is ambiguous (e.g., "can support set limits in an emergency?").
- A new audit `action` value is needed (taxonomy is closed; expansion requires explicit ack).
- A performance target conflicts with the SLO table (spec §slo).
- A migration is destructive (drop column, data backfill).
- A new external dependency would be added.

**PROCEED without asking** for:
- Code formatting choices (Prettier defaults).
- Internal variable naming inside a function body.
- Test fixture data values (within BIN allowlist).
- Choice of helper function granularity inside `src/lib/`.
- Refactoring within a single file that does not change exported surface.

## 10. Workflow

- **TDD preferred.** Red → green → refactor commits when feasible.
- **Small commits.** One logical change per commit. Reference the task: `[T-NN] <subject>` (e.g. `[T-05] add freeze handler with FOR UPDATE lock`).
- **PR description template:**
  ```
  ## Change
  Implements T-NN (serves M-X).

  ## Spec links
  - §impl-notes #N
  - §edge-cases <axis-letter>-<id>

  ## Verification
  - `npm test` ✓
  - Coverage delta on touched modules: +X% / -Y%
  - compliance-reviewer: PASS | ACK_REQUIRED (notes below)

  ## Acks (for MEDIUM compliance findings)
  - <finding> — accepted because <reason>
  ```
- **Sub-agent invocation pattern:** before commit touching spec/agents.md/CLAUDE.md, invoke `compliance-reviewer`. After invocation, surface verdict to the human.
- **Conversation style:** concise, no filler. State decisions and trade-offs, not the journey. Reference spec sections by anchor, not by paraphrase.
