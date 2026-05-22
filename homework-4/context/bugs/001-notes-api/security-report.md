# Security Report — 001 Notes API

Scope: changed files `src/app.js` and `src/store.js` (per `fix-summary.md`),
plus `package.json` dependency review. Report only — no code edits performed.

## Path-Traversal Fix Verdict

**Effective against the documented attack.** `GET /notes/:id/backup?file=../../package.json`
is now blocked. `path.resolve(dataDir, String(file))` normalizes `..` segments
*before* the `full.startsWith(dataDir + path.sep)` prefix check
(`src/app.js:41-44`), so escapes outside `dataDir` resolve to a path that fails
the prefix test and returns `400 invalid file path`. Using `dataDir + path.sep`
(rather than bare `dataDir`) correctly prevents the sibling-prefix bypass
(e.g. a `data-evil` directory next to `data`).

Residual risks remain — see findings SEC-1 and SEC-2.

## Findings

### SEC-1 — Symlink traversal not blocked (residual path-traversal) — MEDIUM
- **File:** `src/app.js:41-45`
- **Detail:** The check validates the *lexical* resolved path but never resolves
  symlinks (`fs.realpath`). A symlink placed inside `data/` that points outside
  the directory passes `startsWith(dataDir + path.sep)`, yet `readFile` follows
  it and reads the external target. Whether this is exploitable depends on who
  can write into `data/`, but it is a real residual gap in a fix whose stated
  purpose is to contain reads to `dataDir`.
- **Remediation:** Resolve the real path and re-check containment, e.g.
  `fs.realpath(full, ...)` then verify the realpath still starts with
  `dataDir + path.sep` (or `fs.realpathSync` of `dataDir` once at startup).
  Reject on any `realpath` error.

### SEC-2 — Unauthenticated arbitrary file read within data dir; `:id` ignored — MEDIUM
- **File:** `src/app.js:39-49`
- **Detail:** The `:id` route param is never used — the handler reads whatever
  `?file=` names inside `dataDir` with no authentication, authorization, or
  ownership check tying the file to the note. Any caller can enumerate/read
  every file under `data/`. There is also no allow-list or extension restriction.
- **Remediation:** Validate that `:id` maps to an existing note and that the
  requested file belongs to that note (e.g. derive the filename from the note id
  server-side rather than accepting an arbitrary `file` query param). Add an
  allow-list of permitted filenames/extensions.

### SEC-3 — No input validation on `file` type / value — LOW
- **File:** `src/app.js:40-41`
- **Detail:** `req.query.file` may be absent, an array (`?file=a&file=b` → array),
  or an object (`?file[x]=y`). `String(file)` coerces these to `"undefined"`,
  `"a,b"`, or `"[object Object]"`, which then hit the filesystem. Not directly
  exploitable given the containment check, but it is unvalidated input reaching
  `readFile` and yields confusing behavior.
- **Remediation:** Require `file` to be a non-empty string; return `400` for
  missing/array/object values before any path operations.

### SEC-4 — Stored-content reflection without content type guarantee (XSS vector) — LOW
- **File:** `src/app.js:47`
- **Detail:** Backup file contents are returned with `res.type('text/plain')`,
  which is the safe choice and mitigates HTML/script rendering. Flagged as INFO-
  adjacent: if a future change switches to `res.send` without an explicit
  `text/plain` type, attacker-controlled file contents could be served as HTML
  and execute in a browser. No issue today; noted to prevent regression.
- **Remediation:** Keep the explicit `text/plain` type; consider adding
  `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

### SEC-5 — Note creation accepts unbounded/unsanitized fields — LOW
- **File:** `src/app.js:14-18`, `src/store.js:5-15`
- **Detail:** `title`, `body`, and `tag` are stored verbatim with only a
  truthiness check on `title`. No length limits, no type checks (`title` could
  be an object/array), and no output encoding. As a JSON API this is low risk
  (clients are responsible for encoding on render), but the lack of size limits
  allows unbounded in-memory growth (minor DoS) and non-string types propagate
  into responses unchanged.
- **Remediation:** Enforce string types and max lengths on `title`/`body`/`tag`;
  reject oversized payloads. Express `json` body limit (default 100kb) provides
  partial protection but not per-field bounds.

### SEC-6 — Dependency posture — INFO
- **File:** `package.json:13-19`
- **Detail:** Only runtime dependency is `express@^4.18.2`. The caret range will
  pull newer 4.x patch/minor releases. No known unsafe/abandoned packages
  present. `supertest`/`vitest` are dev-only. Recommend running
  `npm audit` in CI and pinning via lockfile to avoid surprise upgrades.
- **Remediation:** Commit/verify `package-lock.json`, add `npm audit` to the
  pipeline, and periodically bump to the latest 4.x with audit clearance.

## Items Confirmed Clean / Not Applicable

- **Injection (SQL/command/NoSQL):** None — no database, no shell, no `eval`,
  no template engine. (INFO)
- **Hardcoded secrets:** None found in either changed file or `package.json`. (INFO)
- **Insecure comparisons:** The previous loose `==` (`store.js`) was replaced
  with strict `===` (`src/store.js:27`). No timing-sensitive comparisons
  (no tokens/passwords) exist. (INFO)
- **CSRF:** Stateless API with no cookie-based session/auth — CSRF not
  applicable in current design. (INFO)
- **Pagination guards (BUG 2):** `Number.isFinite` + non-negative checks in
  `src/store.js:33-37` are correct and prevent the NaN/empty-result behavior;
  no integer-overflow or negative-slice security concern remains. (INFO)

## Severity Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 0 | — |
| HIGH     | 0 | — |
| MEDIUM   | 2 | SEC-1, SEC-2 |
| LOW      | 3 | SEC-3, SEC-4, SEC-5 |
| INFO     | 1 | SEC-6 |

The originally documented CRITICAL path traversal (`app.js:37-38`) is
remediated for lexical escapes; remaining exposure is the symlink and
missing-authorization gaps captured in SEC-1 and SEC-2.
