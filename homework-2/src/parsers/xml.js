import { XMLParser, XMLValidator } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

export function parseXml(text) {
  const validation = XMLValidator.validate(text);
  if (validation !== true) {
    throw new Error(`XML parse failed: ${validation.err?.msg ?? 'invalid XML'}`);
  }
  const obj = parser.parse(text);
  if (!('tickets' in obj)) {
    throw new Error('XML root must be <tickets>');
  }
  const inner = obj.tickets;
  if (inner == null || inner === '') return [];
  const list = Array.isArray(inner.ticket) ? inner.ticket : inner.ticket ? [inner.ticket] : [];
  return list;
}
