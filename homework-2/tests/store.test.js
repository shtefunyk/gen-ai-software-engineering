import { describe, it, expect, beforeEach } from 'vitest';
import { ticketStore } from '../src/store/tickets.js';

beforeEach(() => ticketStore.reset());

describe('ticketStore', () => {
  it('save() returns the saved ticket and get() retrieves it', () => {
    ticketStore.save({ id: 'a', subject: 's' });
    expect(ticketStore.get('a')).toEqual({ id: 'a', subject: 's' });
  });

  it('get() returns undefined for missing id', () => {
    expect(ticketStore.get('missing')).toBeUndefined();
  });

  it('list() returns all', () => {
    ticketStore.save({ id: 'a' });
    ticketStore.save({ id: 'b' });
    expect(ticketStore.list()).toHaveLength(2);
  });

  it('delete() removes', () => {
    ticketStore.save({ id: 'a' });
    expect(ticketStore.delete('a')).toBe(true);
    expect(ticketStore.get('a')).toBeUndefined();
    expect(ticketStore.delete('a')).toBe(false);
  });
});
