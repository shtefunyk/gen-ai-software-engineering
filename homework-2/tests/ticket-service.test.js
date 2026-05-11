import { describe, it, expect, beforeEach } from 'vitest';
import { ticketService } from '../src/services/ticketService.js';
import { ticketStore } from '../src/store/tickets.js';

const valid = {
  customer_id: 'C-1',
  customer_email: 'a@b.co',
  customer_name: 'Ada',
  subject: 'login broken',
  description: 'cannot sign in for two days',
  metadata: { source: 'web_form' },
};

beforeEach(() => ticketStore.reset());

describe('ticketService', () => {
  it('create() assigns UUID, status=new, timestamps, defaults', () => {
    const t = ticketService.create(valid);
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.status).toBe('new');
    expect(t.priority).toBe('medium');
    expect(t.category).toBe('other');
    expect(t.tags).toEqual([]);
    expect(t.assigned_to).toBeNull();
    expect(t.resolved_at).toBeNull();
    expect(typeof t.created_at).toBe('string');
    expect(t.updated_at).toBe(t.created_at);
  });

  it('update() patches fields and refreshes updated_at', async () => {
    const t = ticketService.create(valid);
    await new Promise((r) => setTimeout(r, 5));
    const u = ticketService.update(t.id, { subject: 'changed' });
    expect(u.subject).toBe('changed');
    expect(u.updated_at).not.toBe(t.created_at);
  });

  it('update() sets resolved_at when status moves to resolved', () => {
    const t = ticketService.create(valid);
    const u = ticketService.update(t.id, { status: 'resolved' });
    expect(u.resolved_at).not.toBeNull();
  });

  it('update() returns null for missing id', () => {
    expect(ticketService.update('nope', { subject: 'x' })).toBeNull();
  });

  it('list() filters by category, priority, status, assigned_to, tag, from, to', () => {
    const a = ticketService.create({ ...valid, subject: 'a', description: 'desc desc desc' });
    ticketService.update(a.id, { category: 'billing_question', priority: 'high', tags: ['vip'] });
    const b = ticketService.create({ ...valid, subject: 'b', description: 'desc desc desc' });
    ticketService.update(b.id, { category: 'bug_report', priority: 'low' });

    expect(ticketService.list({ category: 'billing_question' })).toHaveLength(1);
    expect(ticketService.list({ priority: 'high' })).toHaveLength(1);
    expect(ticketService.list({ tag: 'vip' })).toHaveLength(1);
    expect(ticketService.list({ status: 'new' })).toHaveLength(2);
    expect(ticketService.list({ from: '1970-01-01', to: '2999-12-31' })).toHaveLength(2);
    expect(ticketService.list({ from: '2999-01-01' })).toHaveLength(0);
  });

  it('remove() returns boolean', () => {
    const t = ticketService.create(valid);
    expect(ticketService.remove(t.id)).toBe(true);
    expect(ticketService.remove(t.id)).toBe(false);
  });
});
