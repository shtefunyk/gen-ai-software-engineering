# How to Run

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
