# Banking Transactions API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js + Express Banking Transactions REST API with full validation, in-memory storage, rate limiting, CSV export, interest calculation, and automated Jest + Supertest tests.

**Architecture:** Layered Express app — routes handle HTTP, validators handle input, store manages in-memory array. `app.js` separated from `index.js` for Jest testability. All errors route through centralized `errorHandler` middleware.

**Tech Stack:** Node.js 18+, Express 4.18, Jest 29, Supertest 6, ESLint 8, Prettier 3

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/index.js` | Start HTTP server on PORT (default 3000) |
| `src/app.js` | Express app: middleware + route registration |
| `src/store/transactions.js` | In-memory array, `add / findAll / findById / clear` |
| `src/utils/currencies.js` | ISO 4217 valid currency code Set |
| `src/utils/csvExport.js` | Convert transaction array → CSV string |
| `src/validators/transaction.js` | Validate POST body, return `[{field, message}]` array |
| `src/middleware/rateLimiter.js` | 100 req/min per IP, skip when `NODE_ENV=test` |
| `src/middleware/errorHandler.js` | Catch-all → 500 without stack trace leaks |
| `src/routes/transactions.js` | POST/GET `/transactions`, GET `/:id`, GET `/export` |
| `src/routes/accounts.js` | GET `/:id/balance`, `/:id/summary`, `/:id/interest` |
| `tests/utils.test.js` | Unit tests for `generateCsv` |
| `tests/validators.test.js` | Unit tests for `validateTransaction` |
| `tests/transactions.test.js` | Integration tests for transaction routes |
| `tests/accounts.test.js` | Integration tests for account routes |
| `demo/run.sh` | One-command startup script |
| `demo/sample-requests.http` | VS Code REST Client sample requests |
| `demo/sample-data.json` | Sample transaction payloads |

---

### Task 1: Project Setup

**Files:**
- Create: `homework-1/package.json`
- Create: `homework-1/.gitignore`
- Create: `homework-1/.eslintrc.js`
- Create: `homework-1/.prettierrc`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "banking-transactions-api",
  "version": "1.0.0",
  "description": "Banking Transactions REST API",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "jest --forceExit",
    "test:coverage": "jest --coverage --forceExit",
    "lint": "eslint src tests",
    "format": "prettier --write ."
  },
  "jest": {
    "testEnvironment": "node"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "prettier": "^3.2.5",
    "supertest": "^6.3.4"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
coverage/
.env
*.log
```

- [ ] **Step 3: Create `.eslintrc.js`**

```js
module.exports = {
  env: { node: true, es2021: true, jest: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 2021 },
  rules: { 'no-unused-vars': 'warn' },
};
```

- [ ] **Step 4: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "es5"
}
```

- [ ] **Step 5: Install dependencies**

Run from `homework-1/`:
```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` generated, no errors.

- [ ] **Step 6: Commit**

```bash
git add homework-1/package.json homework-1/package-lock.json homework-1/.gitignore homework-1/.eslintrc.js homework-1/.prettierrc
git commit -m "chore: project setup — Express, Jest, ESLint, Prettier"
```

---

### Task 2: In-Memory Store

**Files:**
- Create: `homework-1/src/store/transactions.js`

- [ ] **Step 1: Create the store**

Create `src/store/transactions.js`:

```js
const transactions = [];

function generateId() {
  return `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function add(data) {
  const transaction = {
    id: generateId(),
    fromAccount: data.fromAccount || null,
    toAccount: data.toAccount || null,
    amount: data.amount,
    currency: data.currency,
    type: data.type,
    timestamp: new Date().toISOString(),
    status: 'pending',
  };
  transactions.push(transaction);
  return transaction;
}

function findAll({ accountId, type, from, to } = {}) {
  let result = [...transactions];

  if (accountId) {
    result = result.filter(t => t.fromAccount === accountId || t.toAccount === accountId);
  }
  if (type) {
    result = result.filter(t => t.type === type);
  }
  if (from) {
    result = result.filter(t => new Date(t.timestamp) >= new Date(from));
  }
  if (to) {
    const toDate = to.length === 10 ? new Date(to + 'T23:59:59.999Z') : new Date(to);
    result = result.filter(t => new Date(t.timestamp) <= toDate);
  }

  return result;
}

function findById(id) {
  return transactions.find(t => t.id === id) || null;
}

function clear() {
  transactions.length = 0;
}

module.exports = { add, findAll, findById, clear };
```

- [ ] **Step 2: Verify store works manually**

Run from `homework-1/`:
```bash
node -e "
const store = require('./src/store/transactions');
const t = store.add({ fromAccount: 'ACC-12345', toAccount: 'ACC-67890', amount: 100, currency: 'USD', type: 'transfer' });
console.log(t);
console.log(store.findAll({ accountId: 'ACC-12345' }).length);
"
```

Expected: prints object with `id` starting `txn_`, `status: 'pending'`, `timestamp`; length `1`.

- [ ] **Step 3: Commit**

```bash
git add homework-1/src/store/transactions.js
git commit -m "feat: add in-memory transaction store"
```

---

### Task 3: Utilities

**Files:**
- Create: `homework-1/src/utils/currencies.js`
- Create: `homework-1/src/utils/csvExport.js`
- Create: `homework-1/tests/utils.test.js`

- [ ] **Step 1: Create `currencies.js`**

Create `src/utils/currencies.js`:

```js
const VALID_CURRENCIES = new Set([
  'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN',
  'BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL',
  'BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY',
  'COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP',
  'ERN','ETB','EUR','FJD','GBP','GEL','GHS','GMD','GNF','GTQ',
  'GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD',
  'IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KRW',
  'KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD',
  'MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK',
  'MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR',
  'PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD',
  'RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLL',
  'SOS','SRD','STN','SVC','SYP','SZL','THB','TJS','TMT','TND',
  'TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS',
  'VES','VND','VUV','WST','XAF','XCD','XOF','XPF','YER','ZAR','ZMW',
]);

module.exports = { VALID_CURRENCIES };
```

- [ ] **Step 2: Write failing test for `csvExport`**

Create `tests/utils.test.js`:

```js
const { generateCsv } = require('../src/utils/csvExport');

describe('generateCsv', () => {
  it('generates CSV header row for empty input', () => {
    const csv = generateCsv([]);
    expect(csv).toBe('id,fromAccount,toAccount,amount,currency,type,timestamp,status');
  });

  it('generates data rows for transactions', () => {
    const tx = {
      id: 'txn_1',
      fromAccount: 'ACC-12345',
      toAccount: 'ACC-67890',
      amount: 100.5,
      currency: 'USD',
      type: 'transfer',
      timestamp: '2026-01-01T00:00:00.000Z',
      status: 'pending',
    };
    const lines = generateCsv([tx]).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '"txn_1","ACC-12345","ACC-67890","100.5","USD","transfer","2026-01-01T00:00:00.000Z","pending"'
    );
  });

  it('handles null fromAccount', () => {
    const tx = {
      id: 'txn_2',
      fromAccount: null,
      toAccount: 'ACC-67890',
      amount: 50,
      currency: 'EUR',
      type: 'deposit',
      timestamp: '2026-01-02T00:00:00.000Z',
      status: 'completed',
    };
    expect(generateCsv([tx])).toContain('"","ACC-67890"');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd homework-1 && npx jest tests/utils.test.js
```

Expected: FAIL — "Cannot find module '../src/utils/csvExport'"

- [ ] **Step 4: Create `csvExport.js`**

Create `src/utils/csvExport.js`:

```js
const HEADERS = ['id', 'fromAccount', 'toAccount', 'amount', 'currency', 'type', 'timestamp', 'status'];

function generateCsv(transactions) {
  const rows = transactions.map(t =>
    HEADERS.map(h => `"${(t[h] ?? '').toString().replace(/"/g, '""')}"`).join(',')
  );
  return [HEADERS.join(','), ...rows].join('\n');
}

module.exports = { generateCsv };
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd homework-1 && npx jest tests/utils.test.js
```

Expected: PASS — 3 tests passing.

- [ ] **Step 6: Commit**

```bash
git add homework-1/src/utils/currencies.js homework-1/src/utils/csvExport.js homework-1/tests/utils.test.js
git commit -m "feat: ISO 4217 currencies list and CSV export utility"
```

---

### Task 4: Transaction Validator

**Files:**
- Create: `homework-1/src/validators/transaction.js`
- Create: `homework-1/tests/validators.test.js`

- [ ] **Step 1: Write failing validator tests**

Create `tests/validators.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd homework-1 && npx jest tests/validators.test.js
```

Expected: FAIL — "Cannot find module '../src/validators/transaction'"

- [ ] **Step 3: Create the validator**

Create `src/validators/transaction.js`:

```js
const { VALID_CURRENCIES } = require('../utils/currencies');

const ACCOUNT_REGEX = /^ACC-[A-Z0-9]{5}$/i;
const VALID_TYPES = ['deposit', 'withdrawal', 'transfer'];

function validateTransaction(body) {
  const errors = [];
  const { amount, currency, type, fromAccount, toAccount } = body;

  if (amount === undefined || amount === null) {
    errors.push({ field: 'amount', message: 'Amount is required' });
  } else if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    errors.push({ field: 'amount', message: 'Amount must be a positive number' });
  } else if (!/^\d+(\.\d{1,2})?$/.test(amount.toString())) {
    errors.push({ field: 'amount', message: 'Amount must have at most 2 decimal places' });
  }

  if (!currency) {
    errors.push({ field: 'currency', message: 'Currency is required' });
  } else if (!VALID_CURRENCIES.has(currency.toUpperCase())) {
    errors.push({ field: 'currency', message: 'Invalid ISO 4217 currency code' });
  }

  if (!type) {
    errors.push({ field: 'type', message: 'Type is required' });
  } else if (!VALID_TYPES.includes(type)) {
    errors.push({ field: 'type', message: `Type must be one of: ${VALID_TYPES.join(', ')}` });
  } else {
    const needsFrom = type === 'withdrawal' || type === 'transfer';
    const needsTo = type === 'deposit' || type === 'transfer';

    if (needsFrom) {
      if (!fromAccount) {
        errors.push({ field: 'fromAccount', message: `fromAccount is required for ${type}` });
      } else if (!ACCOUNT_REGEX.test(fromAccount)) {
        errors.push({ field: 'fromAccount', message: 'Account must match format ACC-XXXXX' });
      }
    } else if (fromAccount && !ACCOUNT_REGEX.test(fromAccount)) {
      errors.push({ field: 'fromAccount', message: 'Account must match format ACC-XXXXX' });
    }

    if (needsTo) {
      if (!toAccount) {
        errors.push({ field: 'toAccount', message: `toAccount is required for ${type}` });
      } else if (!ACCOUNT_REGEX.test(toAccount)) {
        errors.push({ field: 'toAccount', message: 'Account must match format ACC-XXXXX' });
      }
    } else if (toAccount && !ACCOUNT_REGEX.test(toAccount)) {
      errors.push({ field: 'toAccount', message: 'Account must match format ACC-XXXXX' });
    }
  }

  return errors;
}

module.exports = { validateTransaction };
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd homework-1 && npx jest tests/validators.test.js
```

Expected: PASS — 12 tests passing.

- [ ] **Step 5: Commit**

```bash
git add homework-1/src/validators/transaction.js homework-1/tests/validators.test.js
git commit -m "feat: transaction validator — amount, currency ISO 4217, ACC-XXXXX format"
```

---

### Task 5: Middleware

**Files:**
- Create: `homework-1/src/middleware/rateLimiter.js`
- Create: `homework-1/src/middleware/errorHandler.js`

- [ ] **Step 1: Create `rateLimiter.js`**

Create `src/middleware/rateLimiter.js`:

```js
const requests = new Map();
const LIMIT = 100;
const WINDOW_MS = 60 * 1000;

function rateLimiter(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();

  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const timestamps = (requests.get(ip) || []).filter(t => now - t < WINDOW_MS);

  if (timestamps.length >= LIMIT) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Limit: 100 requests per minute per IP',
    });
  }

  timestamps.push(now);
  requests.set(ip, timestamps);
  next();
}

module.exports = rateLimiter;
```

- [ ] **Step 2: Create `errorHandler.js`**

Create `src/middleware/errorHandler.js`:

```js
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
}

module.exports = errorHandler;
```

- [ ] **Step 3: Commit**

```bash
git add homework-1/src/middleware/rateLimiter.js homework-1/src/middleware/errorHandler.js
git commit -m "feat: rate limiter (100 req/min per IP) and centralized error handler"
```

---

### Task 6: Express App

**Files:**
- Create: `homework-1/src/app.js`
- Create: `homework-1/src/index.js`
- Create: `homework-1/src/routes/transactions.js` (placeholder)
- Create: `homework-1/src/routes/accounts.js` (placeholder)

- [ ] **Step 1: Create `app.js`**

Create `src/app.js`:

```js
const express = require('express');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const transactionRoutes = require('./routes/transactions');
const accountRoutes = require('./routes/accounts');

const app = express();

app.use(express.json());
app.use(rateLimiter);
app.use('/transactions', transactionRoutes);
app.use('/accounts', accountRoutes);
app.use(errorHandler);

module.exports = app;
```

- [ ] **Step 2: Create `index.js`**

Create `src/index.js`:

```js
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Banking API running on http://localhost:${PORT}`);
});
```

- [ ] **Step 3: Create placeholder route files**

Create `src/routes/transactions.js`:
```js
const express = require('express');
const router = express.Router();
module.exports = router;
```

Create `src/routes/accounts.js`:
```js
const express = require('express');
const router = express.Router();
module.exports = router;
```

- [ ] **Step 4: Verify server starts without errors**

Run from `homework-1/`:
```bash
node src/index.js &
sleep 1
curl -s http://localhost:3000/transactions
kill %1
```

Expected: empty response `[]` or no-route response, no crash.

- [ ] **Step 5: Commit**

```bash
git add homework-1/src/app.js homework-1/src/index.js homework-1/src/routes/transactions.js homework-1/src/routes/accounts.js
git commit -m "feat: Express app skeleton with middleware and route wiring"
```

---

### Task 7: Transaction Routes

**Files:**
- Modify: `homework-1/src/routes/transactions.js`
- Create: `homework-1/tests/transactions.test.js`

- [ ] **Step 1: Write failing integration tests**

Create `tests/transactions.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd homework-1 && npx jest tests/transactions.test.js
```

Expected: FAIL — most tests fail (empty router).

- [ ] **Step 3: Implement transaction routes**

Replace `src/routes/transactions.js` with:

```js
const express = require('express');
const router = express.Router();
const store = require('../store/transactions');
const { validateTransaction } = require('../validators/transaction');
const { generateCsv } = require('../utils/csvExport');

// /export must be registered BEFORE /:id — otherwise Express matches "export" as an id param
router.get('/export', (req, res) => {
  const { accountId, type, from, to } = req.query;
  const transactions = store.findAll({ accountId, type, from, to });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send(generateCsv(transactions));
});

router.get('/', (req, res) => {
  const { accountId, type, from, to } = req.query;
  res.json(store.findAll({ accountId, type, from, to }));
});

router.post('/', (req, res) => {
  const errors = validateTransaction(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  res.status(201).json(store.add(req.body));
});

router.get('/:id', (req, res) => {
  const transaction = store.findById(req.params.id);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  res.json(transaction);
});

module.exports = router;
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd homework-1 && npx jest tests/transactions.test.js
```

Expected: PASS — all tests passing.

- [ ] **Step 5: Commit**

```bash
git add homework-1/src/routes/transactions.js homework-1/tests/transactions.test.js
git commit -m "feat: transaction routes — POST, GET list/filter, GET/:id, GET/export CSV"
```

---

### Task 8: Account Routes

**Files:**
- Modify: `homework-1/src/routes/accounts.js`
- Create: `homework-1/tests/accounts.test.js`

- [ ] **Step 1: Write failing integration tests**

Create `tests/accounts.test.js`:

```js
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
    expect(res.body.error).toBeDefined();
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
  });

  it('returns 400 when days is missing', async () => {
    const res = await request(app).get('/accounts/ACC-12345/interest?rate=0.05');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid account format', async () => {
    const res = await request(app).get('/accounts/INVALID/interest?rate=0.05&days=30');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd homework-1 && npx jest tests/accounts.test.js
```

Expected: FAIL — empty accounts router returns 404.

- [ ] **Step 3: Implement account routes**

Replace `src/routes/accounts.js` with:

```js
const express = require('express');
const router = express.Router();
const store = require('../store/transactions');

const ACCOUNT_REGEX = /^ACC-[A-Z0-9]{5}$/i;

function isValidAccountId(accountId) {
  return ACCOUNT_REGEX.test(accountId);
}

function computeBalance(accountId) {
  return store
    .findAll({ accountId })
    .filter(t => t.status === 'completed')
    .reduce((balance, t) => {
      if (t.toAccount === accountId && (t.type === 'deposit' || t.type === 'transfer')) {
        return balance + t.amount;
      }
      if (t.fromAccount === accountId && (t.type === 'withdrawal' || t.type === 'transfer')) {
        return balance - t.amount;
      }
      return balance;
    }, 0);
}

router.get('/:accountId/balance', (req, res) => {
  const { accountId } = req.params;
  if (!isValidAccountId(accountId)) {
    return res.status(400).json({ error: 'Invalid account ID format. Expected: ACC-XXXXX' });
  }
  const balance = Math.round(computeBalance(accountId) * 100) / 100;
  res.json({ accountId, balance });
});

router.get('/:accountId/summary', (req, res) => {
  const { accountId } = req.params;
  if (!isValidAccountId(accountId)) {
    return res.status(400).json({ error: 'Invalid account ID format. Expected: ACC-XXXXX' });
  }

  const allForAccount = store.findAll({ accountId });
  const completed = allForAccount.filter(t => t.status === 'completed');

  const totalDeposits =
    Math.round(completed.filter(t => t.toAccount === accountId).reduce((s, t) => s + t.amount, 0) * 100) / 100;

  const totalWithdrawals =
    Math.round(completed.filter(t => t.fromAccount === accountId).reduce((s, t) => s + t.amount, 0) * 100) / 100;

  const timestamps = allForAccount.map(t => t.timestamp).sort();
  const lastTransactionDate = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  res.json({
    accountId,
    totalDeposits,
    totalWithdrawals,
    transactionCount: allForAccount.length,
    lastTransactionDate,
  });
});

router.get('/:accountId/interest', (req, res) => {
  const { accountId } = req.params;
  if (!isValidAccountId(accountId)) {
    return res.status(400).json({ error: 'Invalid account ID format. Expected: ACC-XXXXX' });
  }

  const { rate, days } = req.query;

  if (rate === undefined) return res.status(400).json({ error: 'Query parameter "rate" is required' });
  if (days === undefined) return res.status(400).json({ error: 'Query parameter "days" is required' });

  const rateNum = parseFloat(rate);
  const daysNum = parseInt(days, 10);

  if (isNaN(rateNum) || rateNum <= 0) return res.status(400).json({ error: '"rate" must be a positive number' });
  if (isNaN(daysNum) || daysNum <= 0) return res.status(400).json({ error: '"days" must be a positive integer' });

  const balance = Math.round(computeBalance(accountId) * 100) / 100;
  const interest = Math.round(balance * rateNum * (daysNum / 365) * 100) / 100;
  const projectedBalance = Math.round((balance + interest) * 100) / 100;

  res.json({ accountId, balance, rate: rateNum, days: daysNum, interest, projectedBalance });
});

module.exports = router;
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd homework-1 && npx jest tests/accounts.test.js
```

Expected: PASS — all tests passing.

- [ ] **Step 5: Run full test suite**

```bash
cd homework-1 && npm test
```

Expected: All 4 test files pass, no failures.

- [ ] **Step 6: Commit**

```bash
git add homework-1/src/routes/accounts.js homework-1/tests/accounts.test.js
git commit -m "feat: account routes — balance, summary, interest (simple interest formula)"
```

---

### Task 9: Demo Files

**Files:**
- Create: `homework-1/demo/run.sh`
- Create: `homework-1/demo/sample-data.json`
- Create: `homework-1/demo/sample-requests.http`

- [ ] **Step 1: Create `run.sh`**

Create `demo/run.sh`:

```bash
#!/bin/bash
cd "$(dirname "$0")/.."
echo "Installing dependencies..."
npm install
echo "Starting Banking Transactions API on http://localhost:3000"
npm start
```

Make it executable:
```bash
chmod +x homework-1/demo/run.sh
```

- [ ] **Step 2: Create `sample-data.json`**

Create `demo/sample-data.json`:

```json
[
  {
    "fromAccount": "ACC-ALICE",
    "toAccount": "ACC-BOB01",
    "amount": 500.00,
    "currency": "USD",
    "type": "transfer"
  },
  {
    "toAccount": "ACC-ALICE",
    "amount": 1000.00,
    "currency": "USD",
    "type": "deposit"
  },
  {
    "fromAccount": "ACC-BOB01",
    "amount": 200.00,
    "currency": "USD",
    "type": "withdrawal"
  },
  {
    "fromAccount": "ACC-ALICE",
    "toAccount": "ACC-CAROL",
    "amount": 75.50,
    "currency": "EUR",
    "type": "transfer"
  }
]
```

- [ ] **Step 3: Create `sample-requests.http`**

Create `demo/sample-requests.http`:

```http
### Create a transfer
POST http://localhost:3000/transactions
Content-Type: application/json

{
  "fromAccount": "ACC-12345",
  "toAccount": "ACC-67890",
  "amount": 500.00,
  "currency": "USD",
  "type": "transfer"
}

###

### Create a deposit
POST http://localhost:3000/transactions
Content-Type: application/json

{
  "toAccount": "ACC-12345",
  "amount": 1000.00,
  "currency": "USD",
  "type": "deposit"
}

###

### Create a withdrawal
POST http://localhost:3000/transactions
Content-Type: application/json

{
  "fromAccount": "ACC-12345",
  "amount": 200.00,
  "currency": "EUR",
  "type": "withdrawal"
}

###

### Validation error — invalid fields
POST http://localhost:3000/transactions
Content-Type: application/json

{
  "fromAccount": "INVALID",
  "amount": -50,
  "currency": "XYZ",
  "type": "unknown"
}

###

### List all transactions
GET http://localhost:3000/transactions

###

### Filter by account
GET http://localhost:3000/transactions?accountId=ACC-12345

###

### Filter by type
GET http://localhost:3000/transactions?type=transfer

###

### Filter by date range
GET http://localhost:3000/transactions?from=2024-01-01&to=2026-12-31

###

### Get transaction by ID — replace ID with a real one from POST response
GET http://localhost:3000/transactions/txn_REPLACE_WITH_REAL_ID

###

### Get unknown transaction — 404
GET http://localhost:3000/transactions/txn_nonexistent

###

### Get account balance
GET http://localhost:3000/accounts/ACC-12345/balance

###

### Get account summary
GET http://localhost:3000/accounts/ACC-12345/summary

###

### Get interest: 5% annual rate, 30 days
GET http://localhost:3000/accounts/ACC-12345/interest?rate=0.05&days=30

###

### Export all transactions as CSV
GET http://localhost:3000/transactions/export

###

### Export filtered CSV (transfers only)
GET http://localhost:3000/transactions/export?type=transfer
```

- [ ] **Step 4: Commit**

```bash
git add homework-1/demo/
git commit -m "feat: demo files — startup script and sample HTTP requests"
```

---

### Task 10: Documentation

**Files:**
- Modify: `homework-1/README.md`
- Modify: `homework-1/HOWTORUN.md`

- [ ] **Step 1: Write `README.md`**

Replace `homework-1/README.md` with:

```markdown
# 🏦 Homework 1: Banking Transactions API

> **Student Name**: Bohdan Shtefunik
> **Date Submitted**: 2026-04-27
> **AI Tools Used**: Claude Code (claude-sonnet-4-6)

---

## 📋 Project Overview

A REST API for banking transactions built with Node.js + Express. Uses in-memory storage, comprehensive validation, automated tests, and all four bonus features.

## ✅ Features Implemented

### Core (Required)
- `POST /transactions` — create transaction (auto-generated ID, status `pending`)
- `GET /transactions` — list with filters: `?accountId=`, `?type=`, `?from=`, `?to=`
- `GET /transactions/:id` — get by ID (404 if not found)
- `GET /accounts/:accountId/balance` — compute balance from completed transactions

### Bonus (All 4)
- `GET /accounts/:accountId/summary` — total deposits/withdrawals, count, last date _(Option A)_
- `GET /accounts/:accountId/interest?rate=0.05&days=30` — simple interest _(Option B)_
- `GET /transactions/export` — CSV download with optional filters _(Option C)_
- Rate limiting — 100 requests/min per IP → 429 _(Option D)_

## 🏗️ Architecture

```
src/
  app.js          — Express app (separated from index.js for Jest testability)
  index.js        — HTTP server entry point
  store/          — in-memory array with CRUD + filtering
  routes/         — HTTP handlers (transactions, accounts)
  validators/     — input validation, returns all errors simultaneously
  middleware/     — rate limiter, centralized error handler
  utils/          — ISO 4217 currency codes, CSV generator
tests/            — Jest + Supertest (integration + unit)
```

**Request flow:** `Request → rateLimiter → route → validator → store → response`

## 🔑 Key Design Decisions

- `app.js` separated from `index.js` — Jest imports the app without binding a real port
- Balance and totals only count `completed` transactions
- All validation errors returned simultaneously in one 400 response
- `GET /transactions/export` registered before `GET /transactions/:id` to avoid route collision
- Rate limiter skips when `NODE_ENV=test` for deterministic tests

## 🧪 Tests

```bash
npm test                # run all tests
npm run test:coverage   # with coverage report
```

## 📸 Screenshots

See `docs/screenshots/` for:
- AI tool interactions (prompts and generated code)
- Server running output
- Sample API requests/responses
- Test suite passing
```

- [ ] **Step 2: Write `HOWTORUN.md`**

Replace `homework-1/HOWTORUN.md` with:

```markdown
# ▶️ How to Run

## Prerequisites

- Node.js 18+ (`node --version`)

## Quick Start

```bash
cd homework-1
npm install
npm start
```

Server starts at **http://localhost:3000**

## Using the Demo Script

```bash
bash demo/run.sh
```

## Running Tests

```bash
npm test                 # all tests
npm run test:coverage    # with coverage report
```

## Sample Requests

Open `demo/sample-requests.http` in VS Code with the **REST Client** extension, or use curl:

```bash
# Create a transfer
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":500,"currency":"USD","type":"transfer"}'

# List transactions
curl http://localhost:3000/transactions

# Get balance
curl http://localhost:3000/accounts/ACC-12345/balance

# Export CSV
curl http://localhost:3000/transactions/export -o transactions.csv
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | HTTP port   |
```

- [ ] **Step 3: Commit**

```bash
git add homework-1/README.md homework-1/HOWTORUN.md
git commit -m "docs: complete README and HOWTORUN"
```

---

### Task 11: Screenshots and PR

**Files:** `homework-1/docs/screenshots/` — student provides screenshots

- [ ] **Step 1: Create submission branch**

```bash
git checkout -b homework-1-submission
git push origin homework-1-submission
```

- [ ] **Step 2: Take required screenshots**

Take and save the following to `homework-1/docs/screenshots/`:

| Filename | What to capture |
|----------|----------------|
| `ai-interaction-1.png` | Claude Code generating a feature (show the prompt and response) |
| `api-running.png` | Terminal with `npm start` output showing server started |
| `api-requests.png` | VS Code REST Client or Postman showing requests + responses |
| `tests-passing.png` | Terminal with `npm test` output — all tests green |

Then commit:
```bash
git add homework-1/docs/screenshots/
git commit -m "docs: add screenshots for AI interactions, running API, and test results"
git push origin homework-1-submission
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create \
  --title "Homework 1: Banking Transactions API (Node.js + Express)" \
  --base main \
  --body "$(cat <<'EOF'
## Summary

Implementation of the Banking Transactions REST API for Homework 1.

### Endpoints Implemented
- ✅ `POST /transactions` — create with validation, auto-ID, status `pending`
- ✅ `GET /transactions` — list with `?accountId`, `?type`, `?from`, `?to` filters
- ✅ `GET /transactions/:id` — by ID (404 if not found)
- ✅ `GET /accounts/:accountId/balance` — balance from completed transactions
- ✅ `GET /accounts/:accountId/summary` — totals, count, last date (**Bonus A**)
- ✅ `GET /accounts/:accountId/interest?rate=&days=` — simple interest (**Bonus B**)
- ✅ `GET /transactions/export` — CSV download with filters (**Bonus C**)
- ✅ Rate limiting — 100 req/min per IP → 429 (**Bonus D**)

### Architecture
Layered Express app: `routes → validators → store`. `app.js` separated from `index.js` for Jest testability via Supertest. Centralized error handler catches all unhandled errors. Rate limiter bypasses in `NODE_ENV=test`.

### AI Tools Used
- **Claude Code** (claude-sonnet-4-6) — design brainstorming, implementation plan, and code via superpowers skills

### Challenges
- `GET /transactions/export` must be registered before `GET /transactions/:id` in Express, or "export" gets matched as an `:id` param.
- Balance calculation intentionally excludes `pending` and `failed` transactions to reflect only settled funds.

## Test Plan
- [ ] `npm install && npm test` — all tests pass
- [ ] `npm start` — server starts on port 3000
- [ ] Open `demo/sample-requests.http` in VS Code REST Client — verify all responses
- [ ] Send invalid body to `POST /transactions` — verify 400 with `details` array
- [ ] `curl http://localhost:3000/transactions/export -o out.csv` — verify CSV download
- [ ] Check `docs/screenshots/` for AI interactions, running server, and test output

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```

---

## Self-Review Checklist

- [x] **Store**: `add`, `findAll` (with filters), `findById`, `clear` — all defined in Task 2, used consistently in Tasks 7 and 8
- [x] **Validator**: returns `[{field, message}]` — defined in Task 4, imported in Task 7
- [x] **`generateCsv`**: defined in Task 3, imported in Task 7
- [x] **`computeBalance`**: defined in Task 8 accounts route, used by both `balance` and `interest` handlers
- [x] **Route order**: `/export` before `/:id` — noted in both plan and implementation
- [x] **Rate limiter**: skips in `NODE_ENV=test` — set in Task 5, Jest runs with default `NODE_ENV=test`
- [x] **All 4 bonus features** covered: summary (Task 8), interest (Task 8), CSV export (Task 7), rate limiting (Task 5)
- [x] **Screenshots**: addressed in Task 11 with explicit filenames and instructions
