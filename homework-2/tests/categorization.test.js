import { describe, it, expect, beforeEach, vi } from 'vitest';

const generateContent = vi.fn();
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
  generateContent.mockReset();
});

const base = {
  customer_id: 'C-1',
  customer_email: 'a@b.co',
  customer_name: 'Ada',
  subject: 'login broken',
  description: 'cannot sign in for two days',
  metadata: { source: 'web_form' },
};

const llmReply = (overrides = {}) =>
  generateContent.mockResolvedValue({
    text: JSON.stringify({
      category: 'account_access',
      priority: 'urgent',
      confidence: 0.9,
      reasoning: 'mock',
      keywords: ['mock'],
      ...overrides,
    }),
  });

const CATS = ['account_access', 'technical_issue', 'billing_question', 'feature_request', 'bug_report', 'other'];
const PRIOS = ['urgent', 'high', 'medium', 'low'];

describe('categorization', () => {
  it.each(CATS)('1-6. classifies into %s when LLM returns it', async (category) => {
    llmReply({ category });
    const app = createApp();
    const created = await request(app).post('/tickets').send(base);
    const res = await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    expect(res.status).toBe(200);
    expect(res.body.category).toBe(category);
  });

  it.each(PRIOS)('7-10a. assigns priority %s when LLM returns it', async (priority) => {
    llmReply({ priority });
    const app = createApp();
    const created = await request(app).post('/tickets').send(base);
    const res = await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    expect(res.body.priority).toBe(priority);
  });

  it('7. returns 422 when LLM returns invalid JSON', async () => {
    generateContent.mockResolvedValue({ text: 'not json' });
    const app = createApp();
    const created = await request(app).post('/tickets').send(base);
    const res = await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    expect(res.status).toBe(422);
  });

  it('8. returns 502 on Gemini SDK error', async () => {
    generateContent.mockImplementation(async () => { throw new Error('rate limit'); });
    const app = createApp();
    const created = await request(app).post('/tickets').send(base);
    const res = await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    expect(res.status).toBe(502);
  });

  it('9. POST /tickets?auto_classify=true on LLM failure still creates ticket with classification_error', async () => {
    generateContent.mockImplementation(async () => { throw new Error('timeout'); });
    const res = await request(createApp())
      .post('/tickets?auto_classify=true')
      .send(base);
    expect(res.status).toBe(201);
    expect(res.body.classification_error).toMatch(/Classification provider failed/);
  });

  it('10. manual override via PUT replaces classified category', async () => {
    llmReply({ category: 'account_access' });
    const app = createApp();
    const created = await request(app).post('/tickets').send(base);
    await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    const after = await request(app)
      .put(`/tickets/${created.body.id}`)
      .send({ category: 'feature_request' });
    expect(after.body.category).toBe('feature_request');
  });
});
