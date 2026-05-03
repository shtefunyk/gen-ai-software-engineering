import { describe, it, expect } from 'vitest';
import { parseJson } from '../src/parsers/json.js';

const valid = {
  customer_id: 'C-1',
  customer_email: 'a@b.co',
  customer_name: 'Ada',
  subject: 'login broken',
  description: 'cannot sign in for two days',
  metadata: { source: 'web_form' },
};

describe('parseJson', () => {
  it('1. parses valid array of tickets', () => {
    const rows = parseJson(JSON.stringify([valid, valid]));
    expect(rows).toHaveLength(2);
    expect(rows[0].customer_email).toBe('a@b.co');
  });

  it('2. throws when root is a single object', () => {
    expect(() => parseJson(JSON.stringify(valid))).toThrow(/array/);
  });

  it('3. throws on malformed JSON', () => {
    expect(() => parseJson('{not json')).toThrow(/JSON parse failed/);
  });

  it('4. returns empty array for "[]"', () => {
    expect(parseJson('[]')).toEqual([]);
  });

  it('5. preserves an element even if it would later fail validation', () => {
    const broken = { ...valid, customer_email: 'nope' };
    const rows = parseJson(JSON.stringify([broken]));
    expect(rows[0].customer_email).toBe('nope');
  });
});
