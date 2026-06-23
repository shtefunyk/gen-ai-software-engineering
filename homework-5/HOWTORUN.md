# HOWTORUN — Homework 5 (MCP Servers)

Step-by-step: install the custom server, set the environment, connect all four
MCP servers to Claude Code, and run a call against each.

## Prerequisites

- **Claude Code** (the MCP client used here)
- **Node.js** + `npx` (for the official GitHub/Filesystem servers)
- **Python 3.10+** (3.13 used here) for the custom FastMCP server
- **`gh` CLI**, logged in (`gh auth status`) — source of the GitHub token

All commands below are run from the repository root unless noted.

---

## 1. Build & test the custom MCP server

```bash
cd homework-5/custom-mcp-server
python3.13 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r requirements.txt   # installs fastmcp

# verify it works without Claude Code:
./.venv/bin/python test_server.py
# -> ALL OK ✅
```

`fastmcp` is the only dependency (see `requirements.txt`).

## 2. Set the environment (GitHub token)

You do **not** create or copy a token by hand. You are already logged into the
`gh` CLI, so `gh auth token` *is* your token. It is never written to a repo file;
`.mcp.json` only references `${GITHUB_TOKEN}`.

The robust way (works on every Claude Code launch) — add one line to `~/.zshrc`:

```bash
echo 'export GITHUB_TOKEN=$(gh auth token 2>/dev/null)' >> ~/.zshrc
source ~/.zshrc        # or just open a new terminal
```

Verify a new shell has it (prints a `gho_…` prefix, not empty):

```bash
zsh -ic 'echo ${GITHUB_TOKEN:0:4}'
```

> One-off alternative (must be the same shell you launch Claude Code from):
> `export GITHUB_TOKEN=$(gh auth token)`. The `.zshrc` line is preferred so the
> token is present even after restarts. See `.env.example`.

Notion needs no token here (browser OAuth in step 4).

## 3. Confirm the config is in place

The four servers are registered in `homework-5/.mcp.json`, and a symlink at the
repo root makes Claude Code load them for the whole repo:

```bash
ls -l .mcp.json                 # -> .mcp.json -> homework-5/.mcp.json
python3 -c "import json;print(list(json.load(open('.mcp.json'))['mcpServers']))"
# -> ['github', 'filesystem', 'notion', 'lorem-custom']
```

> The absolute paths in `.mcp.json` (filesystem root, custom-server venv python)
> are machine-specific — adjust them if you clone elsewhere.

## 4. Connect in Claude Code

1. **Restart Claude Code** from the repo root so `.mcp.json` is picked up.
2. Run `/mcp` — you should see `github`, `filesystem`, `notion`, `lorem-custom`.
3. For **notion**, choose *Authenticate* and complete the browser OAuth flow.
4. (Optional) create a small **Bugs** database in Notion with a few rows so the
   "last 5 bugs" query has data to return.

## 5. Run one call per server (then screenshot — see step 6)

Prompt Claude Code with each of these:

| Server | Example prompt |
|---|---|
| **github** | "Using the github MCP, list the 5 most recent commits on this repo." |
| **filesystem** | "Using the filesystem MCP, list the files in `homework-5/`." |
| **notion** | "Give me the tickets/pages of the last 5 bugs on my project." |
| **lorem-custom** | "Call the `read` tool with word_count 12 and show the result." |

## 6. Capture the screenshots

Save each call's request **and** result to `homework-5/docs/screenshots/`:

| File | Server |
|---|---|
| `github-mcp-result.png` | github |
| `filesystem-mcp-result.png` | filesystem |
| `jira-or-notion-mcp-result.png` | notion |
| `custom-mcp-read-tool-result.png` | lorem-custom |

macOS capture: `Cmd+Shift+4` (region) or `Cmd+Shift+4` then `Space` (window).

---

## Troubleshooting

- **github shows auth error** → `GITHUB_TOKEN` not exported in the launching
  shell. Re-run `export GITHUB_TOKEN=$(gh auth token)` and restart.
- **lorem-custom fails to start** → recreate the venv (step 1); confirm the
  `command` path in `.mcp.json` points to `.venv/bin/python`.
- **notion returns nothing** → finish the OAuth flow and ensure the integration
  has access to your Bugs database/page.
