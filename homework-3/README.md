# Homework 3 — Specification-Driven Design

## 1. Student & task summary

**Student:** Bohdan Shtefunyk (`shtefunyk`)
**Course:** GenAI and Agentic AI for Software Engineering
**Assignment:** Homework 3 — Specification-Driven Design

This deliverable is a **specification package** for a finance-oriented service (a virtual-card-lifecycle product). No code is shipped — only documentation, AI-partner rules, and Claude-Code-specific operationalization. The grading artifact is the **specification** itself: how clearly the problem is decomposed, how traceable requirements are from goals to tasks, and how seriously edge cases, verification, and non-functional concerns are treated.

Choices were resolved through a structured grilling session (`/grill-me`) covering 20 architectural questions; rationale and trade-offs are documented in §3 and §5 below.

## 2. Deliverables map

| File | Purpose | Audience |
|---|---|---|
| `specification.md` | Layered spec: high-level objective · 5 mid-level objectives · regs/SLO/uptime/DR · 12 implementation guardrails · context (Beginning + Non-goals + Ending + 12-endpoint API table) · stakeholders + RBAC · 7-axis edge cases (~30) · verification matrix + CI gates · 15 low-level tasks. **Hard cap 500 lines.** | Engineering, AI agents, compliance |
| `agents.md` | Stack-agnostic AI-partner manifest: stack assumptions, domain rules (cite back to spec), conventions, testing discipline, scope boundary, when-to-ask-vs-proceed | Any AI agent (Claude/GPT/Gemini), human onboarder |
| `CLAUDE.md` | Claude-Code-specific overlay: entry rules, CC guardrails, sub-agent + hook usage, allowed/denied tools, model selection, session DoD | Claude Code session in this directory |
| `.claude/settings.json` | Registers two hooks: `pan-guard.sh` (PreToolUse) + 500-line spec-budget guard (PostToolUse) | Claude Code runtime |
| `.claude/hooks/pan-guard.sh` | Bash hook: extracts 13–19-digit sequences from tool input, applies Luhn, blocks unless test-BIN-prefixed | Hook runtime |
| `.claude/agents/compliance-reviewer.md` | CC sub-agent: dual-mode (spec scan / code diff scan), 10 checklist categories, severity-tagged report, read-only tools (Read/Grep/Glob), Sonnet model | Pre-commit / pre-PR review |
| `README.md` | This file — entry point, rationale, best-practices map, trade-offs, how to use the spec with Claude Code | Reviewer, future maintainer |
| `TASKS.md` | Original assignment brief (upstream) | Reference |
| `specification-TEMPLATE-example.md` | Original template (upstream) — adapted, not used verbatim | Reference |

## 3. Rationale

Eight major decisions shaped the deliverable. Each is recorded with the alternatives considered and why the chosen path won.

### 3.1 Domain — virtual card lifecycle (CRUD + limits)

The brief offered virtual cards as one of several finance-feature options. Virtual-card lifecycle was chosen because it produces the richest decision tree — PAN handling forces PCI scope, freeze/unfreeze surfaces concurrency edge cases, limits make the spec own real business logic (not just a CRUD façade), and the audit story has natural depth. Smaller alternatives (notifications, dispute intake) collapsed into either generic CRUD or human workflow, neither of which exercises the layering the brief grades.

### 3.2 Architecture — processor-delegated + local limits ledger (B2)

We do **not** self-issue PAN. The service integrates with a Marqeta-style issuer-processor and stores `card_token` + `last4` + `exp_*` only. Limits live in our own ledger and are enforced via a decisioning webhook that the processor calls during real authorization. This reflects how 95 % of fintech startups actually build cards today, and the decisioning webhook generates the strongest concrete acceptance criterion in the spec (p99 < 250 ms internal). A self-issuing alternative would have inflated PCI infrastructure rules at the cost of business-logic depth.

### 3.3 Jurisdiction & regs — EU/UK with PSD2 SCA

EU/UK was chosen over US-first because PSD2 SCA generates the most concrete, edge-case-rich acceptance criteria (single-use 5-min token, gating list explicit). GDPR is also stricter than CCPA, forcing better data-minimisation discipline. AML/KYC is treated as inherited (precondition `account.status=active`) so the spec doesn't drift into onboarding scope.

### 3.4 Tech stack — TypeScript + Fastify + PostgreSQL + Prisma + Redis

Continuity with HW-1/HW-2 (Node.js base) plus the realistic upgrade for a regulated environment: TypeScript for branded types on `Money`/`CardId`/`CardToken`, Fastify for built-in JSON-Schema validation, Prisma for migration story (audit table), Redis for idempotency keys and 5-min SCA tokens, pino for structured PII-redacted logs, Zod for runtime validation at the API boundary. The stack is declared as **assumed** — no code is shipped.

### 3.5 AI-rules architecture — `agents.md` (stack-agnostic) ⇄ `CLAUDE.md` (CC overlay)

The brief allows one AI-rules file. We split intentionally: `agents.md` is a stack-agnostic manifest readable by any model; `CLAUDE.md` is a thin overlay adding only Claude-Code-specific operational concerns (sub-agents, hooks, tool allowlist, model selection). This avoids duplication and demonstrates understanding of CC's auto-loading behavior. The `compliance-reviewer` sub-agent operates on the rules from `agents.md`; the `pan-guard.sh` hook enforces the strictest rule (no real PAN) at tool boundaries.

### 3.6 Performance targets — assumed but justified

Numbers are hypothetical (no production telemetry exists) but each is grounded in industry references: Marqeta's 2 s decisioning gateway timeout drives the `p99 < 250 ms internal · 500 ms hard cap`, sub-second user actions drive the freeze p99 < 800 ms e2e, Stripe's 24 h idempotency window drives ours. Tiered uptime (99.99 → 99.5 by criticality) and tiered DR (RPO 1 m → 1 h, RTO 15 m → 4 h) follow standard fintech status-page SLA structure.

### 3.7 Verification depth — matrix + principles + CI gates

Every mid-level objective gets ≥ 2 verification mechanisms across 7 test categories (unit, integration, e2e, property, load, chaos, contract). Two human checks (PCI scope review, support permission spot check) are explicit, not hidden. Coverage floors are split (80 % `lib/`, 60 % `routes/`) to reflect that domain logic deserves stricter coverage than I/O glue. CI gates include a sub-agent gate (`compliance-reviewer`) — making the AI tooling part of the merge contract.

### 3.8 500-line spec budget

`specification.md` is hard-capped at 500 lines, enforced by a `PostToolUse` hook. The cap forced compression discipline (tables over prose, compact 5-line low-level task format vs. template's 12-line per task) and produced a final length of ~374 lines with deliberate headroom. The cap is documented and enforced — not aspirational.

## 4. Industry best practices applied

| Practice | Where it appears | Why included |
|---|---|---|
| **Idempotency keys** (Stripe pattern) | spec §implementation-notes #4 · agents.md §3 · API table column "Idem?" | Prevents double-charge / double-issue under network retry |
| **Fail-safe DECLINE** (Marqeta default) | spec §implementation-notes #10 · §edge-cases E-2 · T-10 DoD | Internal failure must never approve money movement |
| **Branded types for money/IDs** | spec §implementation-notes #1, #2 · agents.md §3, §4 · T-02 | Compile-time prevention of `Money` ↔ `number` and `CardId` ↔ `CardToken` confusion |
| **Audit-in-same-transaction** | spec §implementation-notes #5 · agents.md §3 · T-04/05/06/08/12 DoDs | Atomicity guarantees no orphan state mutations (post-mortem pattern from HSBC AML cases) |
| **Tiered SLO + uptime** | spec §non-functional §slo · §availability · §dr | Standard status-page SLA structure (Stripe, AWS); reflects real cost-of-downtime tiers |
| **PII redaction list** (pino canonical) | spec §implementation-notes #3, #11 · agents.md §3 · T-03 DoD | Defense in depth: redact at sink even if upstream code accidentally serializes sensitive field |
| **Luhn-aware PAN scanning** with test-BIN allowlist | `.claude/hooks/pan-guard.sh` · CLAUDE.md §2, §5 · agents.md §3 | Prevents accidental real-PAN commits while keeping legitimate `4242…` examples permitted |
| **Dual-mode compliance reviewer** | `.claude/agents/compliance-reviewer.md` · CLAUDE.md §4 | Same scanner for spec deliverable and (future) code diffs — reusable beyond this homework |
| **HMAC-verified webhooks with replay guard** | spec §implementation-notes #9 · §edge-cases E-2 · T-10 | Industry baseline; recommended by Stripe/Marqeta security guides |
| **Anti-enumeration 404** (not 403) | spec §implementation-notes #10 · §edge-cases P-2 · T-07 DoD | Standard bug-bounty hardening: 403/404 mismatch leaks valid IDs |
| **Single-use SCA tokens with TTL** | spec §implementation-notes #8 · §edge-cases T-1, T-4 · T-06 DoD | PSD2 RTS Art. 4 compliance baseline; defends replay |
| **Reconciliation cadence** (hourly delta + daily full) | spec §non-functional cross-cutting · T-13 | Standard compliance-audit pattern for any fintech with external state |

## 5. Trade-offs & explicit non-choices

These were considered and deliberately not chosen. Documented to preempt "why didn't you …" review questions.

- **Self-issuing PAN model rejected.** Would have moved spec into PCI Level 1 infrastructure rules (HSM, network segmentation) at the cost of business-logic depth. Realistic for almost no startup.
- **US-first jurisdiction rejected.** PSD2 SCA generates richer, more concrete acceptance criteria than any US-equivalent for card unfreeze. Avoids OFAC sanctions detour.
- **Real-time auth flow excluded from scope.** Decisioning webhook is in scope (we respond), but the full processor-side ACS implementation is out — that's a separate spec.
- **Mutation testing rejected.** Pedagogically valuable but inflates the verification section beyond what most teams actually run. Property tests + load tests cover the high-value cases.
- **Slash commands not implemented.** `/spec-review` is documented as roadmap (`CLAUDE.md` §8) but not shipped. Scope discipline: just because CC supports a feature doesn't mean every spec needs it.
- **Multi-jurisdiction "global" framing rejected.** Classic anti-pattern — "support all regulations" produces vague spec. We picked one jurisdiction and owned it.
- **Stakeholders capped at 4.** Adding finance/treasury or Visa/Mastercard as stakeholders would inflate the RBAC matrix without adding new permission boundaries — both are external dependencies, not actors.
- **Verbose 12-line per-task template rejected.** The template's 5-field format would have produced 8 tasks at the line budget. Compact 5-line format yields 15 tasks — closer to what the brief calls "many small tasks, not three generic bullets."

## 6. How to use this spec with Claude Code

```bash
cd homework-3/
claude  # opens Claude Code with this directory as cwd
```

What happens automatically:
- `CLAUDE.md` is loaded into the session as project instructions.
- `.claude/settings.json` registers the two hooks: `pan-guard.sh` (PreToolUse) and the 500-line spec-budget guard (PostToolUse).
- `.claude/agents/compliance-reviewer.md` is discoverable as a sub-agent.

What you do explicitly in the session:

1. **Edit the spec.** Use `Edit` (preferred over `Write`) to keep diffs small. The spec-budget hook will block edits that push `specification.md` past 500 lines.

2. **Try to write a real PAN.** Attempt: paste any Luhn-valid digit string with a non-test BIN prefix into a `Bash`, `Edit`, or `Write` call. The `pan-guard.sh` hook will block with a descriptive error.

3. **Invoke the compliance-reviewer before commit.** In the chat:
   > "Use the compliance-reviewer sub-agent to scan all changes since HEAD."

   It returns a severity-tagged report. Resolve any **HIGH** findings before committing; document **MEDIUM** acks in the PR description.

4. **Author follow-on work in another workspace.** If you want to actually implement the spec (out of scope for HW-3), scaffold a separate directory and copy `agents.md` as the AI-partner manifest there — it is stack-agnostic and reusable.

To verify the deliverable health locally:

```bash
# Line budget
wc -l homework-3/specification.md          # should be ≤ 500

# Traceability (every M-X has at least one referencing T-NN)
for m in M-1 M-2 M-3 M-4 M-5; do
  echo -n "$m: "; grep -c "serves $m" homework-3/specification.md
done

# Hook smoke test (allowed test BIN — should exit 0)
echo '{"command":"echo 4242424242424242"}' | bash homework-3/.claude/hooks/pan-guard.sh; echo "exit=$?"

# Hook smoke test (Luhn-valid non-test BIN — should exit 2)
echo '{"command":"echo 4539148803436467"}' | bash homework-3/.claude/hooks/pan-guard.sh; echo "exit=$?"
```
