# RFC-001: Project setup, migrations, Nuxt config, Tailwind, TypeScript interfaces
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== RFC-001: Project Setup & Foundations ==="
echo ""

# --- Forbidden patterns in app/ ----------------------------------------------
count=$(grep -r ": any" "$ROOT/app/" --include="*.ts" --include="*.vue" 2>/dev/null | grep -vc "//.*: any" || true)
check_zero "No explicit ': any' in app/" "$count"

count=$(grep -rn "console\.log" "$ROOT/app/" --include="*.ts" --include="*.vue" 2>/dev/null | wc -l | tr -d ' ')
check_zero "No console.log in app/" "$count"

count=$(grep -rn "TODO\|FIXME\|HACK" "$ROOT/app/" --include="*.ts" --include="*.vue" 2>/dev/null | wc -l | tr -d ' ')
check_zero "No TODO/FIXME/HACK in app/" "$count"

count=$(grep -rn "SERVICE_KEY\|service_role" "$ROOT/app/" "$ROOT/nuxt.config.ts" 2>/dev/null | wc -l | tr -d ' ')
check_zero "SUPABASE_SERVICE_KEY not in client files" "$count"

count=$(grep -rn "v-html" "$ROOT/app/" --include="*.vue" 2>/dev/null | wc -l | tr -d ' ')
check_zero "No v-html in components" "$count"

count=$(grep -rn "from 'pinia'\|from \"pinia\"\|createPinia\|defineStore" "$ROOT/app/" 2>/dev/null | wc -l | tr -d ' ')
check_zero "No Pinia usage in app/" "$count"

# --- .gitignore --------------------------------------------------------------
if git -C "$ROOT" check-ignore .env &>/dev/null; then
  pass ".env is gitignored"
else
  fail ".env is gitignored"
fi

# --- Required root files -----------------------------------------------------
check_file "app/types/index.ts"
check_file "app/types/database.ts"
check_file "app/assets/css/main.css"
check_file "nuxt.config.ts"
check_file "app/app.vue"

# --- Migration files ---------------------------------------------------------
check_file "supabase/migrations/20260421000001_create_tables.sql"
check_file "supabase/migrations/20260421000002_rls_policies.sql"
check_file "supabase/migrations/20260421000003_trigger_balance.sql"
check_file "supabase/migrations/20260421000004_rpc_functions.sql"

# --- nuxt.config.ts content --------------------------------------------------
count=$(grep -c "redirect: false" "$ROOT/nuxt.config.ts" 2>/dev/null || echo 0)
check_nonzero "nuxt.config.ts: supabase redirect:false" "$count"

count=$(grep -c "@nuxtjs/supabase" "$ROOT/nuxt.config.ts" 2>/dev/null || echo 0)
check_nonzero "nuxt.config.ts: @nuxtjs/supabase in modules" "$count"

count=$(grep -c "@tailwindcss/vite\|tailwindcss" "$ROOT/nuxt.config.ts" 2>/dev/null || echo 0)
check_nonzero "nuxt.config.ts: Tailwind configured" "$count"

# --- Tailwind brand colors ---------------------------------------------------
for color in "brand-primary" "brand-success" "brand-warning" "brand-danger" "brand-muted"; do
  count=$(grep -c "$color" "$ROOT/app/assets/css/main.css" 2>/dev/null || echo 0)
  check_nonzero "Tailwind color defined: $color" "$count"
done

# --- TypeScript interfaces ---------------------------------------------------
for iface in "UserRole" "LeaveStatus" "Profile" "LeaveRequest" "LeaveType" "LeaveBalance" "Team"; do
  count=$(grep -c "export.*$iface\|$iface " "$ROOT/app/types/index.ts" 2>/dev/null || echo 0)
  check_nonzero "Interface/type exported: $iface" "$count"
done

# --- app.vue minimal ---------------------------------------------------------
count=$(grep -c "NuxtLayout\|NuxtPage" "$ROOT/app/app.vue" 2>/dev/null || echo 0)
check_nonzero "app.vue uses NuxtLayout + NuxtPage" "$count"
