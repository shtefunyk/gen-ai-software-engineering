import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseCsv } from '../src/parsers/csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => readFileSync(resolve(here, 'fixtures', name), 'utf8');

describe('parseCsv', () => {
  it('1. parses valid two-row CSV with nested metadata.source', () => {
    const rows = parseCsv(fx('tickets-valid.csv'));
    expect(rows).toHaveLength(2);
    expect(rows[0].customer_email).toBe('a@b.co');
    expect(rows[0].metadata.source).toBe('web_form');
  });

  it('2. throws meaningful error on missing required column', () => {
    const csv = 'customer_email,customer_name\na@b.co,Ada\n';
    expect(() => parseCsv(csv)).toThrow(/customer_id/);
  });

  it('3. throws on malformed quote', () => {
    expect(() => parseCsv(fx('tickets-malformed.csv'))).toThrow();
  });

  it('4. strips BOM from first column header', () => {
    const rows = parseCsv(fx('tickets-bom.csv'));
    expect(rows[0].customer_id).toBe('C-3');
  });

  it('5. returns empty array for headers-only file', () => {
    const rows = parseCsv('customer_id,customer_email,customer_name,subject,description,metadata.source\n');
    expect(rows).toEqual([]);
  });

  it('6. parses mixed file (downstream service decides validity)', () => {
    const rows = parseCsv(fx('tickets-mixed.csv'));
    expect(rows).toHaveLength(2);
    expect(rows[1].customer_email).toBe('not-an-email');
  });
});
