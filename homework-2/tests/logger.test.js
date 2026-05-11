import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from '../src/utils/logger.js';

afterEach(() => vi.restoreAllMocks());

describe('logger', () => {
  it('info() writes JSON line to console.log with prefix', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('[classify]', { ticket_id: 'abc' });
    expect(spy).toHaveBeenCalledOnce();
    const arg = spy.mock.calls[0][0];
    expect(arg).toContain('[classify]');
    expect(arg).toContain('"ticket_id":"abc"');
  });

  it('error() writes to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('[boom]', { msg: 'x' });
    expect(spy).toHaveBeenCalledOnce();
  });
});
