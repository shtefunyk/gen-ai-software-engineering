import { describe, it, expect, beforeEach } from 'vitest';
import { ticketStore } from '../src/store/tickets.js';
import { classificationService } from '../src/services/classificationService.js';

const RUN_LIVE = process.env.RUN_LIVE === '1';

beforeEach(() => ticketStore.reset());

describe.skipIf(!RUN_LIVE)('live Gemini classification', () => {
  it('returns a structured result for a real ticket', async () => {
    const ticket = {
      id: 'live-test',
      subject: 'Cannot login to my account',
      description: "I can't access my account since yesterday — production down for our team.",
      metadata: { source: 'web_form' },
    };
    const result = await classificationService.classify(ticket);
    expect(['account_access', 'technical_issue', 'other']).toContain(result.category);
    expect(['urgent', 'high', 'medium', 'low']).toContain(result.priority);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.model).toBe('gemini-2.0-flash');
  }, 30_000);
});
