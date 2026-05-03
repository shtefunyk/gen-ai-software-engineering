# How to Run — Homework 2

## Prerequisites

- Node.js ≥ 20
- A Google AI Studio API key for Gemini (only needed for live classification)

## Setup

```bash
cd homework-2
cp .env.example .env
# Open .env and set GEMINI_API_KEY=<your key> if you want auto-classify
npm install
```

## Start the server

```bash
npm start
# → [server] listening on :3000
```

Or via the demo helper:

```bash
./demo/run.sh
```

## Try it

Open `demo/sample-requests.http` in VS Code REST Client / IntelliJ HTTP Client and hit any request, or:

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/tickets \
  -H 'Content-Type: application/json' \
  -d '{"customer_id":"C-1","customer_email":"a@b.co","customer_name":"Ada","subject":"Cannot login","description":"I cannot sign in for two days","metadata":{"source":"web_form"}}'
```

## Tests

```bash
npm test           # mocked, ~1s, no API key needed (91 tests)
npm run coverage   # writes coverage/ — open coverage/index.html
npm run test:live  # requires GEMINI_API_KEY; calls real Gemini
```

## Bulk import

```bash
curl -X POST 'http://localhost:3000/tickets/import?format=csv' \
  -H 'Content-Type: text/csv' \
  --data-binary @demo/sample_tickets.csv
```
