# RFC-008 — Leave Request Views (Employee + Manager)

**ID:** RFC-008  
**Title:** Employee History, Manager Validation Queue, and Team Balances  
**Sprint:** 2  
**Complexity:** Medium  
**Predecessor:** RFC-007  
**Successor:** RFC-009

---

## Summary

This RFC completes the `/leave-requests` page for the **employee** view (history list) and implements the full **manager** view: a validation queue for pending requests, a team balance summary, and the full team history. It covers features **F11**, **F12**, and **F13**.

The admin view is deferred to RFC-009.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F11 | Historique des demandes (vue employé) | Low |
| F12 | File de validation manager — niveau 1 | Medium |
| F13 | Soldes équipe (vue manager) | Medium |

---

## Dependencies

- **Predecessors:** RFC-007 (`useLeaveRequests`, `LeaveStatusBadge`, page stub)
- **Successors:** RFC-009 (admin view uses same composable)

---

## Technical Approach

### Files modified/created in this RFC

```
app/
├── pages/
│   └── leave-requests.vue            ← Expanded with role-based views
└── components/
    └── leave/
        └── LeaveRequestTable.vue     ← Reusable request table (shared by all roles)
```

---

### Role-based view routing in leave-requests.vue

The page renders a different view based on `useCurrentUser()`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'private' })

const { isEmployee, isManager, isAdmin, profile, loadProfile } = useCurrentUser()
const leaveRequestsComposable = useLeaveRequests()
const toast = useToast()

onMounted(async () => {
  await loadProfile()
  await leaveRequestsComposable.fetchRequests()
})
</script>

<template>
  <div class="max-w-5xl mx-auto">
    <!-- Employee view -->
    <template v-if="isEmployee">
      <EmployeeLeaveView />
    </template>
    <!-- Manager view -->
    <template v-else-if="isManager">
      <ManagerLeaveView />
    </template>
    <!-- Admin view — stub, implemented in RFC-009 -->
    <template v-else-if="isAdmin">
      <p class="text-gray-500">Vue admin — à venir</p>
    </template>
  </div>
</template>
```

To keep file size manageable, define each view as an inline section or a separate `<script setup>` component file. The composable and data fetching are shared at page level.

---

### F11 — Employee View (history list)

**Data:** all requests where `user_id = auth.uid()` (enforced by RLS).

**Columns:**
- **Type** — colored dot + name (from `leave_types.color` and `leave_types.name`)
- **Période** — "du [start_date] au [end_date]" formatted as French dates
- **Durée** — "N jour(s)"
- **Statut** — `<LeaveStatusBadge :status="request.status" />`
- **Créée le** — `created_at` formatted as French date

**LeaveRequestTable.vue** (generic reusable table):

```vue
<script setup lang="ts">
defineProps<{
  requests: LeaveRequestWithJoins[]
  showEmployee?: boolean    // show employee name column (manager/admin)
  showTeam?: boolean        // show team column (admin only)
  showActions?: boolean     // show approve/reject action buttons
}>()

defineEmits<{
  approve: [requestId: string]
  reject: [requestId: string]
}>()
</script>
```

**Responsive handling:**
- Desktop: full table with `<thead>` + `<tbody>`
- Mobile (< 768px): card-based layout (stacked rows) — use `md:` prefix for table, `md:hidden` for cards

**Empty state** (F11):
```vue
<AppEmptyState
  title="Aucune demande pour le moment"
  description="Créez votre première demande de congé."
>
  <AppButton class="mt-4" @click="$emit('open-create')">Nouvelle demande</AppButton>
</AppEmptyState>
```

**Date formatting helper** (add to `app/utils/format.ts` or inline computed):

```ts
function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}
```

---

### F12 — Manager Validation Queue

**Data:** all requests from the manager's team (RLS enforces team scope).

**Page layout for manager:**

```
┌─────────────────────────────────────────┐
│  Section 1: "À valider" (pending only)  │
│  [table with Approuver / Refuser btns]  │
├─────────────────────────────────────────┤
│  Section 2: "Soldes de l'équipe"        │
│  [team balance table — F13]             │
├─────────────────────────────────────────┤
│  Section 3: "Historique équipe"         │
│  [full team history, no action btns]    │
└─────────────────────────────────────────┘
```

**"À valider" section:**
- Filtered in-memory: `requests.value.filter(r => r.status === 'pending')`
- Columns: Employé (prénom + nom), Type, Période, Durée, Commentaire, Actions
- Actions: two buttons per row — "Approuver" (green) and "Refuser" (red)
- Each button opens `AppConfirmModal` before executing

**Approve action:**
```ts
async function handleApprove(requestId: string) {
  try {
    await updateRequestStatus(requestId, {
      status: 'manager_approved',
      manager_reviewed_by: profile.value!.id,
      manager_reviewed_at: new Date().toISOString(),
    })
    toast.add('Demande approuvée')
    await fetchRequests()  // refresh list
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors de l\'approbation', 'error')
  } finally {
    confirmAction.value = null
  }
}
```

**Reject action:** same pattern with `status: 'rejected'`, toast "Demande refusée".

**Empty state for "À valider":**
```vue
<p class="text-sm text-gray-500 py-6 text-center">Aucune demande en attente de validation.</p>
```

**"Historique équipe" section:**
- All requests from team, sorted `created_at DESC`
- No action buttons (read-only)

---

### F13 — Team Balances (Manager View)

Displayed between "À valider" and "Historique équipe".

**Data source:** `useLeaveBalances` composable (already defined in RFC-005) — fetches `leave_balances` for the manager's team (RLS handles team scoping).

But the manager needs to see balances for team members, not just themselves. The RLS for `leave_balances_select_manager` already allows this.

**Additional composable query** (extend `useLeaveBalances` or query inline):

```ts
// In the manager view section
const { balances: teamBalances, fetchBalances } = useLeaveBalances()

// filter to "Congé payé" type only for POC display
const LEAVE_TYPE_CP_ID = '00000000-0000-0000-0000-000000000020'
const cpBalances = computed(() =>
  teamBalances.value.filter(b => b.leave_type_id === LEAVE_TYPE_CP_ID)
)
```

**Table columns:** Prénom + Nom, Jours acquis, Jours utilisés, Jours restants

**Join profiles:** The balance query needs to join `profiles` to get names. Extend the query:

```ts
const { data } = await supabase
  .from('leave_balances')
  .select('*, profiles!user_id(first_name, last_name), leave_types(name, color)')
  .eq('year', currentYear)
  .eq('leave_type_id', LEAVE_TYPE_CP_ID)
```

**No balance row found** for a member → display "—" in remaining days.

---

## Acceptance Criteria

### F11 — Employee History

- [ ] List shows all requests for logged-in employee, sorted by `created_at DESC`
- [ ] Columns: type (color dot + name), période, durée, statut (badge), date de création
- [ ] All 4 status badges display correctly with correct colors
- [ ] Empty state: "Aucune demande" + CTA "Créer une demande" (opens form modal)
- [ ] Skeleton loader shown during fetch
- [ ] Error banner shown if fetch fails

### F12 — Manager Validation Queue

- [ ] "À valider" section shows only `pending` requests from manager's team
- [ ] "Approuver" and "Refuser" buttons visible per pending request
- [ ] Click "Approuver" → AppConfirmModal opens → confirm → status becomes `manager_approved`, request leaves "À valider" section
- [ ] Click "Refuser" → AppConfirmModal opens → confirm → status becomes `rejected`, request leaves "À valider" section
- [ ] `manager_reviewed_by` and `manager_reviewed_at` set on action
- [ ] Toast success after each action
- [ ] Toast error if action fails (list not modified)
- [ ] "Historique équipe" shows all team requests (all statuses), sorted `created_at DESC`
- [ ] Empty state "Aucune demande en attente" shown in "À valider" when no pending requests

### F13 — Team Balances

- [ ] Table shows each team member's Congé payé balance for current year
- [ ] Columns: name, jours acquis, jours utilisés, jours restants
- [ ] Values match `leave_balances` table (Emma: 25/5/20, Eddy: 25/0/25, Marc: 25/0/25)
- [ ] Skeleton shown during load
- [ ] If a member has no balance row → display "—" (no crash)

---

## Data Flow

```
leave-requests.vue mounts (manager session)
  → loadProfile() → resolves isManager
  → fetchRequests() → SELECT from leave_requests (RLS filters to team)
    → requests split into:
        pendingRequests = filter(status === 'pending')
        allTeamRequests = all (for history)
  → fetchBalances() → SELECT from leave_balances WHERE year = currentYear
    → filtered to Congé payé for team balance table

Manager clicks "Approuver" on requestId X
  → confirmAction.value = { requestId: X, ... }
  → AppConfirmModal opens
  → confirm clicked
    → updateRequestStatus(X, { status: 'manager_approved', ... })
    → toast 'Demande approuvée'
    → fetchRequests() → list refreshed (request disappears from "À valider")
```

---

## Testing Strategy

1. Login as manager → "À valider" shows Emma's pending request
2. Approve Emma's request → confirm modal → request moves to "Historique équipe" with "Validé manager" badge
3. Toast "Demande approuvée" appears and auto-dismisses
4. Team balances table shows Marc (25/0/25), Emma (25/5/20), Eddy (25/0/25) — note Emma's used days don't change yet (trigger only fires on `approved`)
5. Login as employee2 → verify only own requests visible (not Emma's)
6. Login as manager after all requests processed → "À valider" shows empty state
