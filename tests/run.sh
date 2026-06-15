#!/usr/bin/env bash
# Master test runner
# Run from project root: bash tests/run.sh
#
# Options:
#   --static-only    Run only static analysis (no DB required)
#   --db-only        Run only DB tests (requires local Supabase running)
#   --rls-only       Run only RLS integration tests (requires seed)
#   --skip-rls       Skip RLS integration (useful before seed is applied)
#   --skip-e2e       Skip Playwright e2e tests (useful in headless/CI without browser)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DB_CONTAINER="supabase_db_waka-bods"

# psql is inside the Supabase Docker container — no local install required
if docker exec "$DB_CONTAINER" psql --version &>/dev/null 2>&1; then
  PSQL="docker exec $DB_CONTAINER psql -U postgres -d postgres"
elif psql --version &>/dev/null 2>&1; then
  PSQL="psql $DB_URL"
else
  PSQL=""
fi

STATIC_ONLY=false
DB_ONLY=false
RLS_ONLY=false
SKIP_RLS=false
SKIP_E2E=false

for arg in "$@"; do
  case $arg in
    --static-only) STATIC_ONLY=true ;;
    --db-only)     DB_ONLY=true ;;
    --rls-only)    RLS_ONLY=true ;;
    --skip-rls)    SKIP_RLS=true ;;
    --skip-e2e)    SKIP_E2E=true ;;
  esac
done

OVERALL_FAIL=0

# Run a SQL file against the DB.
# When $PSQL is a docker exec command, -f expects a path inside the container,
# so we pipe via stdin instead.
psql_file() {
  local file="$1"
  if [[ "$PSQL" == docker* ]]; then
    cat "$file" | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres
  else
    $PSQL -f "$file"
  fi
}

run_step() {
  local label="$1"
  local cmd="$2"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $label"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if eval "$cmd"; then
    echo "  → Step passed"
  else
    echo "  → Step FAILED"
    ((OVERALL_FAIL++)) || true
  fi
}

# ============================================================
# Step 1: Static analysis (no DB needed)
# ============================================================
if ! $DB_ONLY && ! $RLS_ONLY; then
  run_step "1/4 Static Analysis" "bash '$ROOT/tests/static-analysis.sh'"
fi

if $STATIC_ONLY; then
  echo ""
  [[ $OVERALL_FAIL -eq 0 ]] && echo "All checks passed." || echo "$OVERALL_FAIL step(s) failed."
  exit $OVERALL_FAIL
fi

# ============================================================
# Step 2: Check local Supabase is running
# ============================================================
if ! $RLS_ONLY; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Checking local Supabase connection..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [[ -z "$PSQL" ]]; then
    echo "  → psql not found (neither local nor in Docker container $DB_CONTAINER)"
    echo "     Ensure Supabase is running: npx supabase start"
    OVERALL_FAIL=$((OVERALL_FAIL + 1))
    echo ""
    echo "Skipping DB tests (psql unavailable)."
    exit $OVERALL_FAIL
  elif $PSQL -c "SELECT 1" &>/dev/null; then
    echo "  → Connected ($PSQL)"
  else
    echo "  → Cannot connect to local Supabase"
    echo "     Run: npx supabase start"
    echo "     Then: npx supabase db reset (to apply migrations)"
    OVERALL_FAIL=$((OVERALL_FAIL + 1))
    echo ""
    echo "Skipping DB tests (connection unavailable)."
    exit $OVERALL_FAIL
  fi
fi

# ============================================================
# Step 3: DB tests (trigger + RPC + RLS via SQL)
# ============================================================
if ! $RLS_ONLY; then
  run_step "2/4 Trigger Tests" \
    "psql_file '$ROOT/supabase/tests/001_trigger_tests.sql' 2>&1 | grep -E 'PASS|FAIL|WARNING|ERROR'"

  run_step "3/4 RPC Tests" \
    "psql_file '$ROOT/supabase/tests/002_rpc_tests.sql' 2>&1 | grep -E 'PASS|FAIL|WARNING|ERROR'"

  run_step "4a/4 RLS SQL Tests" \
    "psql_file '$ROOT/supabase/tests/003_rls_tests.sql' 2>&1 | grep -E 'PASS|FAIL|WARNING|ERROR'"

  run_step "4b/4 RPC Message Format Tests (RFC-007)" \
    "psql_file '$ROOT/supabase/tests/004_rpc_message_format_tests.sql' 2>&1 | grep -E 'PASS|FAIL|WARNING|ERROR'"
fi

# ============================================================
# Step 4: RLS integration tests (requires seed + running Nuxt Supabase)
# ============================================================
if ! $SKIP_RLS && ! $DB_ONLY; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  4b/4 RLS Integration Tests (requires RFC-002 seed)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [[ -f "$ROOT/.env" ]]; then
    if node --env-file="$ROOT/.env" "$ROOT/tests/rls-integration.mjs"; then
      echo "  → Step passed"
    else
      echo "  → Step FAILED (or seed not applied — run RFC-002 first)"
      ((OVERALL_FAIL++)) || true
    fi
  else
    echo "  → Skipped: .env not found"
  fi
else
  echo ""
  if $DB_ONLY; then
    echo "  4b/4 RLS Integration Tests — SKIPPED (--db-only)"
  else
    echo "  4b/4 RLS Integration Tests — SKIPPED (--skip-rls)"
  fi
fi

# ============================================================
# Step 5: Playwright E2E tests (requires local Supabase + yarn dev)
# ============================================================
if ! $STATIC_ONLY && ! $DB_ONLY && ! $RLS_ONLY && ! $SKIP_E2E; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  5/5 Playwright E2E Tests (requires yarn dev + seed)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if (cd "$ROOT" && yarn playwright test --max-failures=2 2>&1); then
    echo "  → Step passed"
  else
    echo "  → Step FAILED"
    ((OVERALL_FAIL++)) || true
  fi
else
  if $SKIP_E2E; then
    echo ""
    echo "  5/5 Playwright E2E — SKIPPED (--skip-e2e)"
  fi
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "════════════════════════════════════════════════"
if [[ $OVERALL_FAIL -eq 0 ]]; then
  echo "  ALL STEPS PASSED"
else
  echo "  $OVERALL_FAIL STEP(S) FAILED"
fi
echo "════════════════════════════════════════════════"
echo ""
exit $OVERALL_FAIL
