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
    result = result.filter((n) => n.tag === tag);
  }

  // BUG 2: no defaults / NaN / negative guards. With no params,
  // parseInt(undefined) === NaN and slice(NaN, NaN) returns [] —
  // so a plain GET /notes returns nothing.
  const parsedOff = Number.parseInt(offset, 10);
  const parsedLim = Number.parseInt(limit, 10);
  const off = Number.isFinite(parsedOff) && parsedOff >= 0 ? parsedOff : 0;
  const end = Number.isFinite(parsedLim) && parsedLim >= 0 ? off + parsedLim : result.length;
  return result.slice(off, end);
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
