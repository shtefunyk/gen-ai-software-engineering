import { describe, it, expect } from 'vitest';
import { createTicketSchema, updateTicketSchema, importRowSchema } from '../src/validators/ticket.js';

const valid = {
  customer_id: 'C-1',
  customer_email: 'a@b.co',
  customer_name: 'Ada',
  subject: 'login broken',
  description: 'cannot sign in for two days',
  metadata: { source: 'web_form' },
};

describe('createTicketSchema', () => {
  it('1. accepts a minimal valid payload', () => {
    expect(() => createTicketSchema.parse(valid)).not.toThrow();
  });

  it('2. rejects invalid email', () => {
    expect(() => createTicketSchema.parse({ ...valid, customer_email: 'nope' })).toThrow();
  });

  it('3. rejects subject longer than 200 chars', () => {
    expect(() => createTicketSchema.parse({ ...valid, subject: 'x'.repeat(201) })).toThrow();
  });

  it('4. rejects description shorter than 10 chars', () => {
    expect(() => createTicketSchema.parse({ ...valid, description: 'short' })).toThrow();
  });

  it('5. rejects unknown metadata.source', () => {
    expect(() =>
      createTicketSchema.parse({ ...valid, metadata: { source: 'pigeon' } })
    ).toThrow();
  });

  it('6. accepts optional tags array', () => {
    const parsed = createTicketSchema.parse({ ...valid, tags: ['urgent', 'vip'] });
    expect(parsed.tags).toEqual(['urgent', 'vip']);
  });

  it('7. rejects when subject missing', () => {
    const { subject: _drop, ...rest } = valid;
    expect(() => createTicketSchema.parse(rest)).toThrow();
  });
});

describe('updateTicketSchema', () => {
  it('8. accepts partial update with only category', () => {
    expect(() => updateTicketSchema.parse({ category: 'billing_question' })).not.toThrow();
  });
});

describe('importRowSchema', () => {
  it('9. parses an import row with priority and category present', () => {
    const row = { ...valid, category: 'bug_report', priority: 'high' };
    const parsed = importRowSchema.parse(row);
    expect(parsed.category).toBe('bug_report');
    expect(parsed.priority).toBe('high');
  });
});
