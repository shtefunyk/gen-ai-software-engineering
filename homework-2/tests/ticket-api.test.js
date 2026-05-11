import { describe, it, expect, beforeEach, vi } from 'vitest';

const generateContent = vi.fn().mockResolvedValue({
  text: JSON.stringify({
    category: 'account_access',
    priority: 'urgent',
    confidence: 0.9,
    reasoning: 'mock',
    keywords: ['mock'],
  }),
});
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function () {
    this.models = { generateContent };
  }),
}));

const { createApp } = await import('../src/app.js');
const { ticketStore } = await import('../src/store/tickets.js');
import request from 'supertest';

beforeEach(() => {
  ticketStore.reset();
  generateContent.mockClear();
});

const valid = {
  customer_id: 'C-1',
  customer_email: 'a@b.co',
  customer_name: 'Ada',
  subject: 'login broken',
  description: 'cannot sign in for two days',
  metadata: { source: 'web_form' },
};

describe('ticket-api', () => {
  it('1. POST /tickets creates and returns 201 with full ticket', async () => {
    const res = await request(createApp()).post('/tickets').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.status).toBe('new');
  });

  it('2. POST /tickets with bad email returns 400 with details', async () => {
    const res = await request(createApp())
      .post('/tickets')
      .send({ ...valid, customer_email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details[0].field).toBe('customer_email');
  });

  it('3. GET /tickets/:id returns the ticket', async () => {
    const app = createApp();
    const created = await request(app).post('/tickets').send(valid);
    const res = await request(app).get(`/tickets/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('4. GET /tickets/:id returns 404 for unknown id', async () => {
    const res = await request(createApp()).get('/tickets/missing');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Ticket not found');
  });

  it('5. GET /tickets returns array', async () => {
    const app = createApp();
    await request(app).post('/tickets').send(valid);
    await request(app).post('/tickets').send({ ...valid, customer_id: 'C-2' });
    const res = await request(app).get('/tickets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('6. GET /tickets supports combined filter (priority + category)', async () => {
    const app = createApp();
    const a = await request(app).post('/tickets').send(valid);
    await request(app).put(`/tickets/${a.body.id}`).send({ priority: 'high', category: 'billing_question' });
    const b = await request(app).post('/tickets').send({ ...valid, customer_id: 'C-2' });
    await request(app).put(`/tickets/${b.body.id}`).send({ priority: 'low', category: 'bug_report' });
    const res = await request(app).get('/tickets?priority=high&category=billing_question');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(a.body.id);
  });

  it('7. PUT /tickets/:id partial update returns 200 and merges metadata', async () => {
    const app = createApp();
    const created = await request(app).post('/tickets').send(valid);
    const res = await request(app)
      .put(`/tickets/${created.body.id}`)
      .send({ subject: 'changed', metadata: { browser: 'Firefox' } });
    expect(res.status).toBe(200);
    expect(res.body.subject).toBe('changed');
    expect(res.body.metadata.browser).toBe('Firefox');
    expect(res.body.metadata.source).toBe('web_form');
  });

  it('8. PUT /tickets/:id returns 404 for unknown', async () => {
    const res = await request(createApp())
      .put('/tickets/missing')
      .send({ subject: 'x' });
    expect(res.status).toBe(404);
  });

  it('9. DELETE /tickets/:id returns 204 then 404 on retry', async () => {
    const app = createApp();
    const created = await request(app).post('/tickets').send(valid);
    const r1 = await request(app).delete(`/tickets/${created.body.id}`);
    expect(r1.status).toBe(204);
    const r2 = await request(app).delete(`/tickets/${created.body.id}`);
    expect(r2.status).toBe(404);
  });

  it('10. GET /tickets supports from/to filtering on created_at', async () => {
    const app = createApp();
    await request(app).post('/tickets').send(valid);
    const future = '2999-01-01';
    const res = await request(app).get(`/tickets?from=${future}`);
    expect(res.body).toHaveLength(0);
  });

  it('11. POST /tickets/import without ?format= returns 415', async () => {
    const res = await request(createApp())
      .post('/tickets/import')
      .set('Content-Type', 'application/json')
      .send('[]');
    expect(res.status).toBe(415);
    expect(res.body.error).toBe('Unsupported format');
  });
});
