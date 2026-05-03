import { parseCsv } from '../parsers/csv.js';
import { parseJson } from '../parsers/json.js';
import { parseXml } from '../parsers/xml.js';
import { ticketService } from './ticketService.js';
import { importRowSchema } from '../validators/ticket.js';

const PARSERS = { csv: parseCsv, json: parseJson, xml: parseXml };

export const importService = {
  async importBulk({ format, body, onCreated }) {
    const parser = PARSERS[format];
    if (!parser) throw new Error(`Unsupported format: ${format}`);

    const rows = parser(body);
    const failed = [];
    let successful = 0;

    for (let i = 0; i < rows.length; i++) {
      const parsed = importRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        failed.push({ row: i, error: parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
        continue;
      }
      const created = ticketService.create(parsed.data);
      if (onCreated) {
        try {
          await onCreated(created);
        } catch (err) {
          failed.push({ row: i, error: `post-create: ${err.message}` });
        }
      }
      successful++;
    }

    return { total: rows.length, successful, failed };
  },
};
