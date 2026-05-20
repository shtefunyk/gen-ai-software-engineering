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
