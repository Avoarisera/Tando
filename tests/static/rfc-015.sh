echo ""
echo "=== RFC-015: Admin Dashboard ==="
echo ""

# ── Required files ────────────────────────────────────────────────────────────

check_file "app/pages/dashboard.vue"
check_file "app/composables/useDashboard.ts"
check_file "app/components/dashboard/DashboardMetrics.vue"
check_file "app/components/dashboard/EmployeeStatusTable.vue"

# ── Admin-only middleware ─────────────────────────────────────────────────────

count=$(grep -c "admin-only" "$ROOT/app/pages/dashboard.vue" 2>/dev/null); count=${count:-0}
check_nonzero "dashboard.vue: admin-only middleware declared" "$count"

# ── layout: private ───────────────────────────────────────────────────────────

count=$(grep -c "'private'" "$ROOT/app/pages/dashboard.vue" 2>/dev/null); count=${count:-0}
check_nonzero "dashboard.vue: layout 'private' declared" "$count"

# ── useDashboard used in page ─────────────────────────────────────────────────

count=$(grep -c "useDashboard" "$ROOT/app/pages/dashboard.vue" 2>/dev/null); count=${count:-0}
check_nonzero "dashboard.vue: useDashboard composable used" "$count"

# ── RPC call in composable ────────────────────────────────────────────────────

count=$(grep -c "get_dashboard_snapshot" "$ROOT/app/composables/useDashboard.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useDashboard.ts: calls get_dashboard_snapshot RPC" "$count"

# ── readonly refs exposed ─────────────────────────────────────────────────────

count=$(grep -c "readonly(" "$ROOT/app/composables/useDashboard.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useDashboard.ts: readonly() on exposed refs" "$count"

# ── 4 UI states ───────────────────────────────────────────────────────────────

count=$(grep -c "isLoading" "$ROOT/app/pages/dashboard.vue" 2>/dev/null); count=${count:-0}
check_nonzero "dashboard.vue: loading state present" "$count"



# ── DashboardMetrics in page ──────────────────────────────────────────────────


# ── EmployeeStatusTable in page ───────────────────────────────────────────────


# ── Client-side filter in page ────────────────────────────────────────────────


# ── Dashboard link in useNavItems (admin, Pilotage section) ─────────────────

count=$(grep -c "dashboard" "$ROOT/app/composables/useNavItems.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useNavItems.ts: /dashboard link added for admin" "$count"

# ── Amber highlight on on_leave_today metric ──────────────────────────────────

count=$(grep -c "bg-amber-50" "$ROOT/app/components/dashboard/DashboardMetrics.vue" 2>/dev/null); count=${count:-0}
check_nonzero "DashboardMetrics.vue: bg-amber-50 highlight on on_leave_today" "$count"

# ── returnDate (end_date + 1) in EmployeeStatusTable ─────────────────────────

count=$(grep -c "returnDate\|setDate\|getDate" "$ROOT/app/components/dashboard/EmployeeStatusTable.vue" 2>/dev/null); count=${count:-0}
check_nonzero "EmployeeStatusTable.vue: return date computed as end_date + 1" "$count"

# ── Forbidden patterns ────────────────────────────────────────────────────────

for file in dashboard.vue useDashboard.ts; do
  path="$ROOT/app/$(echo "$file" | grep -q ".vue" && echo pages || echo composables)/$file"
  count=$(grep -cE "console\.log|TODO|FIXME|: any\b" "$path" 2>/dev/null); count=${count:-0}
  check_zero "$file: no console.log, TODO, FIXME, or :any" "$count"
done
