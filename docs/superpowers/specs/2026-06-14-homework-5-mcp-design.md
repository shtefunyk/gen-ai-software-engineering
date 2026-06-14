# Homework 5 — MCP Servers — Design

**Date:** 2026-06-14
**Author:** Bohdan Shtefunyk
**Branch:** `homework-5-submission`

## High-level objective

Configure three external MCP servers (GitHub, Filesystem, Notion) and build one
custom FastMCP server, all usable from Claude Code, and capture screenshots of a
real call against each.

## Key decisions

| Topic | Decision | Why |
|---|---|---|
| MCP client | Claude Code | What the student uses day-to-day |
| Registration (approach A) | Canonical `homework-5/.mcp.json`; repo-root `.mcp.json` is a **symlink** to it | One source of truth; servers actually load in the repo session; file is the graded deliverable |
| Task 3 service | **Notion** (hosted, OAuth) | Allowed by the assignment; already used by the student; OAuth means **no token in any file** |
| GitHub auth | Official remote server `https://api.githubcopilot.com/mcp/` + `Authorization: Bearer ${GITHUB_TOKEN}` | Token comes from `gh auth token`, injected via env expansion — never written to a file |
| Filesystem | `npx @modelcontextprotocol/server-filesystem <repo>` | Official, no secret, exposes this repo |
| Custom server | Python 3.13 venv + `fastmcp` | Assignment mandates FastMCP |
| Secrets | `${ENV}` expansion only; `.gitignore` + `.githooks/pre-commit` secret guard | Hard requirement: no API keys in git |

## Architecture

```
Claude Code
   │  reads .mcp.json (repo root symlink → homework-5/.mcp.json)
   ├── github      → HTTP  https://api.githubcopilot.com/mcp/   (Bearer ${GITHUB_TOKEN})
   ├── filesystem  → stdio npx @modelcontextprotocol/server-filesystem <repo>
   ├── notion      → HTTP  https://mcp.notion.com/mcp           (browser OAuth)
   └── lorem-custom→ stdio .venv/bin/python custom-mcp-server/server.py
```

## Custom FastMCP server (Task 4)

- `lorem-ipsum.md` — source text (~120 words).
- Resource `lorem://words` → first 30 words (default).
- Resource template `lorem://words/{word_count}` → first N words.
- Tool `read(word_count: int = 30)` → same word-limited text, callable by Claude.
- Returns exactly `word_count` words (capped at what the file holds, clamped at 0).

**Resources vs Tools (for the docs):**
- *Resource* = a URI Claude can read from (like a file/API endpoint).
- *Tool* = an action Claude can call to perform an operation.

## File layout

```
homework-5/
├── README.md
├── HOWTORUN.md
├── .mcp.json                     # all 4 servers (env placeholders, no secrets)
├── .env.example                  # documents required env vars
├── custom-mcp-server/
│   ├── server.py
│   ├── lorem-ipsum.md
│   ├── requirements.txt          # fastmcp
│   └── .venv/                     # gitignored
└── docs/screenshots/             # 4 screenshots land here
```

## Secret handling

- No file in the repo contains a real token.
- `GITHUB_TOKEN` exported in the shell (`export GITHUB_TOKEN=$(gh auth token)`).
- Notion uses browser OAuth — no token at all.
- `.githooks/pre-commit` blocks commits whose staged diff matches token patterns
  (`gh[pousr]_…`, `github_pat_…`, `ntn_…`, `secret_…`, AWS, Slack).

## Screenshot plan (4, in `docs/screenshots/`)

| File | Call captured |
|---|---|
| `github-mcp-result.png` | list recent PRs / commits of the fork |
| `filesystem-mcp-result.png` | list / read a file in the repo |
| `jira-or-notion-mcp-result.png` | "last 5 bugs" against a demo Notion **Bugs** DB (numbers only) |
| `custom-mcp-read-tool-result.png` | `read` tool returning N words from `lorem-ipsum.md` |

## Testing

- `server.py` runs standalone (venv python) without protocol errors.
- A small local harness verifies the word-count logic (exactly N words, clamping).
- Each MCP server appears connected in Claude Code `/mcp` after restart.
