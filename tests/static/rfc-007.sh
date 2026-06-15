# RFC-007: Leave Request Creation
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== RFC-007: Leave Request Creation ==="
echo ""

# --- Required files ----------------------------------------------------------
check_file "app/composables/useLeaveTypes.ts"
check_file "app/composables/useLeaveRequests.ts"
check_file "app/composables/useDate.ts"
check_file "app/components/leave/LeaveRequestForm.vue"
check_file "app/components/leave/LeaveStatusBadge.vue"

# --- useLeaveTypes -----------------------------------------------------------
count=$(grep -c "readonly(leaveTypes)" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes: leaveTypes exposed as readonly" "$count"

count=$(grep -c "readonly(isLoading)" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes: isLoading exposed as readonly" "$count"

count=$(grep -c "readonly(error)" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes: error exposed as readonly" "$count"

count=$(grep -c "useState.*'leave-types'" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes: uses useState('leave-types') for shared state" "$count"

count=$(grep -c "\.eq('is_active', true)" "$ROOT/app/composables/useLeaveTypes.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveTypes: activeOnly filter uses .eq('is_active', true)" "$count"

# --- useLeaveRequests --------------------------------------------------------
count=$(grep -c "readonly(requests)" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveRequests: requests exposed as readonly" "$count"

count=$(grep -c "readonly(isLoading)" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveRequests: isLoading exposed as readonly" "$count"

count=$(grep -c "readonly(error)" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveRequests: error exposed as readonly" "$count"

count=$(grep -c "useState.*'leave-requests'" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveRequests: uses useState('leave-requests') for shared state" "$count"

count=$(grep -c "p_leave_type_id" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveRequests: RPC param p_leave_type_id present (exact name)" "$count"

count=$(grep -c "p_start_date" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveRequests: RPC param p_start_date present (exact name)" "$count"

count=$(grep -c "p_end_date" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveRequests: RPC param p_end_date present (exact name)" "$count"

count=$(grep -c "p_comment" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveRequests: RPC param p_comment present (exact name)" "$count"

count=$(grep -c "'create_leave_request'" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveRequests: calls rpc('create_leave_request')" "$count"

count=$(grep -c "ascending: false" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useLeaveRequests: orders by created_at descending" "$count"

# --- LeaveStatusBadge --------------------------------------------------------
for status in "pending" "manager_approved" "approved" "rejected"; do
  count=$(grep -c "$status" "$ROOT/app/components/leave/LeaveStatusBadge.vue" 2>/dev/null); count=${count:-0}
  check_nonzero "LeaveStatusBadge.vue: status '$status' defined" "$count"
done

count=$(grep -c ":title=" "$ROOT/app/components/leave/LeaveStatusBadge.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveStatusBadge.vue: :title= attribute bound for accessibility" "$count"

count=$(grep -c "bg-gray-100\|text-gray-700" "$ROOT/app/components/leave/LeaveStatusBadge.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveStatusBadge.vue: pending uses gray classes" "$count"

count=$(grep -c "bg-amber-100\|text-amber-700" "$ROOT/app/components/leave/LeaveStatusBadge.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveStatusBadge.vue: manager_approved uses amber classes" "$count"

count=$(grep -c "bg-green-100\|text-green-700" "$ROOT/app/components/leave/LeaveStatusBadge.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveStatusBadge.vue: approved uses green classes" "$count"

count=$(grep -c "bg-red-100\|text-red-700" "$ROOT/app/components/leave/LeaveStatusBadge.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveStatusBadge.vue: rejected uses red classes" "$count"

# --- LeaveRequestForm --------------------------------------------------------
count=$(grep -c 'role="alert"' "$ROOT/app/components/leave/LeaveRequestForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveRequestForm.vue: formError block has role="alert"' "$count"

count=$(grep -c 'formError' "$ROOT/app/components/leave/LeaveRequestForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveRequestForm.vue: formError reactive variable present' "$count"

count=$(grep -c ':min="today"' "$ROOT/app/components/leave/LeaveRequestForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveRequestForm.vue: start date input has :min="today"' "$count"

count=$(grep -c 'maxlength="500"' "$ROOT/app/components/leave/LeaveRequestForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveRequestForm.vue: comment textarea has maxlength=500' "$count"

count=$(grep -c 'isSubmitting' "$ROOT/app/components/leave/LeaveRequestForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveRequestForm.vue: isSubmitting state tracks in-flight submission' "$count"

count=$(grep -c 'animate-spin' "$ROOT/app/components/leave/LeaveRequestForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveRequestForm.vue: spinner present during submission' "$count"

count=$(grep -c "daysCount" "$ROOT/app/components/leave/LeaveRequestForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveRequestForm.vue: daysCount computed used for dynamic display' "$count"

count=$(grep -c "Math.max(0" "$ROOT/app/components/leave/LeaveRequestForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveRequestForm.vue: daysCount uses Math.max(0, ...) guard' "$count"

count=$(grep -c "emit('created')" "$ROOT/app/components/leave/LeaveRequestForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveRequestForm.vue: emits 'created' on success" "$count"

count=$(grep -c "toast.add" "$ROOT/app/components/leave/LeaveRequestForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'LeaveRequestForm.vue: calls toast.add on success' "$count"

# --- leave-requests.vue 4 UI states + guards ---------------------------------
count=$(grep -c "isLoading" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-requests.vue: loading state handled (isLoading)" "$count"

count=$(grep -c "AppErrorBanner" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-requests.vue: AppErrorBanner present (error state)" "$count"

count=$(grep -c "AppEmptyState" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-requests.vue: AppEmptyState present (empty state)" "$count"

count=$(grep -c "isEmployee" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-requests.vue: isEmployee used to gate 'Nouvelle demande' button" "$count"

count=$(grep -c "LeaveStatusBadge" "$ROOT/app/components/leave/LeaveRequestTable.vue" 2>/dev/null); count=${count:-0}
check_nonzero "LeaveRequestTable.vue: LeaveStatusBadge used in table rows" "$count"

count=$(grep -c "formatDate" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-requests.vue: formatDate used (no raw ISO dates in template)" "$count"

count=$(grep -c "LeaveRequestForm" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-requests.vue: LeaveRequestForm modal included" "$count"

count=$(grep -c "@retry" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-requests.vue: AppErrorBanner @retry handler wired" "$count"

count=$(grep -c "@created" "$ROOT/app/pages/leave-requests.vue" 2>/dev/null); count=${count:-0}
check_nonzero "leave-requests.vue: LeaveRequestForm @created closes modal + refreshes" "$count"

# --- useDate composable -------------------------------------------------------
count=$(grep -c "export function formatDate" "$ROOT/app/composables/useDate.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useDate.ts: formatDate exported as named function" "$count"

count=$(grep -c "'—'" "$ROOT/app/composables/useDate.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useDate.ts: returns em dash for null/undefined/empty" "$count"
