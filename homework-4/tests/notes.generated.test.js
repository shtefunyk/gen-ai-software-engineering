import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as store from '../src/store.js';

const app = createApp();

beforeEach(() => store._reset());

async function seed(notes) {
  for (const n of notes) {
    await request(app).post('/notes').send(n);
  }
}

// ============================================================================
// UNIT TESTS FOR BUG 1 FIX: Tag Filter Correction (store.js line 27)
// Test: Ensures tag property (not title) is compared with strict equality (===)
// ============================================================================

describe('listNotes() — tag filter edge cases (BUG 1 fix)', () => {
  describe('F — Fast: Direct function calls on store', () => {
    it('filters correctly by tag when tag exists', () => {
      store.createNote({ title: 'Meeting', tag: 'work' });
      store.createNote({ title: 'Grocery', tag: 'personal' });
      store.createNote({ title: 'Project', tag: 'work' });
      const result = store.listNotes({ tag: 'work' });
      expect(result).toHaveLength(2);
      expect(result.every((n) => n.tag === 'work')).toBe(true);
    });

    it('returns empty array when tag does not match any notes', () => {
      store.createNote({ title: 'Note1', tag: 'work' });
      store.createNote({ title: 'Note2', tag: 'home' });
      const result = store.listNotes({ tag: 'nonexistent' });
      expect(result).toHaveLength(0);
    });

    it('returns empty array when filtering by undefined tag (no tag field set)', () => {
      store.createNote({ title: 'NoTag1' });
      store.createNote({ title: 'WithTag', tag: 'work' });
      const result = store.listNotes({ tag: null });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('NoTag1');
    });

    it('compares tag with strict equality (=== not ==)', () => {
      // Loose equality would convert "1" == 1 (true), but === should reject it
      store.createNote({ title: 'TagAsNumber', tag: 1 });
      store.createNote({ title: 'TagAsString', tag: '1' });
      const resultNumber = store.listNotes({ tag: 1 });
      const resultString = store.listNotes({ tag: '1' });
      expect(resultNumber).toHaveLength(1);
      expect(resultNumber[0].tag).toBe(1);
      expect(resultString).toHaveLength(1);
      expect(resultString[0].tag).toBe('1');
    });

    it('filters correctly when multiple notes have the same tag', () => {
      store.createNote({ title: 'A', tag: 'urgent' });
      store.createNote({ title: 'B', tag: 'urgent' });
      store.createNote({ title: 'C', tag: 'urgent' });
      store.createNote({ title: 'D', tag: 'normal' });
      const result = store.listNotes({ tag: 'urgent' });
      expect(result).toHaveLength(3);
    });

    it('returns all notes when tag is undefined (no filter applied)', () => {
      store.createNote({ title: 'A', tag: 'work' });
      store.createNote({ title: 'B', tag: 'home' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ tag: undefined });
      expect(result).toHaveLength(3);
    });
  });

  describe('I — Isolated: HTTP layer isolation', () => {
    it('GET /notes?tag=value returns only matching notes via HTTP', async () => {
      await seed([
        { title: 'Work1', tag: 'work' },
        { title: 'Work2', tag: 'work' },
        { title: 'Personal', tag: 'personal' },
      ]);
      const res = await request(app).get('/notes?tag=work');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.every((n) => n.tag === 'work')).toBe(true);
    });

    it('GET /notes?tag= with empty string filters by empty tag', async () => {
      await seed([
        { title: 'Tagged', tag: 'work' },
        { title: 'Untagged', tag: '' },
      ]);
      const res = await request(app).get('/notes?tag=');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].tag).toBe('');
    });

    it('GET /notes without ?tag returns all notes', async () => {
      await seed([
        { title: 'Work', tag: 'work' },
        { title: 'Home', tag: 'home' },
        { title: 'Untagged' },
      ]);
      const res = await request(app).get('/notes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });
  });

  describe('R — Repeatable: Consistent results across calls', () => {
    it('repeated calls with same tag return identical results', () => {
      store.createNote({ title: 'A', tag: 'test' });
      store.createNote({ title: 'B', tag: 'test' });
      store.createNote({ title: 'C', tag: 'other' });
      const result1 = store.listNotes({ tag: 'test' });
      const result2 = store.listNotes({ tag: 'test' });
      expect(result1).toEqual(result2);
      expect(result1).toHaveLength(2);
    });

    it('does not mutate the original notes array during filtering', () => {
      store.createNote({ title: 'A', tag: 'test' });
      store.createNote({ title: 'B', tag: 'other' });
      const beforeCount = 2;
      store.listNotes({ tag: 'test' });
      store.listNotes({ tag: 'test' });
      const allNotes = store.listNotes({ tag: undefined });
      expect(allNotes).toHaveLength(beforeCount);
    });
  });

  describe('S — Self-checking: Assertions on filter correctness', () => {
    it('all returned notes have the requested tag property', () => {
      store.createNote({ title: 'A', tag: 'alpha' });
      store.createNote({ title: 'B', tag: 'beta' });
      store.createNote({ title: 'C', tag: 'alpha' });
      const result = store.listNotes({ tag: 'alpha' });
      result.forEach((note) => {
        expect(note).toHaveProperty('tag');
        expect(note.tag).toBe('alpha');
      });
    });

    it('tag filter does not accidentally match on title property', () => {
      store.createNote({ title: 'work', tag: 'personal' });
      store.createNote({ title: 'personal', tag: 'work' });
      const result = store.listNotes({ tag: 'work' });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('personal');
      expect(result[0].tag).toBe('work');
    });
  });

  describe('T — Thorough: Boundary and special cases', () => {
    it('handles tag with special characters', () => {
      store.createNote({ title: 'A', tag: 'work/important' });
      store.createNote({ title: 'B', tag: 'work' });
      const result = store.listNotes({ tag: 'work/important' });
      expect(result).toHaveLength(1);
      expect(result[0].tag).toBe('work/important');
    });

    it('handles case-sensitive tag matching', () => {
      store.createNote({ title: 'A', tag: 'Work' });
      store.createNote({ title: 'B', tag: 'work' });
      const resultUpper = store.listNotes({ tag: 'Work' });
      const resultLower = store.listNotes({ tag: 'work' });
      expect(resultUpper).toHaveLength(1);
      expect(resultLower).toHaveLength(1);
      expect(resultUpper[0].title).toBe('A');
      expect(resultLower[0].title).toBe('B');
    });

    it('handles numeric tag values correctly', () => {
      store.createNote({ title: 'A', tag: 123 });
      store.createNote({ title: 'B', tag: '123' });
      const resultNum = store.listNotes({ tag: 123 });
      const resultStr = store.listNotes({ tag: '123' });
      expect(resultNum).toHaveLength(1);
      expect(resultStr).toHaveLength(1);
    });

    it('handles null tag in store when filtering by null', () => {
      store.createNote({ title: 'A', tag: null });
      store.createNote({ title: 'B', tag: 'work' });
      const result = store.listNotes({ tag: null });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('A');
    });
  });
});

// ============================================================================
// UNIT TESTS FOR BUG 2 FIX: Pagination Guards (store.js lines 33-36)
// Test: Ensures Number.isFinite and non-negative checks prevent NaN/invalid args
// ============================================================================

describe('listNotes() — pagination with guards (BUG 2 fix)', () => {
  describe('F — Fast: Direct store function calls', () => {
    it('returns all notes with no pagination params', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({});
      expect(result).toHaveLength(3);
    });

    it('applies offset correctly with valid number', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ offset: 1, limit: 10 });
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('B');
    });

    it('applies limit correctly with valid number', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ limit: 2 });
      expect(result).toHaveLength(2);
    });

    it('handles offset as string and parses with base 10', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ offset: '1', limit: '2' });
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('B');
    });

    it('returns all notes when limit is undefined', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ offset: 0, limit: undefined });
      expect(result).toHaveLength(3);
    });

    it('returns all notes when offset is undefined', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ offset: undefined, limit: 2 });
      expect(result).toHaveLength(2);
    });

    it('returns empty array when offset is >= total notes', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      const result = store.listNotes({ offset: 10 });
      expect(result).toHaveLength(0);
    });

    it('treats NaN offset as 0 (default)', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      const result = store.listNotes({ offset: NaN });
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('A');
    });

    it('treats negative offset as 0', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ offset: -5 });
      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('A');
    });

    it('treats NaN limit as result.length (all remaining)', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ offset: 1, limit: NaN });
      expect(result).toHaveLength(2);
    });

    it('treats negative limit as result.length (all remaining)', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ offset: 1, limit: -5 });
      expect(result).toHaveLength(2);
    });
  });

  describe('I — Isolated: HTTP endpoint isolation', () => {
    it('GET /notes returns all notes with no params', async () => {
      await seed([{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
      const res = await request(app).get('/notes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });

    it('GET /notes?offset=1&limit=2 respects both params', async () => {
      await seed([{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
      const res = await request(app).get('/notes?offset=1&limit=2');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('B');
    });

    it('GET /notes?limit=0 returns empty (0 items from offset 0)', async () => {
      await seed([{ title: 'A' }, { title: 'B' }]);
      const res = await request(app).get('/notes?limit=0');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('GET /notes?offset=999 returns empty array', async () => {
      await seed([{ title: 'A' }, { title: 'B' }]);
      const res = await request(app).get('/notes?offset=999');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('GET /notes?offset=abc (non-numeric) falls back to offset 0', async () => {
      await seed([{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
      const res = await request(app).get('/notes?offset=abc&limit=2');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('A');
    });

    it('GET /notes?limit=abc (non-numeric) falls back to all notes', async () => {
      await seed([{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
      const res = await request(app).get('/notes?offset=0&limit=abc');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });
  });

  describe('R — Repeatable: Consistent pagination across calls', () => {
    it('same pagination params return same results on repeated calls', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result1 = store.listNotes({ offset: 1, limit: 1 });
      const result2 = store.listNotes({ offset: 1, limit: 1 });
      expect(result1).toEqual(result2);
      expect(result1[0].title).toBe('B');
    });

    it('does not mutate store during pagination', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const initial = store.listNotes({});
      const paginated = store.listNotes({ offset: 1, limit: 1 });
      const after = store.listNotes({});
      expect(after).toEqual(initial);
      expect(after).toHaveLength(3);
    });
  });

  describe('S — Self-checking: Pagination boundary assertions', () => {
    it('respects offset: no note before offset index should be returned', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ offset: 2, limit: 10 });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('C');
    });

    it('respects limit: returned count does not exceed limit', () => {
      for (let i = 0; i < 100; i++) {
        store.createNote({ title: `Note${i}` });
      }
      const result = store.listNotes({ offset: 0, limit: 10 });
      expect(result.length).toBeLessThanOrEqual(10);
      expect(result).toHaveLength(10);
    });

    it('respects both offset and limit: count is min(limit, remaining)', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      store.createNote({ title: 'D' });
      const result = store.listNotes({ offset: 1, limit: 2 });
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('B');
      expect(result[1].title).toBe('C');
    });
  });

  describe('T — Thorough: Edge cases and boundary values', () => {
    it('handles offset of 0 explicitly', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      const result = store.listNotes({ offset: 0, limit: 1 });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('A');
    });

    it('handles limit of 1', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      const result = store.listNotes({ offset: 0, limit: 1 });
      expect(result).toHaveLength(1);
    });

    it('handles very large offset', () => {
      store.createNote({ title: 'A' });
      const result = store.listNotes({ offset: 999999 });
      expect(result).toHaveLength(0);
    });

    it('handles very large limit', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      const result = store.listNotes({ limit: 999999 });
      expect(result).toHaveLength(2);
    });

    it('parses offset as base-10 (not octal)', () => {
      store.createNote({ title: '0' });
      store.createNote({ title: '1' });
      store.createNote({ title: '2' });
      store.createNote({ title: '3' });
      store.createNote({ title: '4' });
      store.createNote({ title: '5' });
      store.createNote({ title: '6' });
      store.createNote({ title: '7' });
      store.createNote({ title: '8' });
      store.createNote({ title: '9' });
      const result = store.listNotes({ offset: '8', limit: 1 });
      expect(result[0].title).toBe('8');
    });

    it('parses limit as base-10 (not octal)', () => {
      for (let i = 0; i < 12; i++) {
        store.createNote({ title: String(i) });
      }
      const result = store.listNotes({ offset: 0, limit: '010' });
      expect(result).toHaveLength(10);
    });

    it('handles whitespace in numeric strings gracefully', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      store.createNote({ title: 'C' });
      const result = store.listNotes({ offset: ' 1 ', limit: ' 2 ' });
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('B');
    });

    it('handles infinity as invalid (fallback to defaults)', () => {
      store.createNote({ title: 'A' });
      store.createNote({ title: 'B' });
      const result = store.listNotes({ offset: Infinity, limit: Infinity });
      expect(result).toHaveLength(2);
    });
  });

  describe('Combined: Pagination + Tag filtering', () => {
    it('tag filter respects offset and limit', () => {
      store.createNote({ title: 'A', tag: 'work' });
      store.createNote({ title: 'B', tag: 'work' });
      store.createNote({ title: 'C', tag: 'work' });
      store.createNote({ title: 'D', tag: 'personal' });
      const result = store.listNotes({ tag: 'work', offset: 1, limit: 1 });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('B');
      expect(result[0].tag).toBe('work');
    });

    it('pagination with tag filtering on empty result set', () => {
      store.createNote({ title: 'A', tag: 'work' });
      const result = store.listNotes({ tag: 'nonexistent', offset: 0, limit: 10 });
      expect(result).toHaveLength(0);
    });
  });
});

// ============================================================================
// UNIT TESTS FOR SECURITY FIX: Path Traversal Protection (app.js lines 40-42)
// Test: Ensures path.resolve + startsWith check prevents directory escape
// ============================================================================

describe('GET /notes/:id/backup — path traversal protection', () => {
  describe('F — Fast: Direct path validation checks', () => {
    it('accepts a valid relative filename', async () => {
      await seed([{ title: 'test note' }]);
      const res = await request(app).get('/notes/1/backup?file=note-1-backup.txt');
      expect(res.status).toBe(200);
    });

    it('rejects ../ path traversal attempts', async () => {
      await seed([{ title: 'test' }]);
      const res = await request(app).get('/notes/1/backup?file=../package.json');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid file path');
    });

    it('rejects ../../ deep traversal', async () => {
      await seed([{ title: 'test' }]);
      const res = await request(app).get('/notes/1/backup?file=../../etc/passwd');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid file path');
    });
  });

  describe('I — Isolated: Endpoint-level isolation', () => {
    it('returns 400 for path traversal and no file content', async () => {
      const res = await request(app).get('/notes/1/backup?file=../src/app.js');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid file path' });
      expect(res.text).not.toContain('createApp');
    });

    it('returns 400 for absolute path attempts', async () => {
      const res = await request(app).get('/notes/1/backup?file=/etc/passwd');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid file path');
    });

    it('returns 404 if file path is valid but file does not exist', async () => {
      const res = await request(app).get('/notes/1/backup?file=nonexistent-file.txt');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('backup not found');
    });
  });

  describe('R — Repeatable: Consistent rejection of traversal attempts', () => {
    it('repeated traversal attempts are consistently rejected', async () => {
      const res1 = await request(app).get('/notes/1/backup?file=../package.json');
      const res2 = await request(app).get('/notes/1/backup?file=../package.json');
      expect(res1.status).toBe(400);
      expect(res2.status).toBe(400);
      expect(res1.body).toEqual(res2.body);
    });
  });

  describe('S — Self-checking: Path validation logic assertions', () => {
    it('does not expose directory escape error details', async () => {
      const res = await request(app).get('/notes/1/backup?file=../../../../etc/passwd');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid file path');
      expect(res.text).not.toContain('/etc/passwd');
      expect(res.text).not.toContain('ENOENT');
    });

    it('rejects path traversal encoded variants', async () => {
      const res = await request(app).get('/notes/1/backup?file=..%2Fpackage.json');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid file path');
    });
  });

  describe('T — Thorough: Comprehensive path traversal variants', () => {
    it('rejects single ../', async () => {
      const res = await request(app).get('/notes/1/backup?file=../test.txt');
      expect(res.status).toBe(400);
    });

    it('rejects multiple ../../../ levels', async () => {
      const res = await request(app).get('/notes/1/backup?file=../../../../../../../etc/passwd');
      expect(res.status).toBe(400);
    });

    it('rejects mixed path separators (dot-slash)', async () => {
      const res = await request(app).get('/notes/1/backup?file=./../../package.json');
      expect(res.status).toBe(400);
    });

    it('rejects absolute path /data/...', async () => {
      const res = await request(app).get('/notes/1/backup?file=/data/backup.txt');
      expect(res.status).toBe(400);
    });

    it('accepts filename with dots (not path traversal)', async () => {
      const res = await request(app).get('/notes/1/backup?file=backup.v1.0.txt');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('backup not found');
    });

    it('accepts nested valid path within data dir', async () => {
      const res = await request(app).get('/notes/1/backup?file=subdir/nested/file.txt');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('backup not found');
    });

    it('rejects empty file parameter', async () => {
      const res = await request(app).get('/notes/1/backup?file=');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('handles null/undefined file gracefully (returns error)', async () => {
      const res = await request(app).get('/notes/1/backup');
      expect([400, 404]).toContain(res.status);
    });

    it('rejects backslash path attempts', async () => {
      const res = await request(app).get('/notes/1/backup?file=..\\package.json');
      expect(res.status).toBe(404);
    });
  });

  describe('Integration: Path traversal + legitimate backup access', () => {
    it('legitimate file is accessible, traversal is blocked', async () => {
      await seed([{ title: 'note' }]);
      const legitRes = await request(app).get('/notes/1/backup?file=note-1-backup.txt');
      const traversalRes = await request(app).get('/notes/1/backup?file=../package.json');
      expect(legitRes.status).toBe(200);
      expect(traversalRes.status).toBe(400);
    });
  });
});
