import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function () {
    this.models = {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          category: 'billing_question',
          priority: 'high',
          confidence: 0.85,
          reasoning: 'mock',
          keywords: ['billing'],
        }),
      }),
    };
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

const base = {
  customer_id: 'C-1',
  customer_email: 'a@b.co',
  customer_name: 'Ada',
  subject: 'billing question',
  description: 'I was charged twice this month',
  metadata: { source: 'web_form' },
};

describe('integration', () => {
  it('1. full lifecycle: create → classify → update → resolve → close', async () => {
    const app = createApp();
    const created = await request(app).post('/tickets').send(base);
    const id = created.body.id;
    await request(app).post(`/tickets/${id}/auto-classify`);
    await request(app).put(`/tickets/${id}`).send({ assigned_to: 'agent-7' });
    const resolved = await request(app).put(`/tickets/${id}`).send({ status: 'resolved' });
    expect(resolved.body.resolved_at).not.toBeNull();
    const closed = await request(app).put(`/tickets/${id}`).send({ status: 'closed' });
    expect(closed.body.status).toBe('closed');
  });

  it('2. bulk import + auto_classify applies LLM to every row', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/tickets/import?format=csv&auto_classify=true')
      .set('Content-Type', 'text/csv')
      .send(fx('tickets-valid.csv'));
    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(2);
    const list = await request(app).get('/tickets?category=billing_question');
    expect(list.body).toHaveLength(2);
  });

  it('3. combined filter category=billing_question&priority=high', async () => {
    const app = createApp();
    await request(app)
      .post('/tickets/import?format=csv&auto_classify=true')
      .set('Content-Type', 'text/csv')
      .send(fx('tickets-valid.csv'));
    const res = await request(app).get('/tickets?category=billing_question&priority=high');
    expect(res.body).toHaveLength(2);
  });

  it('4. 25 concurrent POSTs all create distinct tickets', async () => {
    const app = createApp();
    const reqs = Array.from({ length: 25 }, (_v, i) =>
      request(app).post('/tickets').send({ ...base, customer_id: `C-${i}` })
    );
    const results = await Promise.all(reqs);
    const ids = new Set(results.map((r) => r.body.id));
    expect(ids.size).toBe(25);
  });

  it('5. GET /tickets is idempotent', async () => {
    const app = createApp();
    await request(app).post('/tickets').send(base);
    const r1 = await request(app).get('/tickets');
    const r2 = await request(app).get('/tickets');
    expect(r1.body).toEqual(r2.body);
  });
});
