import { describe, it, expect, beforeEach } from 'vitest';
import { importService } from '../src/services/importService.js';
import { ticketStore } from '../src/store/tickets.js';

beforeEach(() => ticketStore.reset());

const validJson = JSON.stringify([
  {
    customer_id: 'C-1',
    customer_email: 'a@b.co',
    customer_name: 'Ada',
    subject: 'login broken',
    description: 'cannot sign in for two days',
    metadata: { source: 'web_form' },
  },
  {
    customer_id: 'C-2',
    customer_email: 'not-an-email',
    customer_name: 'Bob',
    subject: 'billing',
    description: 'charged twice this month',
    metadata: { source: 'email' },
  },
]);

describe('importService', () => {
  it('returns summary with successful and failed counts', async () => {
    const result = await importService.importBulk({ format: 'json', body: validJson });
    expect(result.total).toBe(2);
    expect(result.successful).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].row).toBe(1);
    expect(result.failed[0].error).toMatch(/email/i);
  });

  it('throws on unknown format', async () => {
    await expect(importService.importBulk({ format: 'yaml', body: '' })).rejects.toThrow(/format/);
  });

  it('throws on completely malformed body', async () => {
    await expect(importService.importBulk({ format: 'json', body: '{not json' })).rejects.toThrow(
      /JSON parse failed/
    );
  });
});
