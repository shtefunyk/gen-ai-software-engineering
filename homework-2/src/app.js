import express from 'express';
import { ticketsRouter } from './routes/tickets.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rawBodyParser } from './middleware/rawBodyParser.js';

export function createApp() {
  const app = express();

  // raw body for /tickets/import (CSV/XML); also keeps JSON raw for parser tests
  app.use('/tickets/import', rawBodyParser);

  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use(ticketsRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));
  app.use(errorHandler);

  return app;
}
