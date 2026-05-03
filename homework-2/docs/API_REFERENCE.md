# API Reference

Base URL: `http://localhost:3000`

All requests / responses use JSON unless noted (`POST /tickets/import` accepts raw `text/csv` / `application/xml` / `application/json`).

## Error envelope

```json
{ "error": "Validation failed", "details": [{ "field": "customer_email", "message": "must be a valid email" }] }
```

## Endpoints

### `POST /tickets`

Create a ticket. Add `?auto_classify=true` to run Gemini classification immediately.

```bash
curl -X POST http://localhost:3000/tickets \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_id":"C-1","customer_email":"a@b.co","customer_name":"Ada",
    "subject":"Cannot login","description":"I cannot sign in for two days",
    "metadata":{"source":"web_form"}
  }'
```

201 →

```json
{
  "id": "uuid",
  "customer_id": "C-1",
  "customer_email": "a@b.co",
  "customer_name": "Ada",
  "subject": "Cannot login",
  "description": "I cannot sign in for two days",
  "category": "other",
  "priority": "medium",
  "status": "new",
  "created_at": "2026-05-03T...",
  "updated_at": "2026-05-03T...",
  "resolved_at": null,
  "assigned_to": null,
  "tags": [],
  "metadata": { "source": "web_form" }
}
```

### `POST /tickets/import?format=csv|json|xml`

Bulk import. Body is the raw file contents. Optional `&auto_classify=true`.

```bash
curl -X POST 'http://localhost:3000/tickets/import?format=csv' \
  -H 'Content-Type: text/csv' \
  --data-binary @demo/sample_tickets.csv
```

201 → `{ "total": 50, "successful": 48, "failed": [{ "row": 12, "error": "..." }] }`

### `GET /tickets`

Filters: `category`, `priority`, `status`, `assigned_to`, `tag`, `from`, `to` (ISO 8601 on `created_at`). All combine with AND.

```bash
curl 'http://localhost:3000/tickets?priority=high&category=billing_question'
```

### `GET /tickets/:id`

```bash
curl http://localhost:3000/tickets/<uuid>
```

200 → ticket | 404 → `{ "error": "Ticket not found" }`

### `PUT /tickets/:id`

Partial update. Setting `status: "resolved"` populates `resolved_at` automatically.

```bash
curl -X PUT http://localhost:3000/tickets/<uuid> \
  -H 'Content-Type: application/json' \
  -d '{ "status": "resolved", "assigned_to": "agent-7" }'
```

### `DELETE /tickets/:id`

```bash
curl -X DELETE http://localhost:3000/tickets/<uuid> -i
```

204 → no body | 404 → not found

### `POST /tickets/:id/auto-classify`

```bash
curl -X POST http://localhost:3000/tickets/<uuid>/auto-classify
```

200 →

```json
{
  "category": "account_access",
  "priority": "urgent",
  "confidence": 0.92,
  "reasoning": "...",
  "keywords": ["cannot login", "production down"],
  "classified_at": "2026-05-03T...",
  "model": "gemini-2.0-flash"
}
```

422 → invalid LLM response | 502 → provider failure | 404 → ticket missing

## Status code reference

| Code | When |
|---|---|
| 200 | GET, PUT, classify success |
| 201 | POST create / import |
| 204 | DELETE success |
| 400 | Validation / parser failure / body type mismatch |
| 404 | Ticket not found |
| 415 | Unknown `?format=` value |
| 422 | LLM response invalid |
| 500 | Internal |
| 502 | LLM provider failed |
