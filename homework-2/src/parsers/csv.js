import { parse } from 'csv-parse/sync';

const REQUIRED = ['customer_id', 'customer_email', 'customer_name', 'subject', 'description', 'metadata.source'];

function nest(flatRow) {
  const out = {};
  for (const [key, value] of Object.entries(flatRow)) {
    if (key.includes('.')) {
      const [head, tail] = key.split('.');
      out[head] = out[head] || {};
      out[head][tail] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function parseCsv(text) {
  let records;
  try {
    records = parse(text, { columns: true, bom: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new Error(`CSV parse failed: ${err.message}`);
  }

  if (records.length === 0) return [];

  for (const required of REQUIRED) {
    if (!(required in records[0])) {
      throw new Error(`CSV missing required column: ${required}`);
    }
  }

  return records.map(nest);
}
