const request = require('supertest');
const app = require('../src/app');
const store = require('../src/store/transactions');

beforeEach(() => store.clear());

describe('POST /transactions', () => {
  it('creates a transfer and returns 201', async () => {
    const res = await request(app).post('/transactions').send({
      fromAccount: 'ACC-12345',
      toAccount: 'ACC-67890',
      amount: 100.5,
      currency: 'USD',
      type: 'transfer',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^txn_/);
    expect(res.body.status).toBe('pending');
    expect(res.body.amount).toBe(100.5);
    expect(res.body.timestamp).toBeDefined();
  });

  it('creates a deposit without fromAccount and returns 201', async () => {
    const res = await request(app).post('/transactions').send({
      toAccount: 'ACC-12345',
      amount: 200,
      currency: 'EUR',
      type: 'deposit',
    });
    expect(res.status).toBe(201);
    expect(res.body.fromAccount).toBeNull();
  });

  it('returns 400 with details array for invalid body', async () => {
    const res = await request(app).post('/transactions').send({
      amount: -5,
      currency: 'INVALID',
      type: 'transfer',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('returns all validation errors simultaneously', async () => {
    const res = await request(app).post('/transactions').send({});
    expect(res.status).toBe(400);
    expect(res.body.details.length).toBeGreaterThanOrEqual(3);
  });
});

describe('GET /transactions', () => {
  beforeEach(async () => {
    await request(app).post('/transactions').send({ fromAccount: 'ACC-11111', toAccount: 'ACC-22222', amount: 50, currency: 'USD', type: 'transfer' });
    await request(app).post('/transactions').send({ toAccount: 'ACC-11111', amount: 100, currency: 'USD', type: 'deposit' });
    await request(app).post('/transactions').send({ fromAccount: 'ACC-33333', toAccount: 'ACC-44444', amount: 200, currency: 'EUR', type: 'transfer' });
  });

  it('returns all transactions', async () => {
    const res = await request(app).get('/transactions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it('filters by accountId', async () => {
    const res = await request(app).get('/transactions?accountId=ACC-11111');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters by type', async () => {
    const res = await request(app).get('/transactions?type=deposit');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('deposit');
  });

  it('combines accountId and type filters', async () => {
    const res = await request(app).get('/transactions?accountId=ACC-11111&type=transfer');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /transactions/:id', () => {
  it('returns transaction by id', async () => {
    const create = await request(app).post('/transactions').send({
      fromAccount: 'ACC-12345',
      toAccount: 'ACC-67890',
      amount: 75,
      currency: 'GBP',
      type: 'transfer',
    });
    const res = await request(app).get(`/transactions/${create.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(create.body.id);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/transactions/txn_nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Transaction not found');
  });
});

describe('GET /transactions/export', () => {
  it('returns CSV with header and data rows', async () => {
    await request(app).post('/transactions').send({
      fromAccount: 'ACC-12345',
      toAccount: 'ACC-67890',
      amount: 50,
      currency: 'USD',
      type: 'transfer',
    });
    const res = await request(app).get('/transactions/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('id,fromAccount,toAccount');
    expect(res.text).toContain('ACC-12345');
  });

  it('returns only header row when no transactions', async () => {
    const res = await request(app).get('/transactions/export');
    expect(res.status).toBe(200);
    expect(res.text.trim()).toBe('id,fromAccount,toAccount,amount,currency,type,timestamp,status');
  });
});
