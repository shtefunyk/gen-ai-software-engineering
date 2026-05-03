import { ZodError } from 'zod';
import { HttpError } from '../errors.js';

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.') || '_root', message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }
  return res.status(500).json({ error: 'Internal server error' });
}
