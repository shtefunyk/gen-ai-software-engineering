import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function () {
    this.models = {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          category: 'other',
          priority: 'medium',
          confidence: 0.5,
          reasoning: 'm',
          keywords: [],
        }),
      }),
    };
  }),
}));
const { createApp } = await import('../src/app.js');
const { ticketStore } = await import('../src/store/tickets.js');
const { ticketService } = await import('../src/services/ticketService.js');
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
  subject: 'login broken',
  description: 'cannot sign in for two days',
  metadata: { source: 'web_form' },
};

describe('performance', () => {
  it('1. 20 concurrent POST /tickets complete under 1000ms', async () => {
    const app = createApp();
    const start = performance.now();
    await Promise.all(
      Array.from({ length: 20 }, (_v, i) =>
        request(app).post('/tickets').send({ ...base, customer_id: `C-${i}` })
      )
    );
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('2. CSV import of fixture under 500ms', async () => {
    const app = createApp();
    const start = performance.now();
    await request(app)
      .post('/tickets/import?format=csv')
      .set('Content-Type', 'text/csv')
      .send(fx('tickets-valid.csv'));
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('3. GET /tickets filtered over 1000 stored tickets under 100ms', async () => {
    for (let i = 0; i < 1000; i++) {
      ticketService.create({ ...base, customer_id: `C-${i}` });
    }
    const app = createApp();
    const start = performance.now();
    await request(app).get('/tickets?category=other');
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('4. mocked auto-classify p95 under 50ms over 20 calls', async () => {
    const app = createApp();
    const created = await request(app).post('/tickets').send(base);
    const samples = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      await request(app).post(`/tickets/${created.body.id}/auto-classify`);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(0.95 * samples.length)];
    expect(p95).toBeLessThan(50);
  });

  it('5. heap delta after 1000 create+delete cycles is sane (<30MB)', async () => {
    if (typeof global.gc === 'function') global.gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1000; i++) {
      const t = ticketService.create({ ...base, customer_id: `C-${i}` });
      ticketService.remove(t.id);
    }
    if (typeof global.gc === 'function') global.gc();
    const after = process.memoryUsage().heapUsed;
    const deltaMB = (after - before) / 1024 / 1024;
    expect(deltaMB).toBeLessThan(30);
  });
});
