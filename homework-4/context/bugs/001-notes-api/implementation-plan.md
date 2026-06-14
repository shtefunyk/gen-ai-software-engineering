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
