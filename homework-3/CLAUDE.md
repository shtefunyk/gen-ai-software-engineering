# CLAUDE.md — Claude Code Overlay

> Auto-loaded by Claude Code when invoked from `homework-3/`. Adds CC-specific operational rules on top of `agents.md`. Does **not** duplicate domain rules — those live in `agents.md` and `specification.md`.

## 1. Entry rules

Before any task in `homework-3/`:
1. Read `specification.md` (source of truth — what to build).
2. Read `agents.md` (how an AI partner should behave — domain rules, conventions, workflow).
3. Apply this file as **non-negotiable Claude-Code-specific additions**.

Source-of-truth precedence: `specification.md` > `agents.md` > this file.

## 2. CC-specific guardrails

- **NEVER write code in this directory.** Homework-3 is spec-only. If a task implies writing TypeScript/SQL, refuse and ask whether the user meant to scaffold a separate workspace.
- **NEVER use a real PAN even in examples or comments.** Use BIN ranges from the allowlist: `4242…`, `4111…`, `5555…`, `4000…`, `2223…`. The `pan-guard.sh` hook will block real-format PANs at the tool boundary.
- **ALWAYS prefer `Edit` over `Write` for existing spec files.** `Write` overwrites; `Edit` produces a reviewable diff. Use `Write` only for genuinely new files.
- **PRESERVE traceability tags.** When editing, keep every `M-X` and `T-NN` tag intact and consistent. If a tag is removed, an equivalent reference must replace it.
- **PRESERVE the 500-line cap on `specification.md`.** The `PostToolUse` hook will block edits that push the file over 500 lines. Compress or move content to `agents.md` rather than bypass.
- **NEVER bypass a hook.** If a hook blocks, fix the offending content. `--no-verify`, `--no-gpg-sign`, and similar bypass flags are denied (see §6).

## 3. TodoWrite & planning policy

- Use **plan mode** before multi-section spec edits or new-file creation.
- Use `TodoWrite` to track decisions made during a session — particularly when grilling architecture questions or staging multi-step deliverables.
- Use `AskUserQuestion` when two design alternatives are equally defensible. Do not pick silently.
- For non-trivial work, surface the plan to the user and confirm before executing.

## 4. Sub-agent usage policy

The `compliance-reviewer` sub-agent is the gatekeeper for compliance posture (`.claude/agents/compliance-reviewer.md`).

**When to invoke:**
- Before every commit that touches `specification.md`, `agents.md`, or `CLAUDE.md`.
- Before opening a PR for `homework-3`.

**Invocation pattern (in CC):** use the `Agent` tool with `subagent_type: compliance-reviewer`. Pass the changed files in the prompt.

**What to do with the verdict:**
- **BLOCK** (HIGH severity findings): do not commit. Fix offending content. Re-invoke.
- **ACK_REQUIRED** (MEDIUM findings): document each accepted finding in the PR description with reason; commit allowed.
- **PASS** (no HIGH/MEDIUM): commit freely.

The sub-agent is **read-only** (Tools: `Read`, `Grep`, `Glob`). It never auto-fixes. The main session decides what to change.

## 5. Hook expectations

`.claude/settings.json` registers two hooks:

| Hook | Trigger | What it does |
|---|---|---|
| `pan-guard.sh` | `PreToolUse` on `Bash` / `Edit` / `Write` | Extracts 13–19-digit sequences from tool input; applies Luhn; rejects unless prefix matches test BIN allowlist |
| `spec-budget` | `PostToolUse` on `Edit` / `Write` matching `specification.md` | `wc -l` check; blocks if file > 500 lines |

If a hook blocks:
- **Fix, do not bypass.** A blocked PAN-like string is either a real PAN (extract it) or a non-test BIN (replace with `4242…`).
- A blocked over-cap edit means content must move to `agents.md`, compress into a table, or be cut.

## 6. Allowed / denied tools

**Default-allow** for the standard CC toolset (Read, Edit, Write, Glob, Grep, Bash, TodoWrite, Agent, AskUserQuestion).

**Explicit denies (request user permission first):**
- `Bash` containing `--no-verify` (commit/push hook bypass).
- `Bash` containing `git push --force` against `main` or `master`.
- `Bash` containing `rm -rf` on tracked paths.
- `WebFetch` / `WebSearch` outside the documentation whitelist: Fastify, Prisma, pino, Zod, Vitest, Pact, k6, Marqeta API docs, PCI DSS / GDPR / PSD2 official sources.
- `Read` on other `homework-N/` directories without an explicit reason stated to the user (cross-contamination risk).

**Encouraged:**
- `Agent` with `subagent_type: Explore` for navigation in unfamiliar parts of the repo.
- `AskUserQuestion` over silent assumption when the spec is ambiguous.

## 7. Model selection

| Task | Model | Why |
|---|---|---|
| Authoring `specification.md` | Opus 4.7 | Multi-section coherence, traceability across 500 lines |
| Authoring `agents.md` / `CLAUDE.md` / `README.md` | Opus 4.7 | Cross-file consistency with the spec |
| `compliance-reviewer` sub-agent | Sonnet 4.6 | Focused checklist scan; doesn't need Opus reasoning depth |
| `pan-guard.sh` hook execution | n/a (shell) | Fast deterministic check; no model |
| Routine grep / file lookups | Haiku 4.5 (when delegated to Explore) | Fast, cheap; no need for high reasoning |

The session writing the spec **must** be on Opus 4.7. Sub-agent model is locked in its YAML frontmatter.

## 8. Slash command roadmap (not implemented in this deliverable)

The following slash commands are recommended for a future iteration but are deliberately not shipped here (scope discipline):

- `/spec-review` — would invoke `compliance-reviewer` on changed files + run traceability check (every `T-NN` has `[serves M-X]`, every `M-X` has ≥ 1 `T-NN`).
- `/spec-budget` — would print line counts vs. caps for all spec files.

These are documented as roadmap so future sessions inherit the intent.

## 9. Session Definition of Done

Before claiming a task complete in `homework-3/`:

- All `M-X` / `T-NN` tags resolvable (each `T-NN` references an existing `M-X`; each `M-X` referenced by ≥ 1 `T-NN`).
- `compliance-reviewer` ran with no HIGH findings; MEDIUM findings acked in commit / PR description.
- `wc -l homework-3/specification.md` ≤ 500 (verified manually if hook unavailable).
- All deliverables present in `homework-3/`: `specification.md`, `agents.md`, `CLAUDE.md`, `README.md`, `.claude/settings.json`, `.claude/hooks/pan-guard.sh`, `.claude/agents/compliance-reviewer.md`.
- No real PAN, CVV, or production secret in any file (grep confirms).
