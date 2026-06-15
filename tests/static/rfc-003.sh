# RFC-003: Authentication & Routing
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== RFC-003: Authentication & Routing ==="
echo ""

# --- Required files ----------------------------------------------------------
check_file "app/middleware/auth.global.ts"
check_file "app/middleware/admin-only.ts"
check_file "app/composables/useCurrentUser.ts"
check_file "app/pages/login.vue"
check_file "app/pages/profile.vue"
check_file "app/pages/leave-requests.vue"
check_file "app/pages/calendar.vue"
check_file "app/pages/leave-types.vue"

# --- useCurrentUser composable -----------------------------------------------
count=$(grep -c "readonly(profile)" "$ROOT/app/composables/useCurrentUser.ts" 2>/dev/null || echo 0)
check_nonzero "useCurrentUser: profile exposed as readonly" "$count"

count=$(grep -c "if (error) throw error" "$ROOT/app/composables/useCurrentUser.ts" 2>/dev/null || echo 0)
check_nonzero "useCurrentUser: loadProfile checks Supabase error" "$count"

count=$(grep -c "useState('current-profile')" "$ROOT/app/composables/useCurrentUser.ts" 2>/dev/null || echo 0)
check_nonzero "useCurrentUser: clears current-profile on signOut" "$count"

# --- Middleware correctness --------------------------------------------------
count=$(grep -c "useSupabaseUser" "$ROOT/app/middleware/auth.global.ts" 2>/dev/null || echo 0)
check_nonzero "auth.global.ts: uses useSupabaseUser (not JWT)" "$count"

count=$(grep -c "createError" "$ROOT/app/middleware/admin-only.ts" 2>/dev/null || echo 0)
check_nonzero "admin-only.ts: throws createError for 403" "$count"

count=$(grep -c "403" "$ROOT/app/middleware/admin-only.ts" 2>/dev/null || echo 0)
check_nonzero "admin-only.ts: status code is 403" "$count"

count=$(grep -c "admin-only" "$ROOT/app/pages/leave-types.vue" 2>/dev/null || echo 0)
check_nonzero "leave-types.vue: admin-only middleware applied" "$count"

count=$(grep -c "layout: false" "$ROOT/app/pages/login.vue" 2>/dev/null || echo 0)
check_nonzero "login.vue: definePageMeta layout:false" "$count"
