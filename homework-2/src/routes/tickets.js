import { Router } from 'express';
import { ticketService } from '../services/ticketService.js';
import { importService } from '../services/importService.js';
import { classificationService } from '../services/classificationService.js';
import { createTicketSchema, updateTicketSchema } from '../validators/ticket.js';
import { HttpError } from '../errors.js';

export const ticketsRouter = Router();

const ALLOWED_FORMATS = new Set(['csv', 'json', 'xml']);

ticketsRouter.post('/tickets', async (req, res) => {
  const parsed = createTicketSchema.parse(req.body);
  const created = ticketService.create(parsed);
  if (req.query.auto_classify === 'true') {
    try {
      const classification = await classificationService.classify(created);
      ticketService.update(created.id, {
        category: classification.category,
        priority: classification.priority,
      });
      const final = ticketService.get(created.id);
      final.classification = classification;
      return res.status(201).json(final);
    } catch (err) {
      const final = ticketService.get(created.id);
      final.classification_error = err.message;
      return res.status(201).json(final);
    }
  }
  res.status(201).json(created);
});

ticketsRouter.get('/tickets', (req, res) => {
  res.status(200).json(ticketService.list(req.query));
});

ticketsRouter.get('/tickets/:id', (req, res) => {
  const t = ticketService.get(req.params.id);
  if (!t) throw new HttpError(404, 'Ticket not found');
  res.status(200).json(t);
});

ticketsRouter.put('/tickets/:id', (req, res) => {
  const patch = updateTicketSchema.parse(req.body);
  const updated = ticketService.update(req.params.id, patch);
  if (!updated) throw new HttpError(404, 'Ticket not found');
  res.status(200).json(updated);
});

ticketsRouter.delete('/tickets/:id', (req, res) => {
  if (!ticketService.remove(req.params.id)) throw new HttpError(404, 'Ticket not found');
  res.status(204).end();
});

ticketsRouter.post('/tickets/import', async (req, res) => {
  const format = String(req.query.format || '').toLowerCase();
  if (!ALLOWED_FORMATS.has(format)) {
    throw new HttpError(415, 'Unsupported format', [
      { field: 'format', message: 'must be csv|json|xml' },
    ]);
  }
  if (typeof req.rawBody !== 'string' || req.rawBody.length === 0) {
    throw new HttpError(400, 'Empty or unreadable body');
  }
  const autoClassify = req.query.auto_classify === 'true';
  const result = await importService.importBulk({
    format,
    body: req.rawBody,
    onCreated: autoClassify
      ? async (ticket) => {
          try {
            const c = await classificationService.classify(ticket);
            ticketService.update(ticket.id, { category: c.category, priority: c.priority });
          } catch (err) {
            ticketService.update(ticket.id, {});
            const t = ticketService.get(ticket.id);
            t.classification_error = err.message;
          }
        }
      : undefined,
  });
  res.status(201).json(result);
});

ticketsRouter.post('/tickets/:id/auto-classify', async (req, res) => {
  const ticket = ticketService.get(req.params.id);
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  const classification = await classificationService.classify(ticket);
  ticketService.update(ticket.id, {
    category: classification.category,
    priority: classification.priority,
  });
  const final = ticketService.get(ticket.id);
  final.classification = classification;
  res.status(200).json(classification);
});
