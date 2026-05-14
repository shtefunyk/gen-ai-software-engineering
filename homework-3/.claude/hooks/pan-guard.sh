#!/usr/bin/env bash
# pan-guard.sh — PreToolUse hook for Claude Code in homework-3/
#
# Scans the JSON tool input arriving on stdin for plaintext digit sequences
# that look like a PAN (13–19 digits, Luhn-valid), then BLOCKs unless every
# detected sequence starts with a whitelisted test BIN.
#
# Test BIN allowlist (industry-canonical):
#   4242 — Stripe / generic Visa test
#   4111 — Visa test
#   5555 — Mastercard test
#   4000 — Visa test (with extras for decline scenarios)
#   2223 — Mastercard 2-series test
#
# Exit codes:
#   0  — allow
#   2  — block (Claude Code reads stderr and surfaces to the model)

set -euo pipefail

# Read the entire stdin payload.
INPUT="$(cat)"

# Extract candidate digit runs of length 13–19, allowing spaces or hyphens
# as group separators (common in display formatting). After extraction we
# strip non-digits before Luhn checking.
#
# grep -oE returns one match per line.
CANDIDATES="$(printf '%s' "$INPUT" | grep -oE '[0-9](([ -]?[0-9]){12,18})' || true)"

if [ -z "$CANDIDATES" ]; then
  exit 0
fi

# Luhn check on a digit-only string. Returns 0 if valid, 1 otherwise.
luhn_check() {
  local digits="$1"
  local len=${#digits}
  local sum=0
  local i parity d doubled
  parity=$(( len % 2 ))
  for (( i=0; i<len; i++ )); do
    d=${digits:$i:1}
    if [ $(( i % 2 )) -eq $parity ]; then
      doubled=$(( d * 2 ))
      [ $doubled -gt 9 ] && doubled=$(( doubled - 9 ))
      sum=$(( sum + doubled ))
    else
      sum=$(( sum + d ))
    fi
  done
  [ $(( sum % 10 )) -eq 0 ]
}

ALLOWED_PREFIXES=(4242 4111 5555 4000 2223)

is_allowed_test_bin() {
  local digits="$1"
  local prefix
  prefix=${digits:0:4}
  for allowed in "${ALLOWED_PREFIXES[@]}"; do
    if [ "$prefix" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

VIOLATIONS=()

while IFS= read -r raw; do
  [ -z "$raw" ] && continue
  digits="${raw//[^0-9]/}"
  len=${#digits}
  # PAN length sanity: 13–19 inclusive.
  if [ "$len" -lt 13 ] || [ "$len" -gt 19 ]; then
    continue
  fi
  if luhn_check "$digits"; then
    if ! is_allowed_test_bin "$digits"; then
      VIOLATIONS+=("$digits")
    fi
  fi
done <<< "$CANDIDATES"

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  {
    echo "BLOCK: pan-guard detected potential PAN(s) outside the test-BIN allowlist."
    echo ""
    echo "Disallowed sequences (Luhn-valid, non-test BIN):"
    for v in "${VIOLATIONS[@]}"; do
      echo "  - ${v:0:6}…${v: -4}  (length=${#v})"
    done
    echo ""
    echo "Allowed test BIN prefixes: ${ALLOWED_PREFIXES[*]}"
    echo "If this is a legitimate non-PAN value (e.g. UUID-derived integer),"
    echo "split or reformat it so it no longer matches PAN heuristics."
    echo "See homework-3/CLAUDE.md §2 (NEVER use real PAN) and §5 (NEVER bypass hooks)."
  } >&2
  exit 2
fi

exit 0
