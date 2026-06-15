# RFC-008 & RFC-009: Leave Request Views + Admin Leave Management
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== RFC-008/009: Leave Request Views & Admin Management ==="
echo ""

# --- Required files ----------------------------------------------------------
check_file "app/components/leave/LeaveRequestTable.vue"
check_file "app/components/leave/LeaveAdminView.vue"

# --- types/index.ts ----------------------------------------------------------
count=$(grep -c "AdminConfirmAction" "$ROOT/app/types/index.ts" 2>/dev/null); count=${count:-0}
check_nonzero "types/index.ts: AdminConfirmAction exported" "$count"

count=$(grep -c "currentStatus" "$ROOT/app/types/index.ts" 2>/dev/null); count=${count:-0}
check_nonzero "types/index.ts: AdminConfirmAction.currentStatus field present" "$count"

# --- LeaveAdminView computed properties --------------------------------------
count=$(grep -c "canTakeAction" "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveAdminView.vue: canTakeAction function present" "$count"

count=$(grep -c "filteredRequests" "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveAdminView.vue: filteredRequests computed present" "$count"

count=$(grep -c "adminConfirmTitle" "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveAdminView.vue: adminConfirmTitle computed present" "$count"

# --- FILTER_OPTIONS typing ---------------------------------------------------
count=$(grep -c "as const satisfies" "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveAdminView.vue: FILTER_OPTIONS typed with 'as const satisfies'" "$count"

# --- Status filter select accessibility --------------------------------------
count=$(grep -c 'id="status-filter"' "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveAdminView.vue: select has id="status-filter"' "$count"

count=$(grep -c 'for="status-filter"' "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveAdminView.vue: label[for="status-filter"] present' "$count"

# --- 5 filter options --------------------------------------------------------
count=$(grep -c "'all'\|'pending'\|'manager_approved'\|'approved'\|'rejected'" "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveAdminView.vue: all 5 FILTER_OPTIONS values defined" "$count"

# --- Admin-reviewed fields set on approve/reject -----------------------------
count=$(grep -c "admin_reviewed_by" "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveAdminView.vue: admin_reviewed_by field set on action" "$count"

count=$(grep -c "admin_reviewed_at" "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveAdminView.vue: admin_reviewed_at field set on action" "$count"

# --- Bypass wording ----------------------------------------------------------
count=$(grep -c "sans validation manager" "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveAdminView.vue: bypass wording 'sans validation manager' present" "$count"

# --- Admin toast messages ----------------------------------------------------
count=$(grep -c "solde mis à jour" "$ROOT/app/components/leave/LeaveAdminView.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveAdminView.vue: success toast mentions 'solde mis à jour' on approve" "$count"

# --- leave-requests.vue delegates admin view ---------------------------------
count=$(grep -c "LeaveAdminView" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-requests.vue: delegates to LeaveAdminView component" "$count"

# --- onMounted after function definitions (SFC order rule) ------------------
onmounted_line=$(grep -n "onMounted" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null | tail -1 | cut -d: -f1)
last_fn_line=$(grep -n "^function\|^async function" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null | tail -1 | cut -d: -f1)
if [[ -n "$onmounted_line" && -n "$last_fn_line" && "$onmounted_line" -gt "$last_fn_line" ]]; then
  pass "leave-requests.vue: onMounted appears after all function definitions (SFC order)"
else
  fail "leave-requests.vue: onMounted appears after all function definitions (SFC order) (onMounted:${onmounted_line} lastFn:${last_fn_line})"
fi
