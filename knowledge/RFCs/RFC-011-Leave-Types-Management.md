# RFC-011 — Leave Types Management + Balance Administration

**ID:** RFC-011  
**Title:** Admin Leave Types (List, Create/Edit, Toggle) + Leave Balance Management  
**Sprint:** 3  
**Complexity:** Medium (Phase 1 Low ✅ + Phase 2 Medium 🔄)  
**Predecessor:** RFC-010  
**Successor:** RFC-012

---

## Summary

This RFC covers the `/leave-types` admin page in two phases.

**Phase 1 — Done (F21, F22, F23):** list all leave types, create/edit via modal, toggle active/inactive status.

**Phase 2 — To implement (F31):** a "Soldes" tab on the same page that lets the admin view and edit the `allocated_days` balance for every employee × type × year, and bulk-set a quota for all employees for a given type. Also hooks into `createLeaveType` so a new type immediately creates zero-balance rows for every employee.

---

## Features Addressed

| Feature | Description | Status |
|---------|-------------|--------|
| F21 | Liste des types de congé | ✅ Done |
| F22 | Ajout et modification de types de congé | ✅ Done (balance init missing — fixed in Phase 2) |
| F23 | Désactivation / réactivation de types de congé | ✅ Done |
| F31 | Gestion des soldes par l'admin | 🔄 To implement |

---

## Implementation Status

### Phase 1 — Completed files

```
app/
├── pages/
│   └── leave-types.vue          ✅ full implementation (single-section, no tabs yet)
└── composables/
    └── useLeaveTypes.ts          ✅ fetchLeaveTypes, createLeaveType, updateLeaveType, toggleLeaveType
```

### Phase 2 — Files to create or modify

```
supabase/migrations/
└── 20260427XXXXXX_rpc_upsert_leave_balances.sql   ← new migration

app/
├── pages/
│   └── leave-types.vue           ← add tab shell + "Soldes" tab content
├── composables/
│   ├── useLeaveTypes.ts           ← patch createLeaveType to return id + auto-init balances
│   └── useLeaveBalances.ts        ← add 3 admin functions + adminBalances state
└── types/
    └── index.ts                   ← add AdminBalanceRow interface
```

---

## Phase 1 — Reference: Actual Implementation

These sections document what was built. **Do not re-implement them — start from Phase 2.**

### `app/composables/useLeaveTypes.ts` (current state)

```ts
import type { LeaveType } from '~/types/index'

export function useLeaveTypes() {
  const supabase = useSupabaseClient()
  const leaveTypes = useState<LeaveType[]>('leave-types', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLeaveTypes(activeOnly = true) {
    isLoading.value = true
    error.value = null
    try {
      let query = supabase
        .from('leave_types')
        .select('*')
        .order('name', { ascending: true })
      if (activeOnly) query = query.eq('is_active', true)
      const { data, error: sbError } = await query
      if (sbError) throw sbError
      leaveTypes.value = data ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement des types de congé'
    } finally {
      isLoading.value = false
    }
  }

  async function createLeaveType(name: string, color: string) {
    const { error: sbError } = await supabase
      .from('leave_types')
      .insert({ name: name.trim(), color, is_active: true })
    if (sbError) throw sbError
    // ⚠ Phase 2: replace this with the patched version below that returns the id
    // and calls upsert_leave_type_balances
  }

  async function updateLeaveType(id: string, name: string, color: string) {
    const { error: sbError } = await supabase
      .from('leave_types')
      .update({ name: name.trim(), color })
      .eq('id', id)
    if (sbError) throw sbError
  }

  async function toggleLeaveType(id: string, isActive: boolean) {
    const { error: sbError } = await supabase
      .from('leave_types')
      .update({ is_active: isActive })
      .eq('id', id)
    if (sbError) throw sbError
  }

  return {
    leaveTypes: readonly(leaveTypes),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchLeaveTypes,
    createLeaveType,
    updateLeaveType,
    toggleLeaveType,
  }
}
```

### `app/pages/leave-types.vue` (current state — script only)

```ts
definePageMeta({ middleware: 'admin-only', layout: 'private' })

const { leaveTypes, isLoading, error, fetchLeaveTypes, createLeaveType, updateLeaveType, toggleLeaveType } = useLeaveTypes()
const toast = useToast()

const showModal = ref(false)
const editingType = ref<LeaveType | null>(null)

const formName = ref('')
const formColor = ref('#4CAF50')
const formError = ref<string | null>(null)
const isSaving = ref(false)
const togglingId = ref<string | null>(null)

const allDisabledWarning = computed(
  () => leaveTypes.value.length > 0 && leaveTypes.value.every(t => !t.is_active),
)
```

Full template is in the file — it renders a single-section layout (no tabs). Phase 2 adds tabs around the existing content.

---

## Phase 2 — To Implement: F31 — Gestion des soldes

### Context

`leave_balances` already has:
- `UNIQUE (user_id, leave_type_id, year)` constraint — safe for UPSERT
- Admin RLS policies for SELECT, INSERT, UPDATE (from migration `20260421000005_fix_rls_recursion.sql`)
- `used_days` managed exclusively by the trigger `update_leave_balance` — **never write to it directly**

The only missing pieces are the RPC, the composable extensions, the new type, and the page tab.

---

### Step 1 — New migration: `upsert_leave_type_balances` RPC

Create `supabase/migrations/20260427XXXXXX_rpc_upsert_leave_balances.sql`:

```sql
-- Creates or updates balance rows for all employees for a given leave type + year.
-- Used in two contexts:
--   1. After creating a new leave type (p_allocated_days = 0) — makes the type immediately usable
--   2. Admin bulk-set quota (p_allocated_days = N) — applies a uniform quota to all employees
-- ON CONFLICT only updates allocated_days — used_days is managed by the trigger, never touched here.
CREATE OR REPLACE FUNCTION upsert_leave_type_balances(
  p_leave_type_id  uuid,
  p_year           int,
  p_allocated_days int DEFAULT 0
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  IF (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  INSERT INTO leave_balances (user_id, leave_type_id, year, allocated_days, used_days)
  SELECT id, p_leave_type_id, p_year, p_allocated_days, 0
  FROM profiles
  WHERE role = 'employee'
  ON CONFLICT (user_id, leave_type_id, year)
  DO UPDATE SET allocated_days = EXCLUDED.allocated_days;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
```

Apply with: `supabase migration new rpc_upsert_leave_balances` then paste.

---

### Step 2 — New type in `app/types/index.ts`

Add after `LeaveBalanceWithType`:

```ts
export type AdminBalanceRow = LeaveBalance & {
  profiles: Pick<Profile, 'id' | 'first_name' | 'last_name'>
  leave_types: Pick<LeaveType, 'id' | 'name' | 'color'>
}
```

---

### Step 3 — Patch `app/composables/useLeaveTypes.ts`

Replace the `createLeaveType` function. The new version selects the inserted `id` back and calls the RPC to init zero-balance rows for all employees. The rest of the composable is unchanged.

```ts
async function createLeaveType(name: string, color: string): Promise<void> {
  const currentYear = new Date().getFullYear()
  const { data, error: sbError } = await supabase
    .from('leave_types')
    .insert({ name: name.trim(), color, is_active: true })
    .select('id')
    .single()
  if (sbError) throw sbError
  const { error: rpcError } = await supabase.rpc('upsert_leave_type_balances', {
    p_leave_type_id: data.id,
    p_year: currentYear,
    p_allocated_days: 0,
  })
  if (rpcError) throw rpcError
}
```

The return type stays `Promise<void>` — the page doesn't need the id.

---

### Step 4 — Extend `app/composables/useLeaveBalances.ts`

Add admin-only state and three functions. The existing employee/manager state (`balances`, `teamBalances`, etc.) is untouched.

```ts
// Add import at top
import type { LeaveBalanceWithType, TeamMemberBalance, AdminBalanceRow } from '~/types/index'

// Inside useLeaveBalances(), after the existing state declarations:

const adminBalances = useState<AdminBalanceRow[]>('admin-balances', () => [])
const isLoadingAdmin = ref(false)
const adminError = ref<string | null>(null)

async function fetchAdminBalances(year = new Date().getFullYear()) {
  isLoadingAdmin.value = true
  adminError.value = null
  try {
    const { data, error: sbError } = await supabase
      .from('leave_balances')
      .select(`
        *,
        profiles!user_id (id, first_name, last_name),
        leave_types!leave_type_id (id, name, color)
      `)
      .eq('year', year)
      .order('created_at', { ascending: true })
    if (sbError) throw sbError
    adminBalances.value = (data ?? []) as AdminBalanceRow[]
  } catch (e) {
    adminError.value = e instanceof Error ? e.message : 'Erreur lors du chargement des soldes'
  } finally {
    isLoadingAdmin.value = false
  }
}

async function updateAllocatedDays(id: string, days: number): Promise<void> {
  const { error: sbError } = await supabase
    .from('leave_balances')
    .update({ allocated_days: days })
    .eq('id', id)
  if (sbError) throw sbError
}

async function upsertTypeBalances(typeId: string, year: number, days: number): Promise<void> {
  const { error: sbError } = await supabase.rpc('upsert_leave_type_balances', {
    p_leave_type_id: typeId,
    p_year: year,
    p_allocated_days: days,
  })
  if (sbError) throw sbError
}

// Add to the return object:
// adminBalances: readonly(adminBalances),
// isLoadingAdmin: readonly(isLoadingAdmin),
// adminError: readonly(adminError),
// fetchAdminBalances,
// updateAllocatedDays,
// upsertTypeBalances,
```

---

### Step 5 — Update `app/pages/leave-types.vue`

#### 5a — Tab state (add to script)

```ts
import type { LeaveType, AdminBalanceRow } from '~/types/index'

// Existing destructuring stays. Add:
const {
  adminBalances,
  isLoadingAdmin,
  adminError,
  fetchAdminBalances,
  updateAllocatedDays,
  upsertTypeBalances,
} = useLeaveBalances()

const activeTab = ref<'types' | 'balances'>('types')
const selectedYear = ref(new Date().getFullYear())

// Balances grouped by leave type — used by the Soldes tab
const balancesByType = computed(() => {
  const map = new Map<string, { type: AdminBalanceRow['leave_types'], rows: AdminBalanceRow[] }>()
  for (const b of adminBalances.value) {
    if (!map.has(b.leave_type_id)) {
      map.set(b.leave_type_id, { type: b.leave_types, rows: [] })
    }
    map.get(b.leave_type_id)!.rows.push(b)
  }
  return [...map.values()]
})

// Inline edit state: balanceId → draft allocated_days value
const editingDays = ref<Record<string, number>>({})
const savingId = ref<string | null>(null)

// Bulk-set state per leave type
const bulkDays = ref<Record<string, number>>({})
const bulkSavingId = ref<string | null>(null)

function startEdit(b: AdminBalanceRow) {
  editingDays.value[b.id] = b.allocated_days
}

async function handleSaveDays(b: AdminBalanceRow) {
  const days = editingDays.value[b.id]
  if (days === undefined || days < 0) return
  savingId.value = b.id
  try {
    await updateAllocatedDays(b.id, days)
    toast.add('Solde mis à jour')
    await fetchAdminBalances(selectedYear.value)
    delete editingDays.value[b.id]
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors de la mise à jour', 'error')
  } finally {
    savingId.value = null
  }
}

async function handleBulkSet(typeId: string) {
  const days = bulkDays.value[typeId]
  if (days === undefined || days < 0) return
  bulkSavingId.value = typeId
  try {
    await upsertTypeBalances(typeId, selectedYear.value, days)
    toast.add('Quota appliqué à tous les employés')
    await fetchAdminBalances(selectedYear.value)
    delete bulkDays.value[typeId]
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors de l\'application du quota', 'error')
  } finally {
    bulkSavingId.value = null
  }
}

watch(selectedYear, (year) => fetchAdminBalances(year))

// Replace onMounted to also fetch balances on initial load
onMounted(() => {
  fetchLeaveTypes(false)
  fetchAdminBalances(selectedYear.value)
})
```

#### 5b — Template structure

Wrap the existing content in a tab shell. The existing types table and modal remain **unchanged** inside the "Types" tab.

```vue
<template>
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-semibold text-gray-900">Administration des congés</h1>
      <AppButton v-if="activeTab === 'types'" @click="openCreateModal">
        Ajouter un type
      </AppButton>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 mb-6">
      <nav class="flex gap-6" aria-label="Onglets administration">
        <button
          class="pb-3 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'types'
            ? 'border-brand-primary text-brand-primary'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeTab = 'types'"
        >
          Types de congé
        </button>
        <button
          class="pb-3 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'balances'
            ? 'border-brand-primary text-brand-primary'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeTab = 'balances'"
        >
          Soldes
        </button>
      </nav>
    </div>

    <!-- Tab: Types (existing content, unchanged) -->
    <template v-if="activeTab === 'types'">
      <!-- Warning banner -->
      <div
        v-if="allDisabledWarning"
        class="rounded-md bg-amber-50 border border-amber-200 p-3 mb-4 text-sm text-amber-800"
      >
        Attention : aucun type de congé actif. Les employés ne pourront pas créer de demandes.
      </div>

      <!-- 4 UI states — identical to current implementation -->
      <!-- ... (no changes to this section) ... -->
    </template>

    <!-- Tab: Soldes -->
    <template v-else-if="activeTab === 'balances'">
      <!-- Year selector -->
      <div class="flex items-center gap-3 mb-6">
        <label for="balance-year" class="text-sm font-medium text-gray-700">Année</label>
        <select
          id="balance-year"
          v-model="selectedYear"
          class="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        >
          <option v-for="y in [selectedYear - 1, selectedYear, selectedYear + 1]" :key="y" :value="y">
            {{ y }}
          </option>
        </select>
      </div>

      <!-- 1. Loading -->
      <template v-if="isLoadingAdmin">
        <AppSkeleton v-for="i in 3" :key="i" class="mb-4 h-32" />
      </template>

      <!-- 2. Error -->
      <AppErrorBanner
        v-else-if="adminError"
        :message="adminError"
        @retry="fetchAdminBalances(selectedYear)"
      />

      <!-- 3. Empty -->
      <AppEmptyState
        v-else-if="balancesByType.length === 0"
        title="Aucun solde pour cette année"
        description="Créez un type de congé pour initialiser automatiquement les soldes."
      />

      <!-- 4. Content — grouped by leave type -->
      <div v-else class="space-y-6">
        <div
          v-for="group in balancesByType"
          :key="group.type.id"
          class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
        >
          <!-- Group header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div class="flex items-center gap-2">
              <span
                class="w-3 h-3 rounded-full inline-block flex-shrink-0"
                :style="{ backgroundColor: group.type.color }"
                :aria-label="`Couleur ${group.type.color}`"
              />
              <span class="font-medium text-gray-900 text-sm">{{ group.type.name }}</span>
            </div>
            <!-- Bulk set -->
            <div class="flex items-center gap-2">
              <label :for="`bulk-${group.type.id}`" class="text-xs text-gray-500">
                Appliquer à tous :
              </label>
              <input
                :id="`bulk-${group.type.id}`"
                v-model.number="bulkDays[group.type.id]"
                type="number"
                min="0"
                placeholder="jours"
                class="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                :aria-label="`Quota pour ${group.type.name}`"
              />
              <AppButton
                variant="secondary"
                :disabled="bulkDays[group.type.id] === undefined || bulkSavingId === group.type.id"
                @click="handleBulkSet(group.type.id)"
              >
                <span v-if="bulkSavingId === group.type.id" class="flex items-center gap-1">
                  <span class="animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" aria-hidden="true" />
                  Envoi…
                </span>
                <span v-else>Appliquer</span>
              </AppButton>
            </div>
          </div>

          <!-- Per-employee rows -->
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500 border-b border-gray-100">
                  <th class="px-4 py-2 font-medium">Employé</th>
                  <th class="px-4 py-2 font-medium text-right">Alloués</th>
                  <th class="px-4 py-2 font-medium text-right">Utilisés</th>
                  <th class="px-4 py-2 font-medium text-right">Restants</th>
                  <th class="px-4 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="b in group.rows"
                  :key="b.id"
                  class="border-b border-gray-100 last:border-0"
                >
                  <td class="px-4 py-3 text-gray-900">
                    {{ b.profiles.first_name }} {{ b.profiles.last_name }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <input
                      v-if="editingDays[b.id] !== undefined"
                      v-model.number="editingDays[b.id]"
                      type="number"
                      min="0"
                      class="w-16 border border-gray-300 rounded px-2 py-0.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      :aria-label="`Jours alloués pour ${b.profiles.first_name} ${b.profiles.last_name}`"
                    />
                    <span v-else class="text-gray-900">{{ b.allocated_days }}</span>
                  </td>
                  <td class="px-4 py-3 text-right text-gray-500">{{ b.used_days }}</td>
                  <td class="px-4 py-3 text-right" :class="(b.allocated_days - b.used_days) < 0 ? 'text-red-600' : 'text-gray-900'">
                    {{ b.allocated_days - b.used_days }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <template v-if="editingDays[b.id] !== undefined">
                      <AppButton
                        variant="ghost"
                        :disabled="savingId === b.id"
                        @click="handleSaveDays(b)"
                      >
                        <span v-if="savingId === b.id" class="flex items-center gap-1">
                          <span class="animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" aria-hidden="true" />
                          Envoi…
                        </span>
                        <span v-else>Enregistrer</span>
                      </AppButton>
                      <AppButton variant="ghost" @click="delete editingDays[b.id]">
                        Annuler
                      </AppButton>
                    </template>
                    <AppButton v-else variant="ghost" @click="startEdit(b)">Modifier</AppButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal create / edit (unchanged, outside tab conditionals) -->
    <!-- ... existing AppModal ... -->
  </div>
</template>
```

---

## Acceptance Criteria

### F21, F22, F23 — Already satisfied ✅

All criteria from the original spec are met. Verify with:
- Admin sees 4 seeded types, color pastille, status badge, reduced opacity for inactive
- Create modal: empty fields, green default, inline error on server failure, toast + refresh on success
- Edit modal: pre-filled, save updates, toast + refresh
- Toggle: Désactiver/Activer with toast, no confirmation modal needed, warning banner when all inactive

### F31 — New criteria

**Read (Soldes tab):**
- [ ] "Soldes" tab visible and accessible only on `/leave-types` (admin-only page)
- [ ] Year selector defaults to current year; changing it reloads the table
- [ ] Balances displayed grouped by leave type with color indicator
- [ ] Each row shows: employee name, allocated, used, remaining (= allocated − used)
- [ ] Remaining shown in red if negative (over-allocated edge case)
- [ ] 4 UI states on the Soldes tab: loading (skeletons), error (AppErrorBanner + retry), empty, content

**Inline edit (single row):**
- [ ] "Modifier" button switches the "Alloués" cell to a number input pre-filled with current value
- [ ] "Enregistrer" saves → updates `allocated_days` via direct `.update()`, toast, row refreshes
- [ ] "Annuler" discards the edit without saving
- [ ] Button disabled + spinner during save; only one row editable at a time is not required (concurrent edits are fine)
- [ ] `used_days` and `remaining` columns are always read-only — they are never editable

**Bulk set:**
- [ ] Each type group header has a number input + "Appliquer" button
- [ ] Clicking "Appliquer" calls `upsert_leave_type_balances` RPC → UPSERTs all employee rows for that type with the new quota
- [ ] Toast "Quota appliqué à tous les employés" on success, table refreshes
- [ ] Button disabled during save

**Auto-init on create:**
- [ ] Creating a new leave type (F22 flow) automatically creates zero-balance rows for all employees for the current year
- [ ] The new type immediately appears in the "Soldes" tab with `allocated_days = 0` for every employee
- [ ] If RPC fails after type is inserted, the error surfaces inline in the create modal (modal stays open)

---

## Security Notes

- `upsert_leave_type_balances` is `SECURITY DEFINER` with an explicit `auth.uid()` → `profiles.role = 'admin'` guard at entry — same pattern as `create_leave_request`
- The RPC queries `profiles WHERE role = 'employee'` as DB owner (bypasses RLS), which is intentional and safe since the function is admin-gated
- `ON CONFLICT DO UPDATE SET allocated_days = EXCLUDED.allocated_days` — intentionally does **not** touch `used_days`, which is the exclusive domain of the `update_leave_balance` trigger
- Admin direct `.update({ allocated_days })` is covered by the existing `leave_balances_update_admin` RLS policy — no new policies needed

---

## Testing Strategy

### Phase 1 — Regression check (already implemented)

1. Login as admin → `/leave-types` → Types tab shows 4 seeded types
2. Add "Congé exceptionnel" #FF9800 → appears in list
3. Edit "Congé payé" name → updates inline
4. Désactiver a type → grays out; login as employee → not in dropdown
5. Login as manager → `/leave-types` → 403

### Phase 2 — New scenarios

6. Admin creates "Congé exceptionnel" → switch to Soldes tab → Emma and Eddy have `allocated_days = 0` for this type
7. Soldes tab → Modify Emma's "Congé payé" row → set 30 → Enregistrer → row shows 30
8. Bulk set "Congé payé" to 25 → Emma and Eddy both show 25 (existing `used_days` unchanged)
9. Change year to previous year → "Aucun solde pour cette année" empty state
10. RPC error simulation → toast error appears, table does not corrupt
