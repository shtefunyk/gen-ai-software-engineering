# Codebase Research — 001 Notes API

> Output of the (pre-seeded) Bug Researcher. The Research Verifier must fact-check
> every file:line reference below.

## Finding 1 — Pagination returns nothing (BUG 2)
- **Location:** `src/store.js:33-35`
- **Snippet:**
  ```js
  const off = parseInt(offset);
  const lim = parseInt(limit);
  return result.slice(off, off + lim);
  ```
- **Cause:** `parseInt(undefined)` is `NaN`; `slice(NaN, NaN)` returns `[]`.

## Finding 2 — Tag filter never matches (BUG 1)
- **Location:** `src/store.js:27`
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
