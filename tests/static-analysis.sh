#!/usr/bin/env bash
# Static analysis — orchestrator. Runs all per-RFC check files.
# Run from project root: bash tests/static-analysis.sh
set -uo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATIC="$ROOT/tests/static"

pass()        { echo "  PASS  $1"; ((PASS++)) || true; }
fail()        { echo "  FAIL  $1"; ((FAIL++)) || true; }

check_zero() {
  local label="$1" count="$2"
  [[ "$count" -eq 0 ]] && pass "$label" || fail "$label ($count match(es) found)"
}

check_nonzero() {
  local label="$1" count="$2"
  [[ "$count" -gt 0 ]] && pass "$label" || fail "$label (not found)"
}

check_file() {
  [[ -f "$ROOT/$1" ]] && pass "File exists: $1" || fail "File missing: $1"
}

# Source each RFC check file in implementation order
source "$STATIC/rfc-001.sh"
source "$STATIC/rfc-003.sh"
source "$STATIC/rfc-004.sh"
source "$STATIC/rfc-005.sh"
source "$STATIC/rfc-006.sh"
source "$STATIC/rfc-007.sh"
source "$STATIC/rfc-008-009.sh"
source "$STATIC/rfc-011.sh"
source "$STATIC/rfc-015.sh"
source "$STATIC/rfc-016.sh"

# --- TypeScript compile ------------------------------------------------------
echo ""
echo "=== TypeScript check ==="
echo ""
if (cd "$ROOT" && yarn nuxt typecheck 2>&1); then
  pass "yarn nuxt typecheck"
else
  fail "yarn nuxt typecheck"
fi

# --- Summary -----------------------------------------------------------------
echo ""
echo "=== Results ==="
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo ""
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
