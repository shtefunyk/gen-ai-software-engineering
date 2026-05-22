# Fix Summary — 001 Notes API

Status: **PASS** — all 5 tests pass (`npm test`, 1 test file).

> Artifact materialised by the pipeline orchestrator from the Bug Fixer agent's
> verbatim report (the agent applied the changes and ran the tests but is
> configured not to write summary files itself).

## Changes Applied

### `src/store.js`

**Change 1 — Fix tag filter (BUG 1), line 27**
- Before: `result = result.filter((n) => n.title == tag);`
- After: `result = result.filter((n) => n.tag === tag);`
- The original compared the note's `title` property (wrong field) with loose
  equality (`==`) instead of comparing `tag` with strict equality (`===`), so
  tag filtering never returned correct results.

**Change 2 — Guard pagination (BUG 2), lines 33-35**
- Before: `parseInt(offset)` / `parseInt(limit)` / `result.slice(off, off + lim)`
  with no NaN or negative guards.
- After: uses `Number.parseInt(..., 10)` with `Number.isFinite` and non-negative
  checks; falls back to `0` for offset and `result.length` for limit when values
  are missing/invalid.
- The original made a plain `GET /notes` (no query params) return an empty array
  because `parseInt(undefined)` is `NaN` and `slice(NaN, NaN)` returns `[]`.

### `src/app.js`

**Change 3 — Block path traversal (SECURITY), lines 40-42**
- Before: `path.join(dataDir, String(file))` with no validation.
- After: `path.resolve(dataDir, String(file))` followed by a check that the
  resolved path starts with `dataDir + path.sep`; returns 400
  `{ error: 'invalid file path' }` otherwise.
- The original allowed `?file=../../package.json` to escape the data directory.

## Test Result

`npm test` — 5 tests across 1 test file, all passed, no failures.
