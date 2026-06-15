# RFC-005 — Profile & Leave Balance Display

**ID:** RFC-005  
**Title:** User Profile Page and Leave Balance Section  
**Sprint:** 1  
**Complexity:** Low–Medium  
**Predecessor:** RFC-004  
**Successor:** RFC-006

---

## Summary

This RFC implements the `/profile` page with two sections: (1) the read-only user profile card and (2) the leave balance display. It covers features **F06** and **F07**, completing Sprint 1's user-facing pages.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F06 | Fiche profil utilisateur (read-only) | Low |
| F07 | Affichage du solde de congé par type | Medium |

---

## Dependencies

- **Predecessors:** RFC-004 (private layout, `useCurrentUser`)
- **Successors:** RFC-006 (shared UI components needed for full polish)

---

## Technical Approach

### Files created in this RFC

```
app/
├── pages/
│   └── profile.vue                    ← Replaces stub from RFC-004
├── components/
│   ├── leave/
│   │   └── LeaveBalanceCard.vue       ← Balance display per leave type
│   └── app/
│       ├── AppSkeleton.vue            ← Animated loading placeholder
│       ├── AppErrorBanner.vue         ← Error display with retry
│       └── AppEmptyState.vue          ← Empty state with slot
└── composables/
    └── useLeaveBalances.ts            ← Fetches leave_balances for current user
```

---

### Shared App Components (foundational, used throughout all future RFCs)

These generic components are defined here because `/profile` is the first page to need them. They have zero business logic — props only.

**`app/components/app/AppSkeleton.vue`**

```vue
<script setup lang="ts">
defineProps<{ class?: string }>()
</script>
<template>
  <div :class="['animate-pulse bg-gray-200 rounded', $props.class]" />
</template>
```

**`app/components/app/AppErrorBanner.vue`**

```vue
<script setup lang="ts">
defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <div class="rounded-md bg-red-50 p-4 flex items-start gap-3">
    <p class="text-sm text-red-700 flex-1">{{ message }}</p>
    <button
      class="text-sm font-medium text-red-700 underline shrink-0"
      @click="$emit('retry')"
    >
      Réessayer
    </button>
  </div>
</template>
```

**`app/components/app/AppEmptyState.vue`**

```vue
<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template>
  <div class="flex flex-col items-center py-12 text-center">
    <p class="text-lg font-medium text-gray-900">{{ title }}</p>
    <p v-if="description" class="mt-1 text-sm text-gray-500">{{ description }}</p>
    <slot />
  </div>
</template>
```

**`app/components/app/AppBadge.vue`**

Used for role and status display:

```vue
<script setup lang="ts">
defineProps<{
  label: string
  variant?: 'gray' | 'blue' | 'green' | 'red' | 'amber'
}>()
</script>
```

Variant classes map:
- `gray`: `bg-gray-100 text-gray-700`
- `blue`: `bg-blue-100 text-blue-700`
- `green`: `bg-green-100 text-green-700`
- `red`: `bg-red-100 text-red-700`
- `amber`: `bg-amber-100 text-amber-700`

All: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium`

---

### `useLeaveBalances` composable

```ts
// app/composables/useLeaveBalances.ts
export function useLeaveBalances() {
  const supabase = useSupabaseClient()
  const balances = useState<(LeaveBalance & { leave_types: LeaveType })[]>('leave-balances', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchBalances() {
    isLoading.value = true
    error.value = null
    try {
      const currentYear = new Date().getFullYear()
      const { data, error: sbError } = await supabase
        .from('leave_balances')
        .select('*, leave_types(id, name, color)')
        .eq('year', currentYear)
      if (sbError) throw sbError
      balances.value = (data ?? []) as (LeaveBalance & { leave_types: LeaveType })[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement des soldes'
    } finally {
      isLoading.value = false
    }
  }

  return {
    balances: readonly(balances),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchBalances,
  }
}
```

---

### `LeaveBalanceCard` component

Displays a single leave type balance row:

```vue
<!-- app/components/leave/LeaveBalanceCard.vue -->
<script setup lang="ts">
defineProps<{
  typeName: string
  typeColor: string
  allocatedDays: number
  usedDays: number
}>()

const remainingDays = computed(() => Math.max(0, props.allocatedDays - props.usedDays))
</script>
<template>
  <div class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
    <div class="flex items-center gap-3">
      <span
        class="w-3 h-3 rounded-full shrink-0"
        :style="{ backgroundColor: typeColor }"
        :aria-label="typeName"
      />
      <span class="font-medium text-gray-900">{{ typeName }}</span>
    </div>
    <div class="flex gap-6 text-sm text-center">
      <div>
        <p class="text-gray-500">Acquis</p>
        <p class="font-semibold text-gray-900">{{ allocatedDays }}</p>
      </div>
      <div>
        <p class="text-gray-500">Utilisés</p>
        <p class="font-semibold text-gray-900">{{ usedDays }}</p>
      </div>
      <div>
        <p class="text-gray-500">Restants</p>
        <p class="font-semibold" :class="remainingDays === 0 ? 'text-red-600' : 'text-green-600'">
          {{ remainingDays }}
        </p>
      </div>
    </div>
  </div>
</template>
```

---

### `profile.vue` page

```vue
<script setup lang="ts">
definePageMeta({ layout: 'private' })

const supabaseUser = useSupabaseUser()
const { profile, loadProfile, isAdmin } = useCurrentUser()
const { balances, isLoading: balancesLoading, error: balancesError, fetchBalances } = useLeaveBalances()

onMounted(async () => {
  await loadProfile()
  if (!isAdmin.value) {
    await fetchBalances()
  }
})
</script>
```

**Template sections:**

1. **Profile card** — always visible
   - Loading: 4 `AppSkeleton` rows
   - Error: `AppErrorBanner` with retry
   - Content: grid with name, email, role badge, team, joined date

2. **Leave balance section** — hidden for admin role
   - Loading: 3 `AppSkeleton` items
   - Error: `AppErrorBanner` with retry on `fetchBalances`
   - Empty: `AppEmptyState` with "Aucun solde configuré pour cette année"
   - Content: list of `LeaveBalanceCard` components

**Role badge colors:**
- `admin` → `AppBadge variant="red"` label="Administrateur"
- `manager` → `AppBadge variant="blue"` label="Manager"
- `employee` → `AppBadge variant="green"` label="Employé"

**Team display:**
- If `team_id` is null (admin) → display "Toute l'entreprise"
- Otherwise → display team name (requires joining team name via separate fetch or joining in `loadProfile`)

**Email:** read from `supabaseUser.value?.email` (not from `profiles` table)

**Joined date format:** `new Date(profile.value.joined_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })`

---

## Acceptance Criteria

### F06 — Profile Page

- [ ] Page accessible to all 3 roles (employee, manager, admin)
- [ ] Displays: prénom, nom, email, rôle (badge coloré), équipe, date d'entrée
- [ ] Skeleton shown during profile fetch
- [ ] Error banner shown if fetch fails, with retry button
- [ ] Admin: team displayed as "Toute l'entreprise" (no team_id)
- [ ] No edit form or "Modifier" button (read-only)

### F07 — Leave Balance

- [ ] Balance section hidden for admin role
- [ ] Employee and manager see balances for current year only
- [ ] Each row shows: type name (with color dot), Acquis / Utilisés / Restants
- [ ] `restant = allocated_days - used_days`, minimum displayed as 0
- [ ] If no balances exist for current year → AppEmptyState with "Aucun solde configuré pour cette année"
- [ ] Skeleton shown during balance fetch
- [ ] Emma (employee1): Congé payé shows 25 / 5 / 20
- [ ] Eddy (employee2): Congé payé shows 25 / 0 / 25

---

## Data Flow

```
profile.vue mounts
  → loadProfile() → SELECT * FROM profiles WHERE id = auth.uid()
    → profile.value set in useState('current-profile')
  → if !isAdmin: fetchBalances()
    → SELECT *, leave_types(*) FROM leave_balances WHERE year = currentYear
      → RLS restricts to own rows (employee) or team (manager)
      → balances.value populated
```

---

## Testing Strategy

1. Login as `employee1@waka.com` → profile shows "Emma Employée", role "Employé" (green badge), team "Équipe A"
2. Balance section shows Congé payé: 25 / 5 / 20
3. Login as `admin@waka.com` → profile shows "Alice Admin", role "Administrateur" (red badge), team "Toute l'entreprise"
4. Admin sees no balance section
5. Throttle network → skeleton visible, then content loads
6. Simulate fetch error → error banner shown, retry works
