import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ZodError } from 'zod';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { HttpError } from '../src/errors.js';
import { createTicketSchema } from '../src/validators/ticket.js';

function appWith(thrower) {
  const app = express();
  app.use(express.json());
  app.get('/boom', (_req, _res, _next) => thrower());
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('Zod errors → 400 with details', async () => {
    const res = await request(
      appWith(() => createTicketSchema.parse({}))
    ).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('HttpError → custom status', async () => {
    const res = await request(
      appWith(() => {
        throw new HttpError(404, 'Ticket not found');
      })
    ).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ticket not found' });
  });

  it('Unknown error → 500', async () => {
    const res = await request(
      appWith(() => {
        throw new Error('boom');
      })
    ).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});
