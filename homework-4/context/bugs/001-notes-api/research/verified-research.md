# Verified Research — 001 Notes API

> Fact-check of `research/codebase-research.md` against the actual source under
> `homework-4/src/`. Every `file:line` reference and code snippet was opened and
> compared to source.

## 1. Verification Summary

- **Result:** PARTIAL PASS (2 of 3 references fully verified).
- **Research Quality level:** `PARTIALLY-VERIFIED`
- **Verification ratio:** 2 / 3 = 66.7%
- One substantive discrepancy found: Finding 3 cites the wrong line number
  (`app.js:10` instead of the actual `app.js:41`).

## 2. Verified Claims

### Finding 1 — Pagination returns nothing (BUG 2) — VERIFIED
- **Claimed:** `src/store.js:33-35`
- **Source (lines 33-35) matches exactly:**
  ```js
  const off = parseInt(offset);
  const lim = parseInt(limit);
  return result.slice(off, off + lim);
  ```
- Line numbers correct, snippet correct. The accompanying cause
  (`parseInt(undefined)` → `NaN`, `slice(NaN, NaN)` → `[]`) is consistent with
  the in-source comment at lines 30-32.

### Finding 2 — Tag filter never matches (BUG 1) — VERIFIED
- **Claimed:** `src/store.js:27`
- **Source (line 27) matches exactly:**
  ```js
  result = result.filter((n) => n.title == tag);
  ```
- Line number correct, snippet correct. Cause (filters on `title` instead of
  `tag`, loose `==`) confirmed by the in-source comment at lines 25-26.

## 3. Discrepancies Found

### Finding 3 — Path traversal in backup route (SECURITY) — DISCREPANCY (wrong line)
- **Claimed location:** `src/app.js:10`
- **Claimed snippet:**
  ```js
  const full = path.join(dataDir, String(file));
  ```
- **Actual:** `src/app.js:10` is `export function createApp() {`.
  The quoted snippet does exist in the file, but at **line 41**, inside the
  `GET /notes/:id/backup` handler.
- **Impact:** The underlying vulnerability claim is real and correct — `file`
  from the query string is joined onto `dataDir` with no containment check
  (confirmed lines 39-46, with the in-source CRITICAL comment at lines 37-38).
  Only the line reference is wrong, and it is off by 31 lines (not a benign
  off-by-one), so it counts as a substantive discrepancy under the skill.
- **Correct reference:** `src/app.js:41`.

## 4. Research Quality Assessment

- **Level:** `PARTIALLY-VERIFIED`
- **Reasoning:** A reference is "verified" only when BOTH the `file:line`
  resolves to the right code AND the snippet matches. Findings 1 and 2 satisfy
  both conditions. Finding 3's snippet text exists in the file but at line 41,
  not the cited line 10, so it fails the `file:line` half of the test.
  Verification ratio = 2/3 = 66.7%, which falls in the band
  `50% <= ratio < 80%` with at least one substantive discrepancy →
  `PARTIALLY-VERIFIED`. It does not qualify as `MOSTLY-VERIFIED` because the
  single error is not a minor off-by-one (it is off by 31 lines).

## 5. References

| # | Claimed | Status | Actual / Note |
|---|---------|--------|---------------|
| 1 | `homework-4/src/store.js:33-35` | VERIFIED | Snippet and lines match |
| 2 | `homework-4/src/store.js:27` | VERIFIED | Snippet and line match |
| 3 | `homework-4/src/app.js:10` | DISCREPANCY | Snippet actually at `homework-4/src/app.js:41`; line 10 is `export function createApp() {` |

Files checked:
- `/Users/bodya0111/Desktop/gen-ai-software-engineering/homework-4/src/store.js`
- `/Users/bodya0111/Desktop/gen-ai-software-engineering/homework-4/src/app.js`
