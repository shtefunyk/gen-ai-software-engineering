const request = require('supertest');
const app = require('../src/app');
const store = require('../src/store/transactions');

beforeEach(() => store.clear());

function addCompleted(data) {
  const tx = store.add(data);
  tx.status = 'completed';
  return tx;
}

describe('GET /accounts/:accountId/balance', () => {
  it('returns 0 for account with no transactions', async () => {
    const res = await request(app).get('/accounts/ACC-12345/balance');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accountId: 'ACC-12345', balance: 0 });
  });

  it('calculates balance from completed transactions only', async () => {
    addCompleted({ toAccount: 'ACC-12345', amount: 1000, currency: 'USD', type: 'deposit' });
    addCompleted({ fromAccount: 'ACC-12345', toAccount: 'ACC-99999', amount: 200, currency: 'USD', type: 'transfer' });
    addCompleted({ fromAccount: 'ACC-12345', amount: 50, currency: 'USD', type: 'withdrawal' });
    const res = await request(app).get('/accounts/ACC-12345/balance');
    expect(res.status).toBe(200);
    expect(res.body.balance).toBeCloseTo(750, 2);
  });

  it('ignores pending transactions', async () => {
    store.add({ toAccount: 'ACC-12345', amount: 500, currency: 'USD', type: 'deposit' });
    const res = await request(app).get('/accounts/ACC-12345/balance');
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(0);
  });

  it('returns 400 for invalid account format', async () => {
    const res = await request(app).get('/accounts/INVALID/balance');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
  });
});

describe('GET /accounts/:accountId/summary', () => {
  it('returns zeros for account with no transactions', async () => {
    const res = await request(app).get('/accounts/ACC-12345/summary');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accountId: 'ACC-12345',
      totalDeposits: 0,
      totalWithdrawals: 0,
      transactionCount: 0,
      lastTransactionDate: null,
    });
  });

  it('returns 400 for invalid account format', async () => {
    const res = await request(app).get('/accounts/INVALID/summary');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('returns correct totals for completed transactions', async () => {
    addCompleted({ toAccount: 'ACC-12345', amount: 500, currency: 'USD', type: 'deposit' });
    addCompleted({ fromAccount: 'ACC-12345', amount: 100, currency: 'USD', type: 'withdrawal' });
    addCompleted({ fromAccount: 'ACC-99999', toAccount: 'ACC-12345', amount: 200, currency: 'USD', type: 'transfer' });
    const res = await request(app).get('/accounts/ACC-12345/summary');
    expect(res.status).toBe(200);
    expect(res.body.totalDeposits).toBeCloseTo(700, 2);
    expect(res.body.totalWithdrawals).toBeCloseTo(100, 2);
    expect(res.body.transactionCount).toBe(3);
    expect(res.body.lastTransactionDate).not.toBeNull();
  });
});

describe('GET /accounts/:accountId/interest', () => {
  it('calculates simple interest: balance × rate × (days/365)', async () => {
    addCompleted({ toAccount: 'ACC-12345', amount: 1000, currency: 'USD', type: 'deposit' });
    const res = await request(app).get('/accounts/ACC-12345/interest?rate=0.05&days=365');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accountId: 'ACC-12345', balance: 1000, rate: 0.05, days: 365 });
    expect(res.body.interest).toBeCloseTo(50, 2);
    expect(res.body.projectedBalance).toBeCloseTo(1050, 2);
  });

  it('returns 400 when rate is missing', async () => {
    const res = await request(app).get('/accounts/ACC-12345/interest?days=30');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('returns 400 when days is missing', async () => {
    const res = await request(app).get('/accounts/ACC-12345/interest?rate=0.05');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('returns 400 for invalid account format', async () => {
    const res = await request(app).get('/accounts/INVALID/interest?rate=0.05&days=30');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
  });
});
