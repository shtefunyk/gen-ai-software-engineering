#!/usr/bin/env bash
# Zero-step demo: boots the API gateway, submits the sample transactions,
# prints each verdict and the pipeline summary, then shuts down. No manual steps.
set -euo pipefail

HW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HW_DIR"

PORT="${PORT:-8077}"
BASE_URL="http://127.0.0.1:${PORT}"
VENV_PY=".venv/bin/python"

echo "==> [1/5] Virtualenv + dependencies"
if [ ! -x "$VENV_PY" ]; then
  python3 -m venv .venv
fi
"$VENV_PY" -m pip install -q -r requirements.txt

echo "==> [2/5] Starting API gateway on ${BASE_URL}"
"$VENV_PY" -m uvicorn api.app:app --host 127.0.0.1 --port "$PORT" --log-level warning &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> [3/5] Waiting for /health"
for _ in $(seq 1 40); do
  if curl -sf "${BASE_URL}/health" >/dev/null 2>&1; then
    echo "    API is up."
    break
  fi
  sleep 0.5
done

echo "==> [4/5] Submitting sample transactions"
"$VENV_PY" - "$BASE_URL" <<'PYEOF'
import json, sys, urllib.request, urllib.error
base = sys.argv[1]
txns = json.load(open("sample-transactions.json", encoding="utf-8"))
print(f"    {'TXN':9} {'STATUS':12} REASON")
print("    " + "-" * 52)
for t in txns:
    data = json.dumps(t).encode()
    req = urllib.request.Request(base + "/transactions", data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        body = json.load(urllib.request.urlopen(req))
        print(f"    {body.get('transaction_id',''):9} {body.get('status',''):12} {body.get('reason','')}")
    except urllib.error.HTTPError as e:
        print(f"    {t.get('transaction_id',''):9} HTTP {e.code}")
PYEOF

echo
echo "==> [5/5] Pipeline summary"
if command -v jq >/dev/null 2>&1; then
  curl -s "${BASE_URL}/summary" | jq .
else
  curl -s "${BASE_URL}/summary" | "$VENV_PY" -m json.tool
fi

echo
echo "Note: TXN005 (75,000 wire) is BLOCKED by the configurable rule 'high_value_wire_block'."
echo "      Edit config/rules.yaml and re-run to watch the disposition change."
echo "Demo complete. Swagger UI: ${BASE_URL}/docs"
