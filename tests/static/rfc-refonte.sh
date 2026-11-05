# Refonte WakaBods (lots R0 → R4): design system, i18n, leave pages
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== Refonte: design system and leave pages ==="
echo ""

# --- Design system loaded once, from the handoff copies -----------------------
check_file "app/assets/wb/tokens.css"
check_file "app/assets/wb/bundle.css"
check_file "app/assets/wb/icons.json"
count=$(grep -c 'wb/tokens.css\|wb/bundle.css' "$ROOT/app/assets/css/main.css" 2>/dev/null || echo 0)
check_nonzero "main.css: imports tokens.css and bundle.css" "$count"

# --- i18n: every French key exists in English ---------------------------------
missing=$(python3 - "$ROOT" <<'PY'
import json, sys
root = sys.argv[1]
def keys(d, p=''):
    for k, v in d.items():
        q = f'{p}.{k}' if p else k
        if isinstance(v, dict): yield from keys(v, q)
        else: yield q
fr = set(keys(json.load(open(f'{root}/i18n/locales/fr.json'))))
en = set(keys(json.load(open(f'{root}/i18n/locales/en.json'))))
print(len(fr ^ en))
PY
)
check_zero "fr.json and en.json have the same keys" "$missing"

# --- Pages of the refonte ------------------------------------------------------
for f in login forgot-password reset-password index leave-requests approvals calendar profile; do
  check_file "app/pages/$f.vue"
done
for c in LeaveCard LeaveRequestPanel LeaveDetailPanel ApprovalCard ApprovalQueue; do
  check_file "app/components/leave/$c.vue"
done

# --- Security-relevant invariants ---------------------------------------------
# useSupabaseUser() holds JWT claims: the user id is `sub` (TND-22)
count=$(grep -rn "user\.value?\.id\b\|supabaseUser\.value?\.id\b" "$ROOT/app" 2>/dev/null | wc -l | tr -d ' ')
check_zero "No user.value?.id (the JWT id is sub, TND-22)" "$count"

# Leave requests are only created and reviewed through the RPCs (lot 0)
count=$(grep -c "rpc('create_leave_request'" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null || echo 0)
check_nonzero "useLeaveRequests: creates through create_leave_request RPC" "$count"
count=$(grep -c "rpc('review_leave_request'" "$ROOT/app/composables/useLeaveRequests.ts" 2>/dev/null || echo 0)
check_nonzero "useLeaveRequests: reviews through review_leave_request RPC" "$count"
count=$(grep -rn "from('leave_requests')\.\(insert\|update\)" "$ROOT/app" 2>/dev/null | wc -l | tr -d ' ')
check_zero "No direct insert/update on leave_requests from the app" "$count"

# Approvals: managers never review their own request
count=$(grep -c "requesterId === meId" "$ROOT/app/composables/useApprovals.ts" 2>/dev/null || echo 0)
check_nonzero "useApprovals: own requests excluded from review" "$count"

# Refuse goes through a danger confirmation
count=$(grep -c 'tone="danger"' "$ROOT/app/components/leave/ApprovalQueue.vue" 2>/dev/null || echo 0)
check_nonzero "ApprovalQueue: refusal confirmed in a danger modal" "$count"

# Invoice PDF: opened in a tab created inside the click, without opener (TND-16)
count=$(grep -c "tab.opener = null" "$ROOT/app/pages/invoices.vue" 2>/dev/null || echo 0)
check_nonzero "invoices.vue: PDF tab opened without opener" "$count"
count=$(grep -c "application/pdf" "$ROOT/app/pages/invoices.vue" 2>/dev/null || echo 0)
check_nonzero "invoices.vue: only PDF files are uploaded" "$count"
