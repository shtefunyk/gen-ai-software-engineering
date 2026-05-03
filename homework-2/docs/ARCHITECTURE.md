# Architecture

## High-level

```mermaid
graph TB
  subgraph HTTP layer
    R[routes/tickets.js]
    EH[middleware/errorHandler]
    RB[middleware/rawBodyParser]
  end
  subgraph Domain
    TS[services/ticketService]
    IS[services/importService]
    CS[services/classificationService]
  end
  subgraph Adapters
    P_CSV[parsers/csv]
    P_JSON[parsers/json]
    P_XML[parsers/xml]
    G[(Gemini 2.0 Flash)]
  end
  subgraph Data
    ST[(in-memory Map)]
  end
  R --> TS
  R --> IS
  R --> CS
  IS --> P_CSV
  IS --> P_JSON
  IS --> P_XML
  IS --> TS
  TS --> ST
  CS --> G
  R -.errors.-> EH
  RB -.precedes.-> R
```

## Auto-classification sequence

```mermaid
sequenceDiagram
  participant C as Client
  participant R as routes/tickets
  participant TS as ticketService
  participant CS as classificationService
  participant G as Gemini

  C->>R: POST /tickets/:id/auto-classify
  R->>TS: get(id)
  TS-->>R: ticket
  R->>CS: classify(ticket)
  CS->>G: generateContent (responseSchema)
  alt valid response
    G-->>CS: {category, priority, confidence, reasoning, keywords}
    CS-->>R: result
    R->>TS: setClassification(id, result)
    R-->>C: 200 + result
  else invalid JSON / schema
    CS--xR: HttpError 422
    R-->>C: 422
  else SDK error
    CS--xR: HttpError 502
    R-->>C: 502
  end
```

## Design decisions

| Decision | Why |
|---|---|
| In-memory `Map` storage | Spec doesn't require persistence; concurrent access is safe under Node's single-threaded event loop |
| Gemini-only classification (no rule fallback) | Showcases real LLM integration; rules are passed to Gemini in the system prompt instead of duplicated in JS |
| Default tests fully mock the SDK | The instructor doesn't have our `GEMINI_API_KEY`; their `npm test` must pass |
| Raw body + `?format=` query param for `/tickets/import` | Avoids `multer` dependency, makes `curl --data-binary @file.csv` natural for demos |
| Soft-fail classification during create/import | Bulk import doesn't get blocked by a single LLM failure; explicit `/auto-classify` still fails loud |
| `setClassification` on the service | Keeps ticket store writes encapsulated; no live-reference mutation from routes |
| Structured `contents` (role + delimiters) sent to Gemini | Reduces prompt-injection surface from user-supplied subject/description |

## Security & performance considerations

- API key only loaded from `.env` (`dotenv`); `.env` is gitignored.
- Body size limit: 5 MB (`express.json` and `rawBodyParser`).
- No user authentication — out of scope per TASKS.md.
- Map-backed list scans linearly; for ~1000 tickets the GET filter test asserts <100ms.
- Express 5 catches async errors automatically — no swallowed rejections.
- User-supplied content delivered to Gemini through a structured `contents` array with delimiters; the response schema constrains output enums.
