import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rawBodyParser } from '../src/middleware/rawBodyParser.js';

function app() {
  const a = express();
  a.use(rawBodyParser);
  a.post('/echo', (req, res) => res.json({ body: req.rawBody, type: typeof req.rawBody }));
  return a;
}

describe('rawBodyParser', () => {
  it('captures text/csv body as string', async () => {
    const res = await request(app())
      .post('/echo')
      .set('Content-Type', 'text/csv')
      .send('a,b\n1,2');
    expect(res.body.type).toBe('string');
    expect(res.body.body).toContain('a,b');
  });

  it('captures application/xml body', async () => {
    const res = await request(app())
      .post('/echo')
      .set('Content-Type', 'application/xml')
      .send('<x/>');
    expect(res.body.body).toBe('<x/>');
  });

  it('captures application/json body as raw text', async () => {
    const res = await request(app())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('[{"a":1}]');
    expect(res.body.body).toBe('[{"a":1}]');
  });
});
