# Virtual Card Lifecycle — Specification

> Domain: virtual card lifecycle (issue · freeze · unfreeze · limits · reveal · transactions). Jurisdiction: EU/UK (PCI SAQ A-EP, GDPR, PSD2 SCA). Stack: TypeScript + Fastify + PostgreSQL + Prisma + Redis. Architecture: processor-delegated (Marqeta-style) + local limits ledger.
>
> Read by: engineering (impl), AI agents (planning), compliance (review). Hard cap: 500 lines. See `agents.md` for AI-partner rules; `CLAUDE.md` for Claude-Code-specific overlay.

## High-level objective

Cardholders manage their virtual card lifecycle (issue, freeze, unfreeze, set limits, view transactions, reveal PAN) through a regulated, auditable service that enforces local spending limits at processor decisioning time. Scope: card lifecycle only — KYC, dispute, FX, and physical cards are explicit non-goals.

## Mid-level objectives

**M-1 Foundation & guardrails** — service ships with structured PII-redacted logs, immutable audit trail, branded `Money`/`CardId`/`CardToken` types, and tiered rate limits.
*Observable:* pino redact blocks PAN/CVV/Authorization in logs · `audit_events` row written for every state mutation · non-tier-aware request rate-limited by stakeholder tier.

**M-2 Card lifecycle controls** *(cardholder + support)* — cardholder issues, freezes, unfreezes, and reveals PAN; support agent may freeze but never unfreeze nor reveal PAN.
*Observable:* cardholder completes issue→freeze→unfreeze in 3 API calls · support unfreeze/reveal returns 403 · SCA gates unfreeze and PAN reveal.

**M-3 Local spending limits** *(cardholder)* — cardholder configures daily/monthly/per-tx limits within issuer ceiling; **increases** trigger SCA, decreases do not.
*Observable:* limit changes persist with read-after-write within request · increase without SCA token returns 401 · limits enforced at decisioning (M-4).

**M-4 Real-time decisioning** *(processor + fraud service)* — decisioning webhook responds p99 < 250ms internal applying current limits + frozen state; fail-safe DECLINE on internal failure; fraud service may auto-freeze with 60s cooldown (anti-loop).
*Observable:* k6 load 100 RPS p99 < 250ms · chaos test (Postgres unavailable) returns DECLINE within 500ms hard cap · auto-freeze within cooldown ignored + audit `auto_freeze.cooldown_hit`.

**M-5 Auditability & reconciliation** *(ops/compliance)* — every state change → immutable audit log with actor identity + correlation_id; hourly delta reconciliation flags processor divergence; ops can query audit by `card_id` within tier-2 SLO.
*Observable:* audit query returns full lifecycle of any `card_id` (last 30d) at p99 < 1s · synthetic 5% divergence flagged at next hourly job · retention 7y (GDPR + EU fin records).

## Non-functional & policy

### Regulatory scope

| Regulation | How it appears in this service |
|---|---|
| **PCI DSS SAQ A-EP** | PAN/CVV display via processor iframe + ephemeral 60s token; never persisted/logged/returned in our APIs |
| **GDPR + UK GDPR** | Audit retention 7y then pseudonymise; data subject access returns cardholder PII only (no PCI data); processor = joint controller |
| **PSD2 SCA (RTS Art. 4)** | SCA mandatory before: unfreeze · limit increase · PAN reveal · dispute initiation (out of scope here) |
| **AML/KYC** | Inherited — `account.status=active` precondition; not enforced in this service |
| **Card scheme rules** (Visa/MC) | Inherited via processor; treated as external dependency |

### Service Level Objectives (assumed targets, justified for FinTech UX/ops)

| Operation | SLO | Rationale |
|---|---|---|
| Decisioning webhook (response to processor) | p99 < 250ms internal · hard cap 500ms | Marqeta gateway timeout 2s, recommended < 500ms; leave RTT headroom |
| Freeze card (user-blocking) | p99 < 800ms e2e (incl. processor) · p99 < 200ms internal | Security action UX; > 1s perceived as failure |
| Unfreeze card | p95 < 3s e2e (incl. SCA) · p99 < 200ms internal post-SCA | SCA latency is provider-side, excluded from our SLO |
| Set spending limit | p99 < 150ms | Local-only write to limits ledger |
| Get card details (no PAN) | p99 < 100ms | Indexed read |
| Reveal PAN (ephemeral token) | p99 < 1.5s (incl. SCA + processor mint) | SCA + processor RTT ceiling for tolerable UX |
| List transactions (page 50) | p99 < 200ms first page · p99 < 400ms next | Indexed + cache-friendly |
| Issue card (async) | p95 < 5s e2e · p99 < 300ms our sync part | Sync returns `pending`; processor confirms via webhook 1–3s |
| Audit log read (compliance) | p99 < 1s for last 30d · p99 < 5s for archived (≤ 7y) | Hot Postgres + cold S3 path |

### Cross-cutting limits

| Parameter | Value | Rationale |
|---|---|---|
| Rate limit (cardholder, read) | 60 req/min | Mobile + dashboard usage |
| Rate limit (cardholder, write) | 10 req/min | Anti-abuse |
| Rate limit (issue card) | 1 / 10s + 5 / 24h | Anti-fraud (mass issuance) |
| Rate limit (ops user, read) | 600 req/min | Investigation workflow |
| Idempotency key window | 24h | Industry standard (Stripe) |
| Webhook retry | exp backoff, max 5, max 24h | Match processor outbound retry |
| Read-after-write consistency | immediate within session · ≤ 200ms cross-replica | Postgres async replication |
| Reconciliation cadence | hourly delta + daily full | Compliance audit standard |

### Tiered availability

| Tier | Services | Uptime | Downtime budget |
|---|---|---|---|
| **0** | Decisioning webhook | 99.99% | ≤ 4.32 min/mo |
| **1** | Cardholder API (freeze, limits, get, list) | 99.95% | ≤ 21.6 min/mo |
| **2** | Ops/compliance backoffice | 99.9% | ≤ 43.2 min/mo |
| **3** | Reconciliation, audit log read | 99.5% | ≤ 3.6 h/mo |

### Disaster recovery

| Tier | RPO | RTO |
|---|---|---|
| **0** | 1 min (synchronous replication) | 15 min |
| **1** | 5 min | 1 h |
| **2** | 1 h | 4 h |

## Implementation notes (guardrails — non-negotiable)

1. **Money** — branded `Money` wrapper over `decimal.js` BigDecimal in cents; never `number`, never `parseFloat`; always paired with `currency: ISO 4217`. Operations (`add`/`sub`/`compare`) only on same-currency pair.
2. **Identifiers** — `CardId` = UUID v7 (sortable, index-friendly); `CardToken` = opaque processor reference, **never returned to client**. Branded types enforce mismatch at compile time.
3. **PAN/CVV** — NEVER persisted in our DB · NEVER in logs (pino redact) · NEVER in API responses. Display ONLY via processor iframe + ephemeral 60s token (T-12).
4. **Idempotency** — all state-mutating endpoints require `Idempotency-Key: <uuid>` header. 24h Redis TTL. Reuse with same body → cached response; reuse with different body → `409 Conflict` + audit.
5. **Audit events** — every state mutation writes `audit_events` row in the same DB transaction (atomic). Schema: `id, card_id, actor_id, actor_role, action, before_state, after_state, correlation_id, created_at` (`before/after` = JSONB). **Audit failure → operation failure.**
6. **Error shape** — `{ "error": "<code>", "message": "<human>", "details": [{"field":"...","message":"..."}], "correlation_id":"<uuid>" }`. Codes: `validation_failed`, `forbidden`, `not_found`, `conflict`, `sca_required`, `rate_limited`, `processor_unavailable`, `internal_error`.
7. **Concurrency** — state mutations on `cards` use `SELECT ... FOR UPDATE` + lifecycle-state check in same transaction. No optimistic locking (lifecycle ops infrequent; deadlock risk dominates stale-read risk).
8. **SCA flow** — sensitive op without token → `401 { "error":"sca_required", "challenge_id":"..." }`. Client → `/sca/verify` → `sca_token` (TTL 5 min, **single-use**) → retry original request with `X-SCA-Token` header.
9. **Webhook handling** — idempotent per processor `event_id` (Redis dedup, 7d TTL). Reject events older than 5 min (replay protection). HMAC body signature verified **before** parsing.
10. **Fail-safe defaults** — decisioning internal error → `DECLINE` (never APPROVE). Cardholder reading another's `card_id` → `404` (anti-enumeration), never `403`. Ambiguous role → `403`, never silent allow.
11. **Logging** — every line includes `correlation_id`, `actor_id`, `card_id` (where relevant). Levels `debug/info/warn/error/fatal`. `error+` triggers Prometheus + PagerDuty alert.
12. **Retention** — `audit_events` 7y (GDPR Art. 5(1)(e) + EU fin records); operational logs 90d; nightly purge job logs # purged.

**Audit event taxonomy:** `card.issued`, `card.frozen`, `card.unfrozen`, `card.limits_changed`, `card.pan_revealed`, `card.auto_frozen`, `decisioning.declined`, `decisioning.approved`, `sca.challenge_completed`, `webhook.replay_rejected`.

## Context

### Beginning context (assumed pre-existing)

External services:
- **Account service** — REST `/accounts/:id`; cardholder KYC-verified (`status=active`); issues JWT for cardholder API.
- **Processor** (Marqeta-style) — outbound REST + inbound webhooks; `card_program_id` + `api_key` in Vault.
- **SCA provider** — REST `challenge.create`/`challenge.verify`; OTP via SMS/email.
- **Identity service** — `user_id → roles` (`cardholder` / `support` / `ops` / `fraud_service`).
- **Fraud service** — internal RPC; calls `POST /cards/:id/auto-freeze`.

Infrastructure:
- **PostgreSQL 16** — primary + 1 read replica · `pgcrypto` enabled · serializable isolation available.
- **Redis cluster** — 3 nodes · AOF persistence (idempotency keys, SCA tokens, rate limits).
- **Audit sink** — Postgres `audit_events` (hot, 30d) + S3 cold archive (7y).
- **Vault** — secret management.
- **Observability** — pino → Loki · metrics → Prometheus · traces → Jaeger · OpenTelemetry SDK in boilerplate.

Repo state: framework boilerplate (Fastify skeleton, ESLint, Vitest config, Prisma init) **exists**. Card schema, routes, fixtures, tests — **absent** (this work delivers them).

### Non-goals (deliberately out of scope)

1. KYC / cardholder onboarding (precondition: `account.status=active`).
2. Dispute / chargeback workflow (we publish audit events; no dispute state machine).
3. General-ledger reconciliation (we reconcile with processor only).
4. 3-D Secure ACS (handled by processor at CNP authentication).
5. Physical card issuance (virtual only).
6. Multi-currency / FX conversion (limits and tx in card's native currency).
7. Cardholder UI (API only; OpenAPI consumed by mobile/web teams).
8. Notification delivery (separate service consumes our audit events).

### API surface (12 endpoints)

| Method | Path | Auth | Status codes | Mutates? | Idem? |
|---|---|---|---|---|---|
| POST | `/cards` | cardholder | 201, 400, 401, 409, 429 | ✓ | ✓ |
| GET | `/cards/:id` | cardholder/ops/support | 200, 403, 404 | – | – |
| POST | `/cards/:id/freeze` | cardholder/ops/support | 200, 403, 404, 409, 429 | ✓ | ✓ |
| POST | `/cards/:id/unfreeze` | cardholder/ops + SCA | 200, 401(SCA), 403, 404 | ✓ | ✓ |
| PUT | `/cards/:id/limits` | cardholder (+SCA on ↑) | 200, 400, 401(SCA), 403, 404 | ✓ | ✓ |
| GET | `/cards/:id/limits` | cardholder/ops/support | 200, 403, 404 | – | – |
| GET | `/cards/:id/transactions` | cardholder/ops | 200, 403, 404 | – | – |
| POST | `/cards/:id/pan-reveal-token` | cardholder + SCA | 201, 401(SCA), 403, 404 | ✓ | – |
| POST | `/cards/:id/auto-freeze` | fraud-service (M2M) | 200, 403, 404, 409 (cooldown) | ✓ | ✓ |
| POST | `/webhooks/decisioning` | processor (HMAC) | 200, 401, 410 (replay) | ✓ | ✓ (event_id) |
| POST | `/webhooks/card-events` | processor (HMAC) | 200, 401, 410 (replay) | ✓ | ✓ (event_id) |
| GET | `/admin/audit-events` | ops | 200, 403, 429 | – | – |

All mutating endpoints write `audit_events` row in same TX + emit event with `correlation_id`. Errors follow shape from §implementation-notes #6.

### Ending context (after this work)

Code & schema:
- DB migrations applied: `cards`, `card_limits`, `audit_events` (+ indexes on `card_id`, `created_at`, `actor_id`).
- Routes mounted (see API surface above).
- Hourly reconciliation cron + nightly retention purge cron registered.
- Branded types `CardId`/`CardToken`/`Money` exported from `lib/types`.

Tests & fixtures:
- SCA stub (3 modes: pass/fail/timeout), processor mock (recorded fixtures), BIN test ranges, synthetic divergent dataset (5%/15%/50%).
- Coverage ≥ 80% (`lib/`) and ≥ 60% (`routes/`); k6 load test report committed.

AI / process:
- `compliance-reviewer` sub-agent active in PR CI gate.
- `CLAUDE.md` + `.claude/settings.json` (PAN-leak hook + 500-line spec guard) committed.
- `agents.md` committed.

Ops:
- OpenAPI spec auto-generated from Fastify schemas.
- Runbook: decisioning DR drill procedure.
- Dashboards: decisioning p99, recon divergence %, SCA success rate.
- Alerts: tier-0 SLO breach, recon divergence > 1%, audit write failure.

## Stakeholders & RBAC

| Stakeholder | Authority | Cannot |
|---|---|---|
| **Cardholder** (`cardholder`) | Issue/freeze/unfreeze/set-limits/reveal-PAN/list-tx on own cards (SCA where required) | Touch other cardholders' cards · Bypass SCA on unfreeze |
| **Support agent** (`support`) | Read card metadata · Freeze any card (e.g., user reports loss) | **Unfreeze** · **Reveal PAN** · Set limits · Issue cards |
| **Ops/compliance** (`ops`) | Read all (incl. audit) · Force-freeze/unfreeze (SCA-gated; logged with elevated severity) | Issue cards · Reveal PAN |
| **Fraud service** (`fraud_service`, M2M) | Trigger `/auto-freeze` (60s cooldown) | All other operations |

Permission ambiguous → 403; cardholder reads another's `card_id` → 404 (anti-enumeration; impl-note #10).

## Edge cases (7 failure axes)

### Concurrency

| ID | Trigger | Expected behavior + audit |
|---|---|---|
| C-1 | Freeze arrives while decisioning webhook in-flight | Decisioning sees pre-freeze state (already locked); freeze applies after; subsequent decisions DECLINE · audit `card.frozen` with `prior_decision_correlation_id` |
| C-2 | Two sessions set conflicting limits same card | First commits via `FOR UPDATE`; second observes new state, applies on top · audit `card.limits_changed` × 2 |
| C-3 | Reconciliation runs while user-initiated freeze | Reconciler skips cards with active TX lock; retries next cycle |
| C-4 | Auto-freeze + user freeze within 1s | First wins; second returns `409` with current state · audit `card.frozen` once + `freeze.duplicate_ignored` |

### External dependency failure

| ID | Trigger | Expected |
|---|---|---|
| E-1 | Processor 5xx on issue | Persist `pending` row; retry backoff (5×, max 24h); user sees `pending` until webhook resolves; alert if > 5 min |
| E-2 | Decisioning webhook timeout (we exceed 250ms internally) | Internal alert; processor defaults policy after 500ms · audit `decisioning.timeout` (we still attempt write) |
| E-3 | SCA provider down | Sensitive op returns `503 sca_unavailable` (not silent allow) · audit `sca.provider_unavailable` · cardholder retries after recovery |
| E-4 | Inbound webhook from processor lost | Hourly reconciliation detects divergence, replays state from processor truth · audit `reconciliation.divergence_resolved` |
| E-5 | Vault unreachable on startup | Service refuses traffic; readiness probe fails; existing in-memory secrets continue (do not crash hot pods) |

### Permission boundary

| ID | Trigger | Expected |
|---|---|---|
| P-1 | Support invokes `POST /cards/:id/unfreeze` | `403 forbidden` · audit `permission.denied` with role + endpoint |
| P-2 | Cardholder X requests `GET /cards/:cardholder_y_id` | `404 not_found` (anti-enumeration; impl-note #10) · audit at `info` level |
| P-3 | Fraud service invokes `PUT /cards/:id/limits` | `403 forbidden` · audit `permission.denied` |
| P-4 | Ops force-unfreeze without SCA token | `401 sca_required` (no role escapes SCA on unfreeze) · audit `sca.required` |

### State / lifecycle

| ID | Trigger | Expected |
|---|---|---|
| S-1 | Set limit on frozen card | `409 conflict` with `current_state: frozen` · audit `state.invalid_transition` |
| S-2 | Reveal PAN on expired card | `409 conflict` · audit `card.expired_pan_reveal_attempted` |
| S-3 | Freeze already-frozen card | Idempotent: `200` with current state · audit `card.freeze.no_op` |
| S-4 | Unfreeze never-frozen card | `409 conflict` · audit `state.invalid_transition` |

### Input validation

| ID | Trigger | Expected |
|---|---|---|
| I-1 | Limit > issuer ceiling | `400 validation_failed` field=`*_limit` · audit at `info` |
| I-2 | Negative limit | `400 validation_failed` field=`*_limit` |
| I-3 | Currency mismatch (limit currency ≠ card currency) | `400 validation_failed` field=`currency` |
| I-4 | Idempotency-Key reused with different body | `409 conflict` + diff snippet · audit `idempotency.body_mismatch` |
| I-5 | Missing Idempotency-Key on mutating endpoint | `400 validation_failed` field=`Idempotency-Key` header |

### Time / staleness

| ID | Trigger | Expected |
|---|---|---|
| T-1 | SCA challenge expired (5 min) | `401 sca_required` with new `challenge_id` · audit `sca.expired` |
| T-2 | Idempotency window expired (24h) | Treated as new request; new audit row |
| T-3 | Card expires during in-flight request | Operation-dependent: read OK, mutation `409 conflict` · audit `card.expired` |
| T-4 | SCA token used twice (single-use) | Second attempt `401 sca_required` · audit `sca.token.reuse` |

### Fraud-ish patterns

| ID | Trigger | Expected |
|---|---|---|
| F-1 | Cardholder hits `1/10s` issue rate-limit | `429 rate_limited` Retry-After · audit `rate_limit.issue_burst` |
| F-2 | Freeze loop (freeze/unfreeze N×/min via API) | After 3 cycles in 1 min, lock card to ops review · audit `fraud.freeze_loop_detected` |
| F-3 | Auto-freeze invoked within 60s cooldown | `409 conflict` · audit `auto_freeze.cooldown_hit` |
| F-4 | PAN reveal token requested 3× in 5 min for same card | Subsequent requires elevated SCA + ops alert · audit `pan_reveal.suspicious_burst` |

## Verification

### Per-objective verification matrix

| M | Test categories | Fixtures | Human / manual |
|---|---|---|---|
| **M-1** | Unit: redact config · Integration: audit row per mutation · SAST: PAN regex on CI | Golden card record · pre-recorded log lines | Quarterly PCI scope review |
| **M-2** | Unit: RBAC matrix per stakeholder × op · Integration: SCA flow with stub · E2E: cardholder happy path | SCA stub modes (pass/fail/timeout) | Monthly support permission spot check |
| **M-3** | Unit: validation (ceiling/sign/decimals) · Integration: increase-without-SCA → 401 · Property: random limits within ceiling always accepted | Issuer ceiling table per currency (EUR/GBP/USD) | – |
| **M-4** | Load (k6): 100 RPS sustained 10 min → p99 < 250ms · Chaos: kill Postgres mid-flight → DECLINE within 500ms · Contract: Marqeta mock against recorded fixtures | Synthetic 10k transactions · chaos scenarios catalog | Semi-annual decisioning DR drill (recorded) |
| **M-5** | Integration: audit query API returns full lifecycle · Recon test: synthetic 5%/15%/50% divergence → 100% flagged · Retention test: records > 7y purged | Synthetic divergent datasets | Annual SOC 2 audit prep checklist |

### Principles

- **Test pyramid** — many unit (fast), moderate integration, one E2E golden cardholder flow.
- **Coverage floor** — 80% on `src/lib/`, 60% on `src/routes/`; CI blocks below.
- **All DoD machine-checkable** — except 2 explicit human checks above; no "looks right" criteria.
- **Test data hygiene** — never real PAN even in fixtures; only test BIN ranges (`4242…`); documented in `agents.md`.

### CI gates (blocking merge)

| Gate | Tool / mechanism |
|---|---|
| Lint + type check | `eslint` + `tsc --noEmit` |
| Unit + integration | `vitest` (fail on coverage floor) |
| Contract test | `pact` against processor mock fixtures |
| SAST: PAN/secret scan | `gitleaks` + custom regex |
| Dep vulnerability | `npm audit --audit-level=high` |
| Pre-merge AI review | Claude Code `compliance-reviewer` sub-agent (PCI/GDPR diff scan) |

## Low-level tasks

Format: `T-NN — title [serves M-X]` · file · surface · prompt seed · details · DoD.

### T-01 — Schema migration: cards/card_limits/audit_events [serves M-1]
**File:** `prisma/migrations/0001_init/migration.sql` · **Surface:** Prisma migration
**Prompt seed:** "Create initial migration with cards, card_limits, audit_events per spec §impl-notes #5 and §context Ending."
**Details:** `cards(id, card_token, account_id, status, currency, expires_at, created_at)`; `card_limits(card_id, kind, amount, currency, updated_at)`; `audit_events(id, card_id, actor_id, actor_role, action, before_state JSONB, after_state JSONB, correlation_id, created_at)`. Indexes: `audit_events(card_id, created_at)`, `audit_events(actor_id)`. All money in cents (BIGINT).
**DoD:** `prisma migrate deploy` succeeds on empty DB; `prisma migrate diff` against schema returns empty.

### T-02 — Branded types `CardId`/`CardToken`/`Money` [serves M-1]
**File:** `src/lib/types.ts` · **Surface:** module export
**Prompt seed:** "Define branded types per spec §impl-notes #1, #2 with Zod runtime guards."
**Details:** TypeScript branded types via intersection + unique symbol; `Money` wraps `decimal.js` with currency tag; ops only on same-currency.
**DoD:** Mixing `CardId` and `CardToken` produces compile error; cross-currency `add` throws at runtime; 100% lib coverage on this module.

### T-03 — pino logger with redact list [serves M-1]
**File:** `src/lib/logger.ts` · **Surface:** module export
**Prompt seed:** "Configure pino with redact paths per spec §impl-notes #3, #11; add correlation_id middleware."
**Details:** Redact: `req.headers.authorization`, `*.pan`, `*.cvv`, `*.card_number`. Hook to inject `correlation_id` from request context.
**DoD:** Logging an object with `pan` field outputs `[Redacted]`; load test shows < 5% perf overhead.

### T-04 — POST /cards (issue, async, idempotent) [serves M-2]
**File:** `src/routes/cards/create.ts` · **Surface:** `POST /cards`
**Prompt seed:** "Implement async card issue per spec §api-surface and §edge-cases E-1, I-4, I-5."
**Details:** Validate Idempotency-Key; call processor with timeout 3s; persist `pending` row + audit `card.issued` in same TX; return 201 with `card_id` + `status:pending`.
**DoD:** Same Idempotency-Key within 24h returns same 201 (Redis cache); different body same key → 409; processor 5xx → still 201 `pending` + retry job scheduled.

### T-05 — POST /cards/:id/freeze [serves M-2]
**File:** `src/routes/cards/freeze.ts` · **Surface:** `POST /cards/:id/freeze`
**Prompt seed:** "Implement freeze per spec §impl-notes #7 (concurrency) and §edge-cases C-1, C-4, S-3."
**Details:** `SELECT ... FOR UPDATE` on card row; check current state; set `status=frozen`; audit `card.frozen` in same TX; call processor `freeze` async; return 200 with current state.
**DoD:** Idempotent on already-frozen (200 + `card.freeze.no_op` audit); concurrent freeze + auto-freeze test: only one wins, other gets 409.

### T-06 — POST /cards/:id/unfreeze (SCA-gated) [serves M-2]
**File:** `src/routes/cards/unfreeze.ts` · **Surface:** `POST /cards/:id/unfreeze`
**Prompt seed:** "Implement unfreeze with SCA gate per spec §impl-notes #8, §edge-cases P-4, T-1."
**Details:** Check `X-SCA-Token`; if missing → 401 `sca_required` + `challenge_id`; verify single-use; revert state; audit `card.unfrozen`.
**DoD:** Without SCA token → 401; expired SCA token → 401 with new `challenge_id`; reused token → 401 + audit `sca.token.reuse`.

### T-07 — GET /cards/:id (no PAN) [serves M-2]
**File:** `src/routes/cards/get.ts` · **Surface:** `GET /cards/:id`
**Prompt seed:** "Implement card read per spec §rbac and §edge-cases P-2."
**Details:** Resolve actor role; cardholder reads only own card (else 404); ops/support read any. Return: `id, last4, exp_month, exp_year, status, currency, created_at`. No PAN/CVV/token.
**DoD:** Cardholder reading other's card returns 404 (not 403); response shape lacks `pan`/`cvv`/`card_token` by schema test.

### T-08 — PUT /cards/:id/limits (PSD2 SCA on increase) [serves M-3]
**File:** `src/routes/cards/limits-set.ts` · **Surface:** `PUT /cards/:id/limits`
**Prompt seed:** "Implement limits update per spec §impl-notes #8, §edge-cases I-1..I-3, S-1."
**Details:** Validate ≤ issuer ceiling, > 0, currency match. If new > old → require SCA token. Persist + audit `card.limits_changed` with before/after. Reject if frozen (409).
**DoD:** Increase without SCA → 401; decrease without SCA → 200; cross-currency → 400; load test shows p99 < 150ms.

### T-09 — GET /cards/:id/limits [serves M-3]
**File:** `src/routes/cards/limits-get.ts` · **Surface:** `GET /cards/:id/limits`
**Prompt seed:** "Implement limits read per spec §rbac."
**Details:** Same RBAC as T-07; return all kinds (`daily`, `monthly`, `per_tx`) with currency.
**DoD:** Read-after-write consistency: PUT then GET in same session returns updated values; cardholder reading other's → 404.

### T-10 — POST /webhooks/decisioning (p99 < 250ms) [serves M-4]
**File:** `src/routes/webhooks/decisioning.ts` · **Surface:** `POST /webhooks/decisioning`
**Prompt seed:** "Implement decisioning webhook per spec §slo, §impl-notes #9, #10, §edge-cases E-2."
**Details:** HMAC verify; Redis dedup on `event_id`; reject `> 5min` old; load card + limits in single query; apply rules; respond `{decision: APPROVE|DECLINE, reason}`; audit `decisioning.*`.
**DoD:** k6 load 100 RPS / 10 min → p99 < 250ms; chaos (Postgres down) → DECLINE within 500ms; replay event → 410; HMAC mismatch → 401.

### T-11 — GET /cards/:id/transactions (paginated) [serves M-4]
**File:** `src/routes/cards/transactions-list.ts` · **Surface:** `GET /cards/:id/transactions?cursor=&limit=`
**Prompt seed:** "Implement transactions list per spec §slo and §rbac."
**Details:** Default limit 50, max 200; cursor-based pagination on `(created_at, id)`; cardholder/ops only.
**DoD:** First page p99 < 200ms; cursor stable across same-millisecond inserts; > 200 limit → 400.

### T-12 — POST /cards/:id/pan-reveal-token (ephemeral, SCA, 60s TTL) [serves M-2]
**File:** `src/routes/cards/pan-reveal.ts` · **Surface:** `POST /cards/:id/pan-reveal-token`
**Prompt seed:** "Implement PAN reveal token per spec §impl-notes #3, §edge-cases F-4, S-2."
**Details:** Require SCA token; mint short-lived JWT (60s) with `card_token` claim for processor iframe; persist usage hint in Redis with single-use marker; audit `card.pan_revealed`.
**DoD:** Token TTL 60s; reuse → 410 Gone + audit `pan_reveal_token_reuse`; > 3 reveals / 5 min → elevated SCA + ops alert.

### T-13 — Reconciliation job + card-events webhook [serves M-5]
**File:** `src/workers/reconcile.ts` + `src/routes/webhooks/card-events.ts` · **Surface:** cron `@hourly` + `POST /webhooks/card-events`
**Prompt seed:** "Implement push (webhook) + pull (cron) state sync per spec §slo, §impl-notes #9, §edge-cases E-4."
**Details:** Webhook handler — HMAC verify + Redis dedup on `event_id` + apply event (status/limit change from processor) + audit `card.<event>` with `source=processor_webhook`. Cron — fetch processor delta since last cursor; compare card status + limits; on divergence accept processor truth + audit `reconciliation.divergence_resolved`; persist new cursor. Webhook is the fast path; cron is the safety net for E-4.
**DoD:** Webhook event applied within 200 ms p99; replayed `event_id` → 410; synthetic 5 % divergence dataset → 100 % flagged + resolved at next cron; Prometheus gauge `reconciliation_divergence_ratio` published.

### T-14 — GET /admin/audit-events (ops-only, paginated) [serves M-5]
**File:** `src/routes/admin/audit.ts` · **Surface:** `GET /admin/audit-events?card_id=&from=&to=&cursor=&limit=`
**Prompt seed:** "Implement audit query per spec §slo (audit p99 < 1s) and §rbac."
**Details:** Ops role only (else 403); index-friendly query on `(card_id, created_at)`; default limit 100, max 500; hot Postgres path; cold S3 fallback for `from > 30d`.
**DoD:** `card_id` query for last 30d p99 < 1s; non-ops actor → 403; cold-path query for >30d returns within 5s.

### T-15 — Rate-limit middleware (tiered) [serves M-1]
**File:** `src/lib/rate-limit.ts` · **Surface:** Fastify plugin
**Prompt seed:** "Implement tiered rate limiting per spec §non-functional cross-cutting limits and §edge-cases F-1."
**Details:** Redis-backed sliding window; tier resolution from actor role; separate buckets per (actor_id, endpoint_class). Endpoint classes: `read`/`write`/`issue`. Headers: `X-RateLimit-*`, `Retry-After`.
**DoD:** Cardholder writes > 10/min → 429 + `Retry-After`; ops reads > 600/min → 429; issue > 5/24h → 429 + audit `rate_limit.issue_burst`.
