# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a homework submission repository for the **GenAI and Agentic AI for Software Engineering** course. Each `homework-N/` directory is an independent assignment with its own tech stack (Node.js, Python, or other). There is no shared build system — commands vary per assignment.

## Homework Directory Convention

Each `homework-N/` must contain:
- `README.md` — solution overview, features implemented, architecture decisions, AI tools used
- `HOWTORUN.md` — step-by-step instructions to run the application
- `src/` — source code
- `docs/screenshots/` — screenshots of AI interactions, running app, test results
- `demo/` — `run.sh` or `run.bat`, `sample-requests.http` or `sample-requests.sh`, optionally `sample-data.json`

## Git Workflow

Each assignment is submitted via a dedicated branch and PR **within this fork** (not the upstream repo):

```bash
git checkout -b homework-N-submission
# implement...
git push origin homework-N-submission
# open PR with base: main on this fork
```

PRs must include: implementation summary, AI tools/prompts used, challenges encountered, and embedded screenshots. PRs without a thorough description will be rejected.

## Homework 1 — Banking Transactions API

**Required endpoints:**
- `POST /transactions` — create transaction (auto-generated ID, status `pending`)
- `GET /transactions` — list with filters: `?accountId=`, `?type=`, `?from=`, `?to=`
- `GET /transactions/:id` — get by ID
- `GET /accounts/:accountId/balance` — compute balance from in-memory store

**Transaction model fields:** `id`, `fromAccount`, `toAccount`, `amount`, `currency` (ISO 4217), `type` (deposit|withdrawal|transfer), `timestamp` (ISO 8601), `status` (pending|completed|failed)

**Validation rules:**
- Amount: positive, max 2 decimal places
- Account format: `ACC-XXXXX` (alphanumeric X)
- Currency: valid ISO 4217 codes only
- Error shape: `{ "error": "Validation failed", "details": [{ "field": "...", "message": "..." }] }`

**Additional feature (choose ≥1):** transaction summary endpoint, interest calculation, CSV export, or rate limiting (100 req/min/IP → 429).

**HTTP status codes:** 200, 201, 400, 404 (and 429 for rate limiting).
