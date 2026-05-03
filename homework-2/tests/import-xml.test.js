import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseXml } from '../src/parsers/xml.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => readFileSync(resolve(here, 'fixtures', name), 'utf8');

describe('parseXml', () => {
  it('1. parses valid <tickets><ticket/></tickets> structure', () => {
    const rows = parseXml(fx('tickets-valid.xml'));
    expect(rows).toHaveLength(2);
    expect(rows[0].customer_email).toBe('a@b.co');
    expect(rows[0].metadata.source).toBe('web_form');
  });

  it('2. throws on malformed XML', () => {
    expect(() => parseXml('<tickets><ticket></tickets>')).toThrow();
  });

  it('3. throws when root element is not <tickets>', () => {
    const xml = '<?xml version="1.0"?><items><item/></items>';
    expect(() => parseXml(xml)).toThrow(/root/);
  });

  it('4. handles XML with default namespace by ignoring it', () => {
    const xml =
      '<?xml version="1.0"?><tickets xmlns="http://example.com"><ticket><customer_id>C-9</customer_id><customer_email>x@y.z</customer_email><customer_name>N</customer_name><subject>s</subject><description>desc desc desc</description><metadata><source>api</source></metadata></ticket></tickets>';
    const rows = parseXml(xml);
    expect(rows[0].customer_id).toBe('C-9');
  });

  it('5. returns empty array for <tickets/>', () => {
    expect(parseXml(fx('tickets-empty.xml'))).toEqual([]);
  });
});
