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
    const res = await request(app).get('/notes/1/backup?file=../../package.json');
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('homework-4-notes-api');
  });
});
