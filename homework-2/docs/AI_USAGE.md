# AI Usage Log

This homework was developed with AI assistance. Each artifact below records the tool, model, and the salient prompt(s).

## Tools

- **Claude Code** (Opus 4.7) — primary agent for brainstorming, plan, code, tests, and docs.
- **Gemini 2.0 Flash** (`@google/genai`) — runtime LLM for ticket classification (called by `classificationService`).

## Artifacts

| Artifact | Tool / Model | Notes |
|---|---|---|
| `docs/superpowers/specs/2026-05-03-customer-support-design.md` | Claude Code Opus 4.7 (brainstorming skill) | 4-round design dialog; chose Gemini-only classification, in-memory store, raw-body import contract |
| `docs/superpowers/plans/2026-05-03-customer-support-plan.md` | Claude Code Opus 4.7 (writing-plans skill) | TDD-shaped tasks |
| `src/**` implementation | Claude Code Opus 4.7 (subagent-driven-development) | Each task implemented with red-green-commit loop |
| `README.md` | Claude Code Opus 4.7 — system framing: "developer onboarding doc, terse, includes Mermaid" | Component diagram |
| `docs/API_REFERENCE.md` | Claude Code Opus 4.7 — system framing: "API consumer doc, cURL-driven" | One example per endpoint |
| `docs/ARCHITECTURE.md` | Claude Code Opus 4.7 — system framing: "tech-lead audience, Mermaid x2, design decisions table" | High-level + sequence |
| `docs/TESTING_GUIDE.md` | Claude Code Opus 4.7 — system framing: "QA audience, pyramid, benchmark table" | Pyramid diagram |
| Sample data generation | Plain Node script (no LLM) | Deterministic, reproducible via `node scripts/gen-samples.mjs` |
| Runtime classification | Gemini 2.0 Flash | Structured JSON output via `responseSchema`; result validated by Zod |

## Prompt highlights

- Brainstorming kickoff: "Help me design homework-2 strictly to TASKS.md, no scope creep, plan screenshots and demo content."
- Stack confirmation: "Use the latest libs — context7 to verify versions."
- Classification approach: "Use Gemini 2.0 Flash, no fallback, mock by default."
- Coverage target: "Keep ≥ 85% lines/branches/functions/statements; tune thresholds in vitest config if needed."

Append additional prompt-highlights below this line as new sessions occur during implementation.
