# RFC-004: Layout & Navigation
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== RFC-004: Layout & Navigation ==="
echo ""

# --- Required files ----------------------------------------------------------
check_file "app/layouts/private.vue"
check_file "app/components/wb/WbSidebar.vue"
check_file "app/components/wb/WbHeader.vue"
check_file "app/components/wb/WbTabBar.vue"
check_file "app/components/app/AppButton.vue"
check_file "app/composables/useNavItems.ts"

# --- private.vue structure (refonte R2: AppShell) ----------------------------
count=$(grep -c "loadProfile" "$ROOT/app/layouts/private.vue" 2>/dev/null || echo 0)
check_nonzero "private.vue: calls loadProfile" "$count"

count=$(grep -c "WbSidebar" "$ROOT/app/layouts/private.vue" 2>/dev/null || echo 0)
check_nonzero "private.vue: includes WbSidebar" "$count"

count=$(grep -c 'role="dialog"' "$ROOT/app/layouts/private.vue" 2>/dev/null || echo 0)
check_nonzero 'private.vue: admin drawer has role="dialog"' "$count"

count=$(grep -c 'aria-modal="true"' "$ROOT/app/layouts/private.vue" 2>/dev/null || echo 0)
check_nonzero 'private.vue: admin drawer has aria-modal="true"' "$count"

count=$(grep -c "Escape" "$ROOT/app/layouts/private.vue" 2>/dev/null || echo 0)
check_nonzero "private.vue: Escape key closes drawer" "$count"

count=$(grep -c "route\.path" "$ROOT/app/layouts/private.vue" 2>/dev/null || echo 0)
check_nonzero "private.vue: closes drawer on navigation" "$count"

# --- WbSidebar / WbUserMenu --------------------------------------------------
count=$(grep -c "aria-current" "$ROOT/app/components/wb/WbSidebar.vue" 2>/dev/null || echo 0)
check_nonzero "WbSidebar.vue: aria-current on active link" "$count"

count=$(grep -c "signOut" "$ROOT/app/components/wb/WbUserMenu.vue" 2>/dev/null || echo 0)
check_nonzero "WbUserMenu.vue: emits signOut on Déconnexion" "$count"

# --- AppButton.vue -----------------------------------------------------------
count=$(grep -c "withDefaults(defineProps" "$ROOT/app/components/app/AppButton.vue" 2>/dev/null || echo 0)
check_nonzero "AppButton.vue: typed props via withDefaults(defineProps<>())" "$count"

for variant in "primary" "secondary" "danger" "ghost"; do
  count=$(grep -c "'$variant'" "$ROOT/app/components/app/AppButton.vue" 2>/dev/null || echo 0)
  check_nonzero "AppButton.vue: '$variant' variant defined" "$count"
done

count=$(grep -c "disabled" "$ROOT/app/components/app/AppButton.vue" 2>/dev/null || echo 0)
check_nonzero "AppButton.vue: disabled prop and style handled" "$count"

count=$(grep -c "disabled:opacity-50\|disabled:cursor-not-allowed" "$ROOT/app/components/app/AppButton.vue" 2>/dev/null || echo 0)
check_nonzero "AppButton.vue: disabled state has visual indicator (opacity-50)" "$count"

# --- useNavItems.ts ----------------------------------------------------------
count=$(grep -c "admin:" "$ROOT/app/composables/useNavItems.ts" 2>/dev/null || echo 0)
check_nonzero "useNavItems.ts: admin menu defined" "$count"

count=$(grep -c "leave-types" "$ROOT/app/composables/useNavItems.ts" 2>/dev/null || echo 0)
check_nonzero "useNavItems.ts: /leave-types link present" "$count"

count=$(grep -c '"leaves": "Mes congés"' "$ROOT/i18n/locales/fr.json" 2>/dev/null || echo 0)
check_nonzero "fr.json: French nav labels defined" "$count"

# --- Pages use layout: 'private' --------------------------------------------
for page_name in "profile" "leave-requests" "calendar"; do
  count=$(grep -c "layout: 'private'" "$ROOT/app/pages/$page_name.vue" 2>/dev/null || echo 0)
  check_nonzero "pages/$page_name.vue: definePageMeta layout:'private'" "$count"
done

# --- useCurrentUser clears state on signOut ----------------------------------
count=$(grep -c "useState('leave-types')" "$ROOT/app/composables/useCurrentUser.ts" 2>/dev/null || echo 0)
check_nonzero "useCurrentUser.ts: clears leave-types state on signOut" "$count"

count=$(grep -c "useState('leave-balances')" "$ROOT/app/composables/useCurrentUser.ts" 2>/dev/null || echo 0)
check_nonzero "useCurrentUser.ts: clears leave-balances state on signOut" "$count"
