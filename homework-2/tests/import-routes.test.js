import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function () {
    this.models = { generateContent: vi.fn() };
  }),
}));
const { createApp } = await import('../src/app.js');
const { ticketStore } = await import('../src/store/tickets.js');
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => readFileSync(resolve(here, 'fixtures', name), 'utf8');

beforeEach(() => ticketStore.reset());

describe('POST /tickets/import', () => {
  it('CSV import returns summary with successful=2', async () => {
    const res = await request(createApp())
      .post('/tickets/import?format=csv')
      .set('Content-Type', 'text/csv')
      .send(fx('tickets-valid.csv'));
    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(2);
  });

  it('JSON import returns summary with successful + failed', async () => {
    const body = JSON.stringify([
      {
        customer_id: 'C-1',
        customer_email: 'a@b.co',
        customer_name: 'Ada',
        subject: 's',
        description: 'desc desc desc',
        metadata: { source: 'web_form' },
      },
      {
        customer_id: 'C-2',
        customer_email: 'bad',
        customer_name: 'B',
        subject: 's',
        description: 'desc desc desc',
        metadata: { source: 'web_form' },
      },
    ]);
    const res = await request(createApp())
      .post('/tickets/import?format=json')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(1);
    expect(res.body.failed).toHaveLength(1);
  });

  it('XML import returns successful=2', async () => {
    const res = await request(createApp())
      .post('/tickets/import?format=xml')
      .set('Content-Type', 'application/xml')
      .send(fx('tickets-valid.xml'));
    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(2);
  });

  it('CSV import with malformed file returns 400', async () => {
    const res = await request(createApp())
      .post('/tickets/import?format=csv')
      .set('Content-Type', 'text/csv')
      .send(fx('tickets-malformed.csv'));
    expect(res.status).toBe(400);
  });
});
