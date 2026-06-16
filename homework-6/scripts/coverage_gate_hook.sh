#!/usr/bin/env bash
# PreToolUse hook: only gate Bash commands that perform a `git push`.
set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c "import sys, json; print(json.load(sys.stdin).get('tool_input', {}).get('command', ''))")"

case "$cmd" in
  *"git push"*)
    dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
    py="$dir/.venv/bin/python"
    [ -x "$py" ] || py="python3"
    if ! "$py" "$dir/scripts/coverage_gate.py" 1>&2; then
      echo "Coverage gate failed — push blocked (need >= 80%)." 1>&2
      exit 2
    fi
    ;;
esac
exit 0
