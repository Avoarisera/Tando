# RFC-004: Layout & Navigation
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== RFC-004: Layout & Navigation ==="
echo ""

# --- Required files ----------------------------------------------------------
check_file "app/layouts/private.vue"
check_file "app/components/nav/AppSidebar.vue"
check_file "app/components/nav/AppMobileDrawer.vue"
check_file "app/components/app/AppButton.vue"
check_file "app/composables/useNavItems.ts"

# --- private.vue structure ---------------------------------------------------
count=$(grep -c "loadProfile" "$ROOT/app/layouts/private.vue" 2>/dev/null || echo 0)
check_nonzero "private.vue: calls loadProfile" "$count"

count=$(grep -c "hidden lg:flex\|lg:flex" "$ROOT/app/layouts/private.vue" 2>/dev/null || echo 0)
check_nonzero "private.vue: AppSidebar hidden on mobile (hidden lg:flex)" "$count"

count=$(grep -c "AppMobileDrawer" "$ROOT/app/layouts/private.vue" 2>/dev/null || echo 0)
check_nonzero "private.vue: includes AppMobileDrawer" "$count"

# --- AppSidebar.vue ----------------------------------------------------------
count=$(grep -c "useNavItems" "$ROOT/app/components/nav/AppSidebar.vue" 2>/dev/null || echo 0)
check_nonzero "AppSidebar.vue: uses useNavItems()" "$count"

count=$(grep -c "aria-current" "$ROOT/app/components/nav/AppSidebar.vue" 2>/dev/null || echo 0)
check_nonzero "AppSidebar.vue: aria-current on active link" "$count"

count=$(grep -c "signOut" "$ROOT/app/components/nav/AppSidebar.vue" 2>/dev/null || echo 0)
check_nonzero "AppSidebar.vue: calls signOut on Déconnexion" "$count"

# --- AppMobileDrawer.vue -----------------------------------------------------
count=$(grep -c 'role="dialog"' "$ROOT/app/components/nav/AppMobileDrawer.vue" 2>/dev/null || echo 0)
check_nonzero 'AppMobileDrawer.vue: role="dialog"' "$count"

count=$(grep -c 'aria-modal="true"' "$ROOT/app/components/nav/AppMobileDrawer.vue" 2>/dev/null || echo 0)
check_nonzero 'AppMobileDrawer.vue: aria-modal="true"' "$count"

count=$(grep -c 'aria-label="Ouvrir le menu"' "$ROOT/app/components/nav/AppMobileDrawer.vue" 2>/dev/null || echo 0)
check_nonzero 'AppMobileDrawer.vue: hamburger has aria-label="Ouvrir le menu"' "$count"

count=$(grep -c "route\.path" "$ROOT/app/components/nav/AppMobileDrawer.vue" 2>/dev/null || echo 0)
check_nonzero "AppMobileDrawer.vue: watches route.path to close on navigation" "$count"

count=$(grep -c "Escape" "$ROOT/app/components/nav/AppMobileDrawer.vue" 2>/dev/null || echo 0)
check_nonzero "AppMobileDrawer.vue: Escape key closes drawer" "$count"

count=$(grep -c "Teleport" "$ROOT/app/components/nav/AppMobileDrawer.vue" 2>/dev/null || echo 0)
check_nonzero "AppMobileDrawer.vue: uses Teleport to body" "$count"

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
count=$(grep -c "isAdmin\.value" "$ROOT/app/composables/useNavItems.ts" 2>/dev/null || echo 0)
check_nonzero "useNavItems.ts: admin branch guarded by isAdmin.value" "$count"

count=$(grep -c "leave-types" "$ROOT/app/composables/useNavItems.ts" 2>/dev/null || echo 0)
check_nonzero "useNavItems.ts: /leave-types link added for admin" "$count"

count=$(grep -c "Profil\|Demandes" "$ROOT/app/composables/useNavItems.ts" 2>/dev/null || echo 0)
check_nonzero "useNavItems.ts: French nav labels defined" "$count"

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
