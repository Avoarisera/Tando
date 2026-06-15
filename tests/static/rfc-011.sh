# RFC-011: Leave Types Management (F21, F22, F23)
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== RFC-011: Leave Types Management ==="
echo ""

# ── Required files ────────────────────────────────────────────────────────────

check_file "app/pages/leave-types.vue"

# ── Admin-only middleware ─────────────────────────────────────────────────────

count=$(grep -c "middleware.*admin-only" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: admin-only middleware declared in definePageMeta" "$count"

# ── fetchLeaveTypes(false) — admin loads ALL types including inactive ──────────

count=$(grep -c "fetchLeaveTypes(false)" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: fetchLeaveTypes(false) called on mount and retry" "$count"

# ── No delete button — deletion is out of scope ───────────────────────────────

count=$(grep -ic "supprimer" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_zero "leave-types.vue: no 'Supprimer' button (deletion out of scope)" "$count"

# ── Native <input type="color"> ───────────────────────────────────────────────

count=$(grep -c 'type="color"' "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'leave-types.vue: native <input type="color"> used (no third-party picker)' "$count"

# ── Double-click guard on toggle ──────────────────────────────────────────────

count=$(grep -c "togglingId" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: togglingId guard present (prevents concurrent toggles)" "$count"

# ── All-inactive warning banner ───────────────────────────────────────────────

count=$(grep -c "allDisabledWarning" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: allDisabledWarning computed + used in template" "$count"

# ── Brand-primary ring token (not hardcoded blue-600) ────────────────────────

count=$(grep -c "ring-blue-600" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_zero "leave-types.vue: no hardcoded ring-blue-600 (must use ring-brand-primary)" "$count"

count=$(grep -c "ring-brand-primary" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: focus ring uses ring-brand-primary token" "$count"

# ── No confirmation modal on toggle (reversible action) ──────────────────────

count=$(grep -c "AppConfirmModal" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_zero "leave-types.vue: no AppConfirmModal on toggle (reversible — not required)" "$count"

# ── 4 mandatory UI states ─────────────────────────────────────────────────────

count=$(grep -c "AppSkeleton" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: AppSkeleton present (loading state)" "$count"

count=$(grep -c "AppErrorBanner" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: AppErrorBanner present (error state)" "$count"

count=$(grep -c "AppEmptyState" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: AppEmptyState present (empty state)" "$count"

# ── Inline form error — errors stay in modal, not toast ──────────────────────

count=$(grep -c "formError" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: formError inline error (modal stays open on server error)" "$count"

# ── isSaving spinner guard ────────────────────────────────────────────────────

count=$(grep -c "isSaving" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: isSaving spinner guard (button disabled during submit)" "$count"

# ── Inactive rows at opacity-50 ───────────────────────────────────────────────

count=$(grep -c "opacity-50" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: opacity-50 applied to inactive rows" "$count"

# ── watch(editingType) pre-fills form ─────────────────────────────────────────

count=$(grep -c "watch(editingType" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-types.vue: watch(editingType) pre-fills form fields on edit" "$count"

# ── Forbidden patterns ────────────────────────────────────────────────────────

count=$(grep -cE "console\.log|TODO|FIXME|: any\b" "$ROOT/app/pages/leave-types.vue" 2>/dev/null); count=${count:-0}
check_zero "leave-types.vue: no console.log, TODO, FIXME, or :any" "$count"

count=$(grep -cE "console\.log|TODO|FIXME|: any\b" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_zero "useLeaveTypes.ts: no console.log, TODO, FIXME, or :any" "$count"

# ── Composable: mutation functions exported ───────────────────────────────────

count=$(grep -c "createLeaveType" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes.ts: createLeaveType function defined and exported" "$count"

count=$(grep -c "updateLeaveType" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes.ts: updateLeaveType function defined and exported" "$count"

count=$(grep -c "toggleLeaveType" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes.ts: toggleLeaveType function defined and exported" "$count"

# ── Composable: readonly() on exposed refs ────────────────────────────────────

count=$(grep -c "readonly(leaveTypes)" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes.ts: leaveTypes wrapped in readonly()" "$count"

count=$(grep -c "readonly(isLoading)" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes.ts: isLoading wrapped in readonly()" "$count"

count=$(grep -c "readonly(error)" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes.ts: error wrapped in readonly()" "$count"

# ── Composable: name.trim() before insert/update ─────────────────────────────

count=$(grep -c "trim()" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes.ts: name.trim() applied before insert/update (prevents whitespace names)" "$count"

# ── Composable: activeOnly=true default (employee form hides inactive) ────────

count=$(grep -c "activeOnly = true" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes.ts: fetchLeaveTypes defaults to activeOnly=true" "$count"

# ── onMounted after all function definitions (SFC order rule) ────────────────

onmounted_line=$(grep -n "onMounted" "$ROOT/app/pages/leave-types.vue" 2>/dev/null | head -1 | cut -d: -f1)
last_fn_line=$(grep -n "^async function\|^function" "$ROOT/app/pages/leave-types.vue" 2>/dev/null | tail -1 | cut -d: -f1)
if [[ -n "$onmounted_line" && -n "$last_fn_line" && "$onmounted_line" -gt "$last_fn_line" ]]; then
  pass "leave-types.vue: onMounted appears after all function definitions (SFC order)"
else
  fail "leave-types.vue: onMounted appears after all function definitions (onMounted:${onmounted_line:-?} lastFn:${last_fn_line:-?})"
fi
