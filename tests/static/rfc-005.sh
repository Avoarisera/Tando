# RFC-005: Profile & Leave Balance Display
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== RFC-005: Profile & Leave Balance Display ==="
echo ""

# --- Required files ----------------------------------------------------------
check_file "app/components/app/AppSkeleton.vue"
check_file "app/components/app/AppErrorBanner.vue"
check_file "app/components/app/AppEmptyState.vue"
check_file "app/components/app/AppBadge.vue"
check_file "app/components/leave/LeaveBalanceCard.vue"
check_file "app/composables/useLeaveBalances.ts"

# --- types/index.ts ----------------------------------------------------------
count=$(grep -c "LeaveBalanceWithType" "$ROOT/app/types/index.ts" 2>/dev/null); count=${count:-0}
check_nonzero "types/index.ts: LeaveBalanceWithType exported" "$count"

# --- useLeaveBalances composable ---------------------------------------------
count=$(grep -c "readonly(balances)" "$ROOT/app/composables/useLeaveBalances.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveBalances: balances exposed as readonly" "$count"

count=$(grep -c "readonly(isLoading)" "$ROOT/app/composables/useLeaveBalances.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveBalances: isLoading exposed as readonly" "$count"

count=$(grep -c "readonly(error)" "$ROOT/app/composables/useLeaveBalances.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveBalances: error exposed as readonly" "$count"

count=$(grep -c "useState.*'leave-balances'" "$ROOT/app/composables/useLeaveBalances.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveBalances: uses useState('leave-balances') for shared state" "$count"

count=$(grep -c "\.eq('year'" "$ROOT/app/composables/useLeaveBalances.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveBalances: filters by year (current year only)" "$count"

# --- profile.vue -------------------------------------------------------------
count=$(grep -c "layout: 'private'" "$ROOT/app/pages/profile.vue" 2>/dev/null); count=${count:-0}
check_nonzero "profile.vue: definePageMeta layout:'private'" "$count"

count=$(grep -c "isAdmin" "$ROOT/app/pages/profile.vue" 2>/dev/null); count=${count:-0}
check_nonzero "profile.vue: isAdmin used to hide balance section" "$count"

count=$(grep -c "isProfileLoading" "$ROOT/app/pages/profile.vue" 2>/dev/null); count=${count:-0}
check_nonzero "profile.vue: isProfileLoading tracks profile fetch state" "$count"

count=$(grep -c "profileError" "$ROOT/app/pages/profile.vue" 2>/dev/null); count=${count:-0}
check_nonzero "profile.vue: profileError tracks profile fetch error" "$count"

count=$(grep -c "AppEmptyState" "$ROOT/app/pages/profile.vue" 2>/dev/null); count=${count:-0}
check_nonzero "profile.vue: AppEmptyState used (empty states present)" "$count"

count=$(grep -c "balancesLoading\|balancesError" "$ROOT/app/pages/profile.vue" 2>/dev/null); count=${count:-0}
check_nonzero "profile.vue: balance section has loading + error states" "$count"

count=$(grep -c "fetchBalances" "$ROOT/app/pages/profile.vue" 2>/dev/null); count=${count:-0}
check_nonzero "profile.vue: fetchBalances referenced" "$count"

count=$(grep -c "currentYear" "$ROOT/app/pages/profile.vue" 2>/dev/null); count=${count:-0}
check_nonzero "profile.vue: currentYear const used (no new Date() in template)" "$count"

count=$(grep -c "useSupabaseUser" "$ROOT/app/pages/profile.vue" 2>/dev/null); count=${count:-0}
check_nonzero "profile.vue: useSupabaseUser() used for email field" "$count"

# --- AppBadge variants -------------------------------------------------------
for variant in "gray" "blue" "green" "red" "amber"; do
  count=$(grep -c "'$variant'" "$ROOT/app/components/app/AppBadge.vue" 2>/dev/null); count=${count:-0}
  check_nonzero "AppBadge.vue: '$variant' variant defined" "$count"
done

# AppSkeleton must NOT have h-5 as default class
count=$(grep -c "h-5" "$ROOT/app/components/app/AppSkeleton.vue" 2>/dev/null); count=${count:-0}
check_zero "AppSkeleton.vue: no default h-5 class (height must be passed via prop)" "$count"

# LeaveBalanceCard: Math.max guard for remaining days
count=$(grep -c "Math.max" "$ROOT/app/components/leave/LeaveBalanceCard.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveBalanceCard.vue: Math.max(0, ...) guards remainingDays" "$count"
