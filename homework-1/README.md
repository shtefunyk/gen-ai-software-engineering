# Banking Transactions API

> **Student Name**: Bohdan Shtefunik
> **Date Submitted**: 2026-04-27
> **AI Tools Used**: Claude Code (claude-sonnet-4-6)

---

## Project Overview

A REST API for banking transactions built with Node.js + Express. Uses in-memory storage, comprehensive validation, automated tests, and all four bonus features.

## Features Implemented

### Core (Required)
- `POST /transactions` — create transaction (auto-generated ID, status `pending`)
- `GET /transactions` — list with filters: `?accountId=`, `?type=`, `?from=`, `?to=`
- `GET /transactions/:id` — get by ID (404 if not found)
- `GET /accounts/:accountId/balance` — compute balance from completed transactions

### Bonus (All 4)
- `GET /accounts/:accountId/summary` — total deposits/withdrawals, count, last date _(Option A)_
- `GET /accounts/:accountId/interest?rate=0.05&days=30` — simple interest _(Option B)_
- `GET /transactions/export` — CSV download with optional filters _(Option C)_
- Rate limiting — 100 requests/min per IP → 429 _(Option D)_

## Architecture

```
src/
  app.js          — Express app (separated from index.js for Jest testability)
  index.js        — HTTP server entry point
  store/          — in-memory array with CRUD + filtering
  routes/         — HTTP handlers (transactions, accounts)
  validators/     — input validation, returns all errors simultaneously
  middleware/     — rate limiter, centralized error handler
  utils/          — ISO 4217 currency codes, CSV generator
tests/            — Jest + Supertest (integration + unit)
```

**Request flow:** `Request → rateLimiter → route → validator → store → response`

## Key Design Decisions

- `app.js` separated from `index.js` — Jest imports the app without binding a real port
- Balance and totals only count `completed` transactions
- All validation errors returned simultaneously in one 400 response with `{ error: "Validation failed", details: [...] }` shape
- `GET /transactions/export` registered before `GET /transactions/:id` to avoid route collision
- Rate limiter skips when `NODE_ENV=test` for deterministic tests

## Tests

```bash
npm test                # run all tests
npm run test:coverage   # with coverage report
```

## Screenshots

See `docs/screenshots/` for:
- AI tool interactions (prompts and generated code)
- Server running output
- Sample API requests/responses
- Test suite passing
