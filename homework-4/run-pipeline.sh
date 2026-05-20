#!/usr/bin/env bash
set -euo pipefail

# Single-command entry point for the 4-agent pipeline.
# Delegates orchestration to the /run-pipeline slash command.

cd "$(dirname "$0")"

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: 'claude' CLI not found. Install Claude Code first." >&2
  exit 1
fi

if [ ! -f context/bugs/001-notes-api/research/codebase-research.md ]; then
  echo "ERROR: missing research input (codebase-research.md)." >&2
  exit 1
fi

echo "▶ Starting 4-agent pipeline via /run-pipeline ..."
claude -p "/run-pipeline"
echo "✔ Pipeline finished. See context/bugs/001-notes-api/*.md for artifacts."
