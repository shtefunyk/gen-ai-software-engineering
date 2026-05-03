# Banking Transactions API — Design Spec

**Date:** 2026-04-27  
**Stack:** Node.js + Express  
**Storage:** In-memory (array)  
**Tests:** Jest + Supertest  
**Linting:** ESLint + Prettier  

---

## Project Structure

```
homework-1/
├── src/
│   ├── index.js                   # entry point, starts server
│   ├── app.js                     # Express app (separate for tests)
│   ├── store/
│   │   └── transactions.js        # in-memory array + CRUD operations
│   ├── routes/
│   │   ├── transactions.js        # POST/GET /transactions, GET /transactions/:id
│   │   └── accounts.js            # GET /accounts/:id/balance|summary|interest
│   ├── validators/
│   │   └── transaction.js         # field validation, ISO 4217, ACC-XXXXX format
│   ├── middleware/
│   │   ├── rateLimiter.js         # 100 req/min per IP → 429
│   │   └── errorHandler.js        # centralized error handling → 500
│   └── utils/
│       ├── currencies.js          # valid ISO 4217 codes list
│       └── csvExport.js           # CSV generation
├── tests/
│   ├── transactions.test.js
│   ├── accounts.test.js
│   └── validators.test.js
├── demo/
│   ├── run.sh
│   ├── sample-requests.http
│   └── sample-data.json
├── docs/screenshots/
├── .eslintrc.js
├── .prettierrc
├── .gitignore
├── package.json
├── README.md
└── HOWTORUN.md
```

---

## Data Model

```json
{
  "id": "txn_1714123456789_abc123",
  "fromAccount": "ACC-12345",
  "toAccount": "ACC-67890",
  "amount": 100.50,
  "currency": "USD",
  "type": "deposit | withdrawal | transfer",
  "timestamp": "2026-04-27T10:00:00.000Z",
  "status": "pending | completed | failed"
}
```

**ID format:** `txn_${Date.now()}_${Math.random().toString(36).slice(2,8)}`

**Type rules:**
- `deposit` — `fromAccount` optional, `toAccount` required
- `withdrawal` — `fromAccount` required, `toAccount` optional
- `transfer` — both `fromAccount` and `toAccount` required

**Balance calculation (dynamic from array):**
- `+amount` when account is `toAccount` and type is `deposit` or `transfer`
- `-amount` when account is `fromAccount` and type is `withdrawal` or `transfer`
- Only `completed` status transactions count toward balance, summary, and interest calculation

---

## API Endpoints

| Method | Endpoint | Status codes | Description |
|--------|----------|-------------|-------------|
| `POST` | `/transactions` | 201, 400 | Create transaction (status = `pending`) |
| `GET` | `/transactions` | 200 | List with filters |
| `GET` | `/transactions/:id` | 200, 404 | Get by ID |
| `GET` | `/transactions/export` | 200, 400 | CSV export (supports filters) |
| `GET` | `/accounts/:accountId/balance` | 200, 400 | Account balance |
| `GET` | `/accounts/:accountId/summary` | 200, 400 | Transaction summary |
| `GET` | `/accounts/:accountId/interest` | 200, 400 | Simple interest calculation |

**GET /transactions filters** (combinable via AND):
- `?accountId=ACC-12345` — transactions where account is fromAccount or toAccount
- `?type=transfer`
- `?from=2024-01-01&to=2024-01-31` — by timestamp field

**Response examples:**

`GET /accounts/ACC-12345/balance`:
```json
{ "accountId": "ACC-12345", "balance": 950.00 }
```
Note: currency is omitted — transactions may have different currencies, balance is numeric sum.

`GET /accounts/ACC-12345/summary`:
```json
{
  "accountId": "ACC-12345",
  "totalDeposits": 1000.00,
  "totalWithdrawals": 50.00,
  "transactionCount": 5,
  "lastTransactionDate": "2026-04-27T10:00:00.000Z"
}
```

`GET /accounts/ACC-12345/interest?rate=0.05&days=30`:
```json
{
  "accountId": "ACC-12345",
  "balance": 950.00,
  "rate": 0.05,
  "days": 30,
  "interest": 3.90,
  "projectedBalance": 953.90
}
```

---

## Validation

**POST /transactions fields:**

| Field | Rule |
|-------|------|
| `amount` | Required, number > 0, max 2 decimal places |
| `currency` | Required, valid ISO 4217 code |
| `type` | Required, one of: `deposit`, `withdrawal`, `transfer` |
| `fromAccount` | Format `ACC-XXXXX` (5 alphanumeric), required for `withdrawal`/`transfer` |
| `toAccount` | Format `ACC-XXXXX`, required for `deposit`/`transfer` |

All validation errors returned simultaneously (not just first found):
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "amount", "message": "Amount must be a positive number with max 2 decimal places" },
    { "field": "currency", "message": "Invalid ISO 4217 currency code" }
  ]
}
```

**Rate Limiting (429):**
```json
{ "error": "Too Many Requests", "message": "Limit: 100 requests per minute per IP" }
```

**Error handler** catches all unhandled errors → 500 `{ "error": "Internal Server Error" }` without stack trace leaks.

---

## Route Registration Order

`GET /transactions/export` must be registered **before** `GET /transactions/:id` in Express, otherwise "export" is matched as an `:id` parameter.

**Simple interest formula:** `interest = balance × rate × (days / 365)`

---

## Request Flow

```
Request → rateLimiter → route handler → validator → store → response
                                                        ↓
                                              errorHandler (any layer)
```

`app.js` is separated from `index.js` so Jest can import the app without starting the real server.

---

## Testing Strategy

**Stack:** Jest + Supertest

**`tests/transactions.test.js`** (integration):
- `POST /transactions` valid data → 201
- `POST /transactions` invalid fields → 400 with details array
- `GET /transactions` returns all
- `GET /transactions?accountId=ACC-12345` filter by account
- `GET /transactions?type=transfer&from=...&to=...` combined filters
- `GET /transactions/:id` existing → 200, missing → 404
- `GET /transactions/export` → CSV response

**`tests/accounts.test.js`**:
- Balance correct after multiple transactions
- Summary totals correct
- Interest calculation math

**`tests/validators.test.js`** (unit):
- Each validation rule isolated (amount, currency, account format)

**npm scripts:**
```json
"test": "jest",
"test:coverage": "jest --coverage",
"lint": "eslint src tests",
"format": "prettier --write ."
```

Target: ~80%+ coverage.
