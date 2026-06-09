# Homework 4 — 4-Agent Pipeline

**Author / Student:** Bohdan Shtefunyk

A Claude Code pipeline of four agents that verifies research, fixes bugs, reviews
security, and generates tests for a small Express **Notes API**.

## The pipeline
`research-verifier` → `bug-fixer` → `security-verifier` → `unit-test-generator`

Run it with one command (see HOWTORUN.md):
```bash
npm run pipeline      # or ./run-pipeline.sh
```

## Per-agent model selection & rationale

| Agent | Model | Why |
|-------|-------|-----|
| research-verifier | opus 4.7 | Careful file:line/snippet fact-checking — accuracy over cost. |
| bug-fixer | sonnet 4.6 | Applying a fully specified plan — routine edits; best speed/quality balance. |
| security-verifier | opus 4.7 | High-stakes security reasoning (injection, path traversal). |
| unit-test-generator | haiku 4.5 | Well-scoped test scaffolding — fast and cheap is sufficient. |

## The Notes API (before → after)
Ships with 2 intentional logic bugs (tag filter, pagination) and 1 path-traversal
vulnerability. `npm test` is RED before the pipeline and GREEN after.

## Layout
- `agents/` — canonical agent definitions (mirrored into `.claude/agents/` for runtime dispatch).
- `skills/` — `research-quality-measurement`, `unit-tests-FIRST` (mirrored into `.claude/skills/`).
- `context/bugs/001-notes-api/` — pre-seeded research/plan + agent outputs.
- `src/`, `tests/` — the application and its tests.
- `docs/screenshots/` — pipeline run, before/after tests, reports.

## Agent outputs
`verified-research.md`, `fix-summary.md`, `security-report.md`, `test-report.md`.

## Screenshots
![Pipeline run](docs/screenshots/01-pipeline-run.png)
![Tests before](docs/screenshots/02-tests-before.png)
![Tests after](docs/screenshots/03-tests-after.png)
![Fix summary](docs/screenshots/04-fix-summary.png)
![Security report](docs/screenshots/05-security-report.png)
![Test report](docs/screenshots/06-test-report.png)
![Verified research](docs/screenshots/07-verified-research.png)
![Agent models](docs/screenshots/08-agent-models.png)

## AI tools used
Claude Code (Opus 4.7) with subagents, skills, and a slash command. Designed via
the superpowers brainstorming + writing-plans workflow.
