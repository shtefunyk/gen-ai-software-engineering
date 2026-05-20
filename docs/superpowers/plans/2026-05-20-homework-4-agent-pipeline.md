# Homework 4 — 4-Agent Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-agent Claude Code pipeline (Research Verifier → Bug Fixer → Security Verifier → Unit Test Generator) that runs via one command and operates on a small buggy Express "Notes API", demonstrating before→after.

**Architecture:** A `/run-pipeline` slash command orchestrates four subagents (each with an explicit model) over pre-seeded research/plan artifacts. A thin `run-pipeline.sh` wrapper makes it runnable from the terminal. The Notes API ships with 2 intentional logic bugs + 1 path-traversal vulnerability and a RED test suite; the pipeline turns it GREEN.

**Tech Stack:** Node.js (ESM), Express 4, vitest + supertest, Claude Code subagents/skills/commands, bash.

---

## ⚠️ Critical execution note

The Notes API tests (Task 3) are **RED by design** and stay red after Task 3. Do **NOT** fix the app code yourself. The Bug Fixer agent makes them green when the pipeline is actually run (Task 12). When a task says "verify the test fails", that failing state is the intended deliverable for that task.

## 📸 Screenshot reminders

The user wants an explicit reminder at every screenshot moment. Tasks that map to a screenshot include a **📸 REMIND USER** line. When executing such a task, stop and tell the user exactly which screenshot to capture before continuing. The single non-reproducible shot is `02-tests-before.png` (Task 3) — captured BEFORE the pipeline runs.

## File Structure

```
homework-4/
├── package.json                         # Task 1
├── vitest.config.js                     # Task 1
├── .gitignore                           # Task 1
├── data/note-1-backup.txt               # Task 2
├── src/store.js                         # Task 2  (in-memory store + buggy logic)
├── src/app.js                           # Task 2  (express app, exported)
├── src/index.js                         # Task 2  (server entrypoint)
├── tests/notes.test.js                  # Task 3  (RED-by-design suite)
├── context/bugs/001-notes-api/
│   ├── bug-context.md                   # Task 4
│   ├── research/codebase-research.md    # Task 4  (1 intentional discrepancy)
│   ├── implementation-plan.md           # Task 4  (Bug Fixer input)
│   ├── research/verified-research.md    # produced by pipeline (Task 12)
│   ├── fix-summary.md                   # produced by pipeline (Task 12)
│   ├── security-report.md               # produced by pipeline (Task 12)
│   └── test-report.md                   # produced by pipeline (Task 12)
├── skills/research-quality-measurement.md   # Task 5
├── skills/unit-tests-FIRST.md               # Task 6
├── agents/research-verifier.agent.md        # Task 7 (canonical deliverable)
├── agents/bug-fixer.agent.md                # Task 7
├── agents/security-verifier.agent.md        # Task 7
├── agents/unit-test-generator.agent.md      # Task 7
├── .claude/agents/*.md                       # Task 8 (runtime mirrors)
├── .claude/skills/*.md                       # Task 8 (runtime mirrors)
├── .claude/commands/run-pipeline.md          # Task 9 (orchestrator)
├── run-pipeline.sh                           # Task 10
├── README.md                                 # Task 11
├── HOWTORUN.md                               # Task 11
└── docs/screenshots/                         # Task 12
```

All commands below assume CWD = `homework-4/` unless noted.

---

### Task 1: Scaffold project

**Files:**
- Create: `homework-4/package.json`
- Create: `homework-4/vitest.config.js`
- Create: `homework-4/.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "homework-4-notes-api",
  "version": "1.0.0",
  "description": "Notes API operated on by the 4-agent pipeline",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "pipeline": "./run-pipeline.sh"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "supertest": "^6.3.4",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
coverage/
*.log
```

- [ ] **Step 4: Install deps and verify**

Run: `cd homework-4 && npm install`
Expected: installs express, vitest, supertest with no errors.

- [ ] **Step 5: Commit**

```bash
git add homework-4/package.json homework-4/vitest.config.js homework-4/.gitignore
git commit -m "chore(homework-4): scaffold Notes API project (express + vitest)"
```

---

### Task 2: Build the Notes API with seeded defects

**Files:**
- Create: `homework-4/src/store.js`
- Create: `homework-4/src/app.js`
- Create: `homework-4/src/index.js`
- Create: `homework-4/data/note-1-backup.txt`

- [ ] **Step 1: Create `src/store.js` (in-memory store with BUG 1 and BUG 2)**

```js
// In-memory note store. Contains two intentional logic bugs (see comments).
let notes = [];
let nextId = 1;

export function createNote({ title, body, tag }) {
  const note = {
    id: nextId++,
    title,
    body: body ?? '',
    tag: tag ?? null,
    createdAt: new Date().toISOString(),
  };
  notes.push(note);
  return note;
}

export function getNote(id) {
  return notes.find((n) => n.id === id);
}

export function listNotes({ tag, limit, offset }) {
  let result = notes;

  if (tag !== undefined) {
    // BUG 1: filters on the wrong property (`title`) with loose `==`,
    // so tag filtering never works as intended.
    result = result.filter((n) => n.title == tag);
  }

  // BUG 2: no defaults / NaN / negative guards. With no params,
  // parseInt(undefined) === NaN and slice(NaN, NaN) returns [] —
  // so a plain GET /notes returns nothing.
  const off = parseInt(offset);
  const lim = parseInt(limit);
  return result.slice(off, off + lim);
}

export function deleteNote(id) {
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return false;
  notes.splice(idx, 1);
  return true;
}

// Test helper: reset store between tests.
export function _reset() {
  notes = [];
  nextId = 1;
}
```

- [ ] **Step 2: Create `src/app.js` (Express app with the path-traversal vulnerability)**

```js
import express from 'express';
import { readFile } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

export function createApp() {
  const app = express();
  app.use(express.json());

  app.post('/notes', (req, res) => {
    const { title, body, tag } = req.body ?? {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    res.status(201).json(store.createNote({ title, body, tag }));
  });

  app.get('/notes', (req, res) => {
    const { tag, limit, offset } = req.query;
    res.json(store.listNotes({ tag, limit, offset }));
  });

  app.get('/notes/:id', (req, res) => {
    const note = store.getNote(Number(req.params.id));
    if (!note) return res.status(404).json({ error: 'not found' });
    res.json(note);
  });

  app.delete('/notes/:id', (req, res) => {
    const ok = store.deleteNote(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  });

  // SECURITY (CRITICAL): path traversal. `file` is joined onto dataDir with
  // no validation, so `?file=../../package.json` escapes the data directory.
  app.get('/notes/:id/backup', (req, res) => {
    const file = req.query.file;
    const full = path.join(dataDir, String(file));
    readFile(full, 'utf8', (err, data) => {
      if (err) return res.status(404).json({ error: 'backup not found' });
      res.type('text/plain').send(data);
    });
  });

  return app;
}
```

- [ ] **Step 3: Create `src/index.js`**

```js
import { createApp } from './app.js';

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, () => {
  console.log(`Notes API listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 4: Create `data/note-1-backup.txt` (legitimate backup target)**

```
Backup of note #1
This file lives inside data/ and is the only legitimate backup target.
```

- [ ] **Step 5: Smoke-check the server boots**

Run: `cd homework-4 && node src/index.js & sleep 1 && curl -s localhost:3000/notes ; kill %1`
Expected: server logs the listening line; `curl` returns `[]` (note: this empty result is BUG 2 in action — that's expected here).

- [ ] **Step 6: Commit**

```bash
git add homework-4/src homework-4/data
git commit -m "feat(homework-4): Notes API with 2 seeded bugs and 1 path-traversal vuln"
```

---

### Task 3: Write the RED-by-design test suite

**Files:**
- Create: `homework-4/tests/notes.test.js`

These tests assert the *correct* intended behaviour. They MUST fail now (bugs present) and stay failing until the pipeline's Bug Fixer runs. Do not fix the app.

- [ ] **Step 1: Write `tests/notes.test.js`**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { _reset } from '../src/store.js';

const app = createApp();

beforeEach(() => _reset());

async function seed(notes) {
  for (const n of notes) {
    await request(app).post('/notes').send(n);
  }
}

describe('GET /notes pagination (BUG 2)', () => {
  it('returns all notes when no pagination params are given', async () => {
    await seed([{ title: 'a' }, { title: 'b' }, { title: 'c' }]);
    const res = await request(app).get('/notes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it('respects limit', async () => {
    await seed([{ title: 'a' }, { title: 'b' }, { title: 'c' }]);
    const res = await request(app).get('/notes?limit=2');
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /notes?tag filter (BUG 1)', () => {
  it('returns only notes with the matching tag', async () => {
    await seed([
      { title: 'one', tag: 'work' },
      { title: 'two', tag: 'home' },
      { title: 'three', tag: 'work' },
    ]);
    const res = await request(app).get('/notes?tag=work');
    expect(res.body).toHaveLength(2);
    expect(res.body.every((n) => n.tag === 'work')).toBe(true);
  });
});

describe('GET /notes/:id/backup (SECURITY: path traversal)', () => {
  it('serves a legitimate backup inside data/', async () => {
    await seed([{ title: 'one' }]);
    const res = await request(app).get('/notes/1/backup?file=note-1-backup.txt');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Backup of note #1');
  });

  it('rejects path traversal attempts', async () => {
    await seed([{ title: 'one' }]);
    // `../package.json` escapes data/ into homework-4/package.json (a real,
    // readable file outside the intended dir) — proves the traversal.
    const res = await request(app).get('/notes/1/backup?file=../package.json');
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('homework-4-notes-api');
  });
});
```

- [ ] **Step 2: Run the suite and confirm it is RED**

Run: `cd homework-4 && npm test`
Expected: FAIL. The "no params" test returns `[]`, the tag filter returns wrong count, and the traversal test gets status 200 with package.json contents instead of 400.

- [ ] **Step 3: 📸 REMIND USER**

Stop and tell the user: **"📸 Зроби скриншот зараз: `02-tests-before.png` — вивід `npm test`, де тести падають (навмисні баги). Це єдиний кадр, який неможливо відтворити після запуску пайплайну."** Wait for confirmation before continuing.

- [ ] **Step 4: Commit**

```bash
git add homework-4/tests/notes.test.js
git commit -m "test(homework-4): RED-by-design suite for seeded bugs and vuln"
```

---

### Task 4: Pre-seed research and plan artifacts

**Files:**
- Create: `homework-4/context/bugs/001-notes-api/bug-context.md`
- Create: `homework-4/context/bugs/001-notes-api/research/codebase-research.md`
- Create: `homework-4/context/bugs/001-notes-api/implementation-plan.md`

- [ ] **Step 1: Create `bug-context.md`**

```markdown
# Bug Context — 001 Notes API

## Symptoms
1. `GET /notes` with no query params returns `[]` even when notes exist.
2. `GET /notes?tag=work` does not filter by tag.
3. `GET /notes/:id/backup?file=...` can read files outside `data/` (path traversal).

## Affected area
Express Notes API in `src/`. In-memory store in `src/store.js`, routes in `src/app.js`.

## Reproduction
`npm test` — three groups of assertions fail (pagination, tag filter, traversal).

## Expected after fix
All tests in `tests/notes.test.js` pass.
```

- [ ] **Step 2: Create `research/codebase-research.md` (INCLUDE one intentional discrepancy)**

```markdown
# Codebase Research — 001 Notes API

> Output of the (pre-seeded) Bug Researcher. The Research Verifier must fact-check
> every file:line reference below.

## Finding 1 — Pagination returns nothing (BUG 2)
- **Location:** `src/store.js:30-33`
- **Snippet:**
  ```js
  const off = parseInt(offset);
  const lim = parseInt(limit);
  return result.slice(off, off + lim);
  ```
- **Cause:** `parseInt(undefined)` is `NaN`; `slice(NaN, NaN)` returns `[]`.

## Finding 2 — Tag filter never matches (BUG 1)
- **Location:** `src/store.js:23`
- **Snippet:**
  ```js
  result = result.filter((n) => n.title == tag);
  ```
- **Cause:** filters on `title` instead of `tag`, with loose `==`.

## Finding 3 — Path traversal in backup route (SECURITY)
- **Location:** `src/app.js:10`
- **Snippet:**
  ```js
  const full = path.join(dataDir, String(file));
  ```
- **Cause:** no validation that the resolved path stays within `dataDir`.

> NOTE FOR PLAN AUTHOR: Finding 3's line number (`src/app.js:10`) is intentionally
> WRONG — the vulnerable `path.join` is inside the backup handler near the bottom of
> the file, not line 10. The Research Verifier must catch this discrepancy. Keep the
> wrong number in the committed file; do not "fix" it.
```

- [ ] **Step 3: Create `implementation-plan.md` (the Bug Fixer's input — fixes all three)**

```markdown
# Implementation Plan — 001 Notes API

**Test command:** `npm test`

## Change 1 — Fix tag filter (BUG 1)
- **File:** `src/store.js`
- **Before:**
  ```js
  result = result.filter((n) => n.title == tag);
  ```
- **After:**
  ```js
  result = result.filter((n) => n.tag === tag);
  ```

## Change 2 — Guard pagination (BUG 2)
- **File:** `src/store.js`
- **Before:**
  ```js
  const off = parseInt(offset);
  const lim = parseInt(limit);
  return result.slice(off, off + lim);
  ```
- **After:**
  ```js
  const parsedOff = Number.parseInt(offset, 10);
  const parsedLim = Number.parseInt(limit, 10);
  const off = Number.isFinite(parsedOff) && parsedOff >= 0 ? parsedOff : 0;
  const end = Number.isFinite(parsedLim) && parsedLim >= 0 ? off + parsedLim : result.length;
  return result.slice(off, end);
  ```

## Change 3 — Block path traversal (SECURITY)
- **File:** `src/app.js`
- **Before:**
  ```js
  const file = req.query.file;
  const full = path.join(dataDir, String(file));
  readFile(full, 'utf8', (err, data) => {
  ```
- **After:**
  ```js
  const file = req.query.file;
  const full = path.resolve(dataDir, String(file));
  if (!full.startsWith(dataDir + path.sep)) {
    return res.status(400).json({ error: 'invalid file path' });
  }
  readFile(full, 'utf8', (err, data) => {
  ```

After all changes, run `npm test` — all tests must pass.
```

- [ ] **Step 4: Commit**

```bash
git add homework-4/context
git commit -m "docs(homework-4): pre-seed bug context, research (w/ discrepancy), and plan"
```

---

### Task 5: Skill — research-quality-measurement

**Files:**
- Create: `homework-4/skills/research-quality-measurement.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: research-quality-measurement
description: Use when writing verified-research.md to assign a standard Research Quality level based on how many file:line references and code snippets are verified against source.
---

# Research Quality Measurement

When verifying a research document, compute the **verification ratio**:

```
ratio = verified_references / total_references
```

A reference is *verified* only if BOTH the `file:line` resolves to real code AND
the quoted snippet matches the source.

## Quality levels

| Level | Criteria |
|-------|----------|
| `VERIFIED` | ratio = 100%, all snippets match exactly |
| `MOSTLY-VERIFIED` | ratio ≥ 80%, only minor discrepancies (e.g. off-by-one line numbers) |
| `PARTIALLY-VERIFIED` | 50% ≤ ratio < 80%, at least one substantive discrepancy |
| `UNRELIABLE` | ratio < 50% |

## Required output sections in `verified-research.md`

1. **Verification Summary** — pass/fail + Research Quality level.
2. **Verified Claims** — each confirmed `file:line` + snippet.
3. **Discrepancies Found** — each wrong reference, what was claimed vs. actual.
4. **Research Quality Assessment** — the level + reasoning (cite the ratio).
5. **References** — list of all checked `file:line` locations.
```

- [ ] **Step 2: Commit**

```bash
git add homework-4/skills/research-quality-measurement.md
git commit -m "feat(homework-4): research-quality-measurement skill"
```

---

### Task 6: Skill — unit-tests-FIRST

**Files:**
- Create: `homework-4/skills/unit-tests-FIRST.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: unit-tests-FIRST
description: Use when generating unit tests to ensure they follow the FIRST principles (Fast, Independent, Repeatable, Self-validating, Timely).
---

# Unit Tests — FIRST

Every generated test must satisfy FIRST:

- **Fast** — no network/disk/sleep; run in milliseconds. Use in-memory app + supertest.
- **Independent** — no shared state between tests; reset the store in `beforeEach`. Order must not matter.
- **Repeatable** — deterministic; no reliance on dates, randomness, or environment. Freeze/avoid `Date.now()` assertions.
- **Self-validating** — explicit `expect(...)` assertions; pass/fail is unambiguous, no manual inspection.
- **Timely** — written for the code changed in this fix only; cover the new/changed behaviour and its edge cases.

## Checklist before writing each test
- [ ] Targets only code listed in `fix-summary.md`.
- [ ] Resets shared state in `beforeEach`.
- [ ] Asserts a concrete value or status code.
- [ ] No external I/O or timing dependence.
- [ ] Includes at least one edge case (empty/invalid input).

`test-report.md` must state how the generated tests satisfy each FIRST letter.
```

- [ ] **Step 2: Commit**

```bash
git add homework-4/skills/unit-tests-FIRST.md
git commit -m "feat(homework-4): unit-tests-FIRST skill"
```

---

### Task 7: Author the 4 canonical agent definitions

**Files:**
- Create: `homework-4/agents/research-verifier.agent.md`
- Create: `homework-4/agents/bug-fixer.agent.md`
- Create: `homework-4/agents/security-verifier.agent.md`
- Create: `homework-4/agents/unit-test-generator.agent.md`

- [ ] **Step 1: Write `agents/research-verifier.agent.md`**

```markdown
---
name: research-verifier
description: Fact-checks Bug Researcher output. Verifies every file:line and snippet, then writes verified-research.md with a Research Quality level.
model: opus
tools: Read, Glob, Grep, Write
---

# Bug Research Verifier

Model rationale: **opus** — careful fact-checking of every file:line and snippet
demands the strongest reasoning; accuracy outweighs cost here.

## Task
1. Read `context/bugs/001-notes-api/research/codebase-research.md`.
2. For every `file:line` reference, open the source and confirm the line number
   AND that the quoted snippet matches.
3. Apply the **research-quality-measurement** skill to assign a quality level.
4. Write `context/bugs/001-notes-api/research/verified-research.md` with the five
   required sections (Verification Summary, Verified Claims, Discrepancies Found,
   Research Quality Assessment, References).

## Notes
- At least one reference is expected to be wrong — document it under Discrepancies.
- Do not edit source code. Output the result file only.
```

- [ ] **Step 2: Write `agents/bug-fixer.agent.md`**

```markdown
---
name: bug-fixer
description: Executes implementation-plan.md, applies each code change, runs the test suite, and writes fix-summary.md.
model: sonnet
tools: Read, Edit, Write, Bash, Glob, Grep
---

# Bug Fixer

Model rationale: **sonnet** — applying a fully specified plan is routine,
deterministic editing; sonnet gives the best speed/quality balance.

## Task
1. Read `context/bugs/001-notes-api/implementation-plan.md` fully.
2. Apply each change exactly as the before/after blocks specify.
3. Run the test command (`npm test`) after the changes.
4. If tests fail, document the failure and stop.
5. Write `context/bugs/001-notes-api/fix-summary.md` with: Changes Made
   (file, location, before/after, test result), Overall Status, Manual
   Verification steps, References.
```

- [ ] **Step 3: Write `agents/security-verifier.agent.md`**

```markdown
---
name: security-verifier
description: Security review of the code changed by the Bug Fixer. Rates findings and writes security-report.md. Never edits code.
model: opus
tools: Read, Glob, Grep, Write
---

# Security Vulnerabilities Verifier

Model rationale: **opus** — security reasoning (injection, path traversal,
insecure comparisons, missing validation) is high-stakes; deep reasoning is worth
the cost.

## Task
1. Read `context/bugs/001-notes-api/fix-summary.md` and the changed files.
2. Scan for: injection, hardcoded secrets, insecure comparisons, missing
   validation, unsafe dependencies, XSS/CSRF where relevant.
3. Confirm whether the path-traversal fix is effective; flag any residual risk.
4. Rate each finding CRITICAL / HIGH / MEDIUM / LOW / INFO.
5. Write `context/bugs/001-notes-api/security-report.md`. Every finding has a
   severity, `file:line`, and remediation. Report only — no code edits.
```

- [ ] **Step 4: Write `agents/unit-test-generator.agent.md`**

```markdown
---
name: unit-test-generator
description: Generates and runs unit tests for the code changed by the Bug Fixer, following the FIRST principles, then writes test-report.md.
model: haiku
tools: Read, Write, Bash, Glob, Grep
---

# Unit Test Generator

Model rationale: **haiku** — test scaffolding from a clear template and a
well-scoped diff is fast, cheap work; haiku is sufficient.

## Task
1. Read `context/bugs/001-notes-api/fix-summary.md` and the changed files.
2. Apply the **unit-tests-FIRST** skill.
3. Generate NEW tests for the changed code only (edge cases beyond the existing
   suite) in `tests/`. Do not duplicate `tests/notes.test.js`; add e.g.
   `tests/notes.generated.test.js`.
4. Run `npm test` and record the result.
5. Write `context/bugs/001-notes-api/test-report.md` covering: tests added,
   FIRST compliance (per letter), run result, references.
```

- [ ] **Step 5: Commit**

```bash
git add homework-4/agents
git commit -m "feat(homework-4): 4 agent definitions with explicit per-agent models"
```

---

### Task 8: Mirror agents and skills into `.claude/` runtime dirs

The `/run-pipeline` command dispatches subagents by name, so the runtime needs
copies under `.claude/agents/` and `.claude/skills/` with identical content.

**Files:**
- Create: `homework-4/.claude/agents/research-verifier.md`
- Create: `homework-4/.claude/agents/bug-fixer.md`
- Create: `homework-4/.claude/agents/security-verifier.md`
- Create: `homework-4/.claude/agents/unit-test-generator.md`
- Create: `homework-4/.claude/skills/research-quality-measurement/SKILL.md`
- Create: `homework-4/.claude/skills/unit-tests-FIRST/SKILL.md`

- [ ] **Step 1: Copy agent files (strip the `.agent` from the filename)**

Run:
```bash
cd homework-4
mkdir -p .claude/agents
for a in research-verifier bug-fixer security-verifier unit-test-generator; do
  cp "agents/$a.agent.md" ".claude/agents/$a.md"
done
```
Expected: four files created under `.claude/agents/`.

- [ ] **Step 2: Copy skills into SKILL.md layout (Claude Code skill convention)**

Run:
```bash
cd homework-4
mkdir -p .claude/skills/research-quality-measurement .claude/skills/unit-tests-FIRST
cp skills/research-quality-measurement.md .claude/skills/research-quality-measurement/SKILL.md
cp skills/unit-tests-FIRST.md .claude/skills/unit-tests-FIRST/SKILL.md
```
Expected: two `SKILL.md` files created.

- [ ] **Step 3: Commit**

```bash
git add homework-4/.claude/agents homework-4/.claude/skills
git commit -m "chore(homework-4): runtime mirrors of agents and skills under .claude/"
```

---

### Task 9: Write the `/run-pipeline` orchestrator command

**Files:**
- Create: `homework-4/.claude/commands/run-pipeline.md`

- [ ] **Step 1: Write the command**

```markdown
---
description: Run the 4-agent pipeline (research verify → fix → security → tests) on the Notes API.
---

# /run-pipeline

Orchestrate the 4-agent pipeline in order. Run each step by dispatching the named
subagent via the Agent tool. Stop and report if a step's required input file is
missing or a step fails. After all steps, print a summary table of statuses and
the produced artifact paths.

## Preconditions
- `context/bugs/001-notes-api/research/codebase-research.md` exists.
- `context/bugs/001-notes-api/implementation-plan.md` exists.
If either is missing, stop with an error.

## Steps (run sequentially)

1. **Research Verifier** — dispatch the `research-verifier` subagent.
   Instruction: "Verify codebase-research.md per the research-quality-measurement
   skill and write verified-research.md."
   Gate: confirm `research/verified-research.md` was created.

2. **Bug Fixer** — dispatch the `bug-fixer` subagent.
   Instruction: "Apply implementation-plan.md to src/, run `npm test`, write
   fix-summary.md."
   Gate: confirm `fix-summary.md` exists and reports tests passing.

3. **Security Verifier** — dispatch the `security-verifier` subagent.
   Instruction: "Review the changed files per fix-summary.md and write
   security-report.md. Report only."
   Gate: confirm `security-report.md` exists.

4. **Unit Test Generator** — dispatch the `unit-test-generator` subagent.
   Instruction: "Generate FIRST-compliant tests for the changed code, run
   `npm test`, write test-report.md."
   Gate: confirm `test-report.md` exists and tests pass.

## Final output
Print a table: step | model | artifact | status (✅/❌).
```

- [ ] **Step 2: Commit**

```bash
git add homework-4/.claude/commands/run-pipeline.md
git commit -m "feat(homework-4): /run-pipeline orchestrator command"
```

---

### Task 10: Write the `run-pipeline.sh` wrapper

**Files:**
- Create: `homework-4/run-pipeline.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Single-command entry point for the 4-agent pipeline.
# Delegates orchestration to the /run-pipeline slash command.

cd "$(dirname "$0")"

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: 'claude' CLI not found. Install Claude Code first." >&2
  exit 1
fi

if [ ! -f context/bugs/001-notes-api/research/codebase-research.md ]; then
  echo "ERROR: missing research input (codebase-research.md)." >&2
  exit 1
fi

echo "▶ Starting 4-agent pipeline via /run-pipeline ..."
claude -p "/run-pipeline"
echo "✔ Pipeline finished. See context/bugs/001-notes-api/*.md for artifacts."
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x homework-4/run-pipeline.sh`
Expected: no output; file is now executable.

- [ ] **Step 3: Verify the precondition guard fires correctly**

Run: `cd homework-4 && ./run-pipeline.sh --help 2>&1 | head -3 || true`
Expected: it reaches the `claude -p` invocation (or prints the missing-CLI error if claude is absent). Do NOT fully execute the pipeline yet — that's Task 12.

- [ ] **Step 4: Commit**

```bash
git add homework-4/run-pipeline.sh
git commit -m "feat(homework-4): run-pipeline.sh single-command wrapper"
```

---

### Task 11: Write README and HOWTORUN

**Files:**
- Create: `homework-4/README.md`
- Create: `homework-4/HOWTORUN.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Homework 4 — 4-Agent Pipeline

**Author / Student:** <ВАШЕ ІМʼЯ — заповніть перед PR, як вимагає кореневий README>

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
```

- [ ] **Step 2: Write `HOWTORUN.md`**

```markdown
# How to run — Homework 4

## Prerequisites
- Node.js ≥ 18, npm
- Claude Code CLI (`claude`) logged in

## Install
```bash
cd homework-4
npm install
```

## See the bugs (before)
```bash
npm test        # RED — seeded bugs and vuln cause failures
```

## Run the pipeline (one command)
```bash
npm run pipeline      # or ./run-pipeline.sh
```
This invokes `/run-pipeline`, which dispatches the four agents in order and writes
their artifacts under `context/bugs/001-notes-api/`.

## See the fixes (after)
```bash
npm test        # GREEN — Bug Fixer applied the plan; generated tests added
```

## Run the app
```bash
npm start       # http://localhost:3000
```
```

- [ ] **Step 3: Commit**

```bash
git add homework-4/README.md homework-4/HOWTORUN.md
git commit -m "docs(homework-4): README (model rationale, screenshots) and HOWTORUN"
```

---

### Task 12: Run the pipeline and capture deliverables

This task executes the real pipeline and gathers screenshots. It produces the
agent output artifacts and flips the test suite to GREEN.

- [ ] **Step 1: Confirm RED baseline already captured**

Ensure `02-tests-before.png` was taken in Task 3. If not, run `npm test` and capture it now BEFORE proceeding.

- [ ] **Step 2: Run the pipeline**

Run: `cd homework-4 && npm run pipeline`
Expected: all four agents run in order; artifacts appear under
`context/bugs/001-notes-api/`.

- [ ] **Step 3: 📸 REMIND USER (pipeline run)**

Tell the user: **"📸 Зроби скриншот: `01-pipeline-run.png` — запуск пайплайну зі стартом 4 агентів і фінальним підсумком."**

- [ ] **Step 4: 📸 REMIND USER (verified research)**

After step 1's agent finishes: **"📸 Зроби скриншот: `07-verified-research.png` — `verified-research.md` з рівнем якості за скілом і знайденою розбіжністю (`src/app.js:10`)."**

- [ ] **Step 5: 📸 REMIND USER (fix summary + tests after)**

After Bug Fixer: **"📸 Зроби скриншоти: `04-fix-summary.png` (`fix-summary.md` before/after) і `03-tests-after.png` (`npm test` зелений)."**

- [ ] **Step 6: 📸 REMIND USER (security report)**

After Security Verifier: **"📸 Зроби скриншот: `05-security-report.png` — path traversal: CRITICAL + file:line + remediation."**

- [ ] **Step 7: 📸 REMIND USER (test report)**

After Unit Test Generator: **"📸 Зроби скриншот: `06-test-report.png` — `test-report.md` + новий тест-файл, зелений прогон."**

- [ ] **Step 8: 📸 REMIND USER (agent models — bonus)**

**"📸 Зроби скриншот: `08-agent-models.png` — frontmatter `.agent.md` або лог із opus/sonnet/haiku."**

- [ ] **Step 9: Verify GREEN and commit artifacts + screenshots**

Run: `cd homework-4 && npm test`
Expected: PASS (all suites green, including generated tests).

```bash
git add homework-4/context homework-4/src homework-4/tests homework-4/docs/screenshots
git commit -m "feat(homework-4): pipeline run artifacts, fixes, generated tests, screenshots"
```

---

### Task 13: Open the submission PR

- [ ] **Step 1: Create the submission branch (if not already on one)**

```bash
git checkout -b homework-4-submission
git push origin homework-4-submission
```

- [ ] **Step 2: Open the PR** (base: `main` on this fork)

Include: implementation summary, AI tools/prompts used, per-agent model rationale,
challenges, and the embedded screenshots from `docs/screenshots/`.

---

## Self-Review

**Spec coverage:**
- Task 1.2 research-quality skill → Task 5; verifier uses it → Task 7/agent + Task 12.
- Task 2 Bug Fixer → Task 7 agent + executed Task 12; fix-summary required sections covered in agent prompt.
- Task 3 Security Verifier → Task 7 agent (report-only, severity, file:line, remediation).
- Task 4 Unit Test Generator + FIRST skill → Task 6 + Task 7 agent.
- Task 5 sample app with ≥2 bugs + ≥1 security issue → Task 2 (2 bugs + path traversal).
- Single-command execution → Task 9 (/run-pipeline) + Task 10 (run-pipeline.sh / npm run pipeline).
- Explicit per-agent model + justification → Task 7 frontmatter + README table (Task 11).
- Pre-seeded research with discrepancy → Task 4 step 2.
- Deliverables (artifacts, screenshots, README, HOWTORUN, PR) → Tasks 11, 12, 13.

**Placeholder scan:** The only intentional placeholder is `<ВАШЕ ІМʼЯ>` in README (author info the user must fill). All code/content steps contain real content.

**Type consistency:** `_reset`, `createNote`, `getNote`, `listNotes`, `deleteNote` consistent across `src/store.js` and `tests/notes.test.js`. `createApp` consistent across `app.js`, `index.js`, tests. Artifact paths under `context/bugs/001-notes-api/` consistent across agents, command, and script. Generated tests file `tests/notes.generated.test.js` named consistently.
```
