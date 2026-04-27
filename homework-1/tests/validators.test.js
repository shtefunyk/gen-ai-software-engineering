const { validateTransaction } = require('../src/validators/transaction');

const validTransfer = {
  fromAccount: 'ACC-12345',
  toAccount: 'ACC-67890',
  amount: 100.5,
  currency: 'USD',
  type: 'transfer',
};

describe('validateTransaction', () => {
  it('returns empty array for valid transfer', () => {
    expect(validateTransaction(validTransfer)).toEqual([]);
  });

  it('returns error for missing amount', () => {
    const errors = validateTransaction({ ...validTransfer, amount: undefined });
    expect(errors).toContainEqual({ field: 'amount', message: expect.any(String) });
  });

  it('returns error for negative amount', () => {
    const errors = validateTransaction({ ...validTransfer, amount: -10 });
    expect(errors).toContainEqual({ field: 'amount', message: expect.any(String) });
  });

  it('returns error for amount with more than 2 decimal places', () => {
    const errors = validateTransaction({ ...validTransfer, amount: 1.123 });
    expect(errors).toContainEqual({ field: 'amount', message: expect.any(String) });
  });

  it('returns error for invalid currency', () => {
    const errors = validateTransaction({ ...validTransfer, currency: 'XXX' });
    expect(errors).toContainEqual({ field: 'currency', message: expect.any(String) });
  });

  it('returns error for invalid type', () => {
    const errors = validateTransaction({ ...validTransfer, type: 'loan' });
    expect(errors).toContainEqual({ field: 'type', message: expect.any(String) });
  });

  it('returns error for invalid account format', () => {
    const errors = validateTransaction({ ...validTransfer, fromAccount: 'INVALID' });
    expect(errors).toContainEqual({ field: 'fromAccount', message: expect.any(String) });
  });

  it('returns error when transfer is missing fromAccount', () => {
    const errors = validateTransaction({ ...validTransfer, fromAccount: undefined });
    expect(errors).toContainEqual({ field: 'fromAccount', message: expect.any(String) });
  });

  it('returns error when deposit is missing toAccount', () => {
    const errors = validateTransaction({ toAccount: undefined, amount: 50, currency: 'USD', type: 'deposit' });
    expect(errors).toContainEqual({ field: 'toAccount', message: expect.any(String) });
  });

  it('returns multiple errors simultaneously', () => {
    const errors = validateTransaction({ amount: -5, currency: 'XXX', type: 'transfer' });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('allows deposit without fromAccount', () => {
    expect(validateTransaction({ toAccount: 'ACC-12345', amount: 50, currency: 'USD', type: 'deposit' })).toEqual([]);
  });

  it('allows withdrawal without toAccount', () => {
    expect(validateTransaction({ fromAccount: 'ACC-12345', amount: 50, currency: 'USD', type: 'withdrawal' })).toEqual([]);
  });
});
