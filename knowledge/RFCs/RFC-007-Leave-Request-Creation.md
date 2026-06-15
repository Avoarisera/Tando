# RFC-007 — Leave Request Creation

**ID:** RFC-007  
**Title:** Leave Request Creation — RPC Validation + Employee Form Modal  
**Sprint:** 2  
**Complexity:** High  
**Predecessor:** RFC-006  
**Successor:** RFC-008

---

## Summary

This RFC implements the leave request creation flow: the server-side RPC `create_leave_request` (SQL already defined in RFC-001 migrations) wired up through a client-side modal form. It covers features **F10** (RPC integration) and **F09** (form modal UI).

After this RFC, an employee can create a leave request that is validated server-side for overlaps and balance, with appropriate frontend feedback.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F10 | RPC `create_leave_request` integration (validation SQL already in RFC-001) | High |
| F09 | Leave request form modal (employee) | Medium |

---

## Dependencies

- **Predecessors:** RFC-001 (RPC SQL defined in migration), RFC-006 (toast + modal primitives)
- **Successors:** RFC-008 (views display requests created here)

---

## Technical Approach

### Files created in this RFC

```
app/
├── pages/
│   └── leave-requests.vue            ← Stub from RFC-004, now partially implemented
├── components/
│   └── leave/
│       ├── LeaveRequestForm.vue      ← Modal form for creating requests
│       └── LeaveStatusBadge.vue      ← Status badge (reused in RFC-008)
└── composables/
    ├── useLeaveRequests.ts           ← Fetches + creates leave requests
    └── useLeaveTypes.ts              ← Fetches active leave types for select
```

---

### useLeaveTypes composable

```ts
// app/composables/useLeaveTypes.ts
export function useLeaveTypes() {
  const supabase = useSupabaseClient()
  const leaveTypes = useState<LeaveType[]>('leave-types', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLeaveTypes(activeOnly = true) {
    isLoading.value = true
    error.value = null
    try {
      let query = supabase.from('leave_types').select('*').order('created_at', { ascending: true })
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

  return {
    leaveTypes: readonly(leaveTypes),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchLeaveTypes,
  }
}
```

---

### useLeaveRequests composable

```ts
// app/composables/useLeaveRequests.ts
export function useLeaveRequests() {
  const supabase = useSupabaseClient()
  const requests = useState<(LeaveRequest & {
    leave_types: LeaveType
    profiles: Pick<Profile, 'id' | 'first_name' | 'last_name'>
    teams?: Pick<Team, 'name'>
  })[]>('leave-requests', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchRequests() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase
        .from('leave_requests')
        .select(`
          *,
          leave_types (id, name, color),
          profiles!user_id (id, first_name, last_name, team_id,
            teams (name)
          )
        `)
        .order('created_at', { ascending: false })
      if (sbError) throw sbError
      requests.value = (data ?? []) as typeof requests.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement des demandes'
    } finally {
      isLoading.value = false
    }
  }

  async function createRequest(params: {
    leaveTypeId: string
    startDate: string
    endDate: string
    comment: string | null
  }) {
    const { data, error: sbError } = await supabase.rpc('create_leave_request', {
      p_leave_type_id: params.leaveTypeId,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
      p_comment: params.comment,
    })
    if (sbError) throw sbError
    return data as string  // returns new UUID
  }

  async function updateRequestStatus(
    requestId: string,
    update: Partial<Pick<LeaveRequest,
      'status' | 'manager_reviewed_by' | 'manager_reviewed_at'
      | 'admin_reviewed_by' | 'admin_reviewed_at'
    >>
  ) {
    const { error: sbError } = await supabase
      .from('leave_requests')
      .update(update)
      .eq('id', requestId)
    if (sbError) throw sbError
  }

  return {
    requests: readonly(requests),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchRequests,
    createRequest,
    updateRequestStatus,
  }
}
```

---

### LeaveStatusBadge.vue

```vue
<script setup lang="ts">
import type { LeaveStatus } from '~/types'

const props = defineProps<{ status: LeaveStatus }>()

const CONFIG: Record<LeaveStatus, { label: string; classes: string }> = {
  pending:          { label: 'En attente',       classes: 'bg-gray-100 text-gray-700' },
  manager_approved: { label: 'Validé manager',   classes: 'bg-amber-100 text-amber-700' },
  approved:         { label: 'Approuvé',          classes: 'bg-green-100 text-green-700' },
  rejected:         { label: 'Refusé',            classes: 'bg-red-100 text-red-700' },
}

const config = computed(() => CONFIG[props.status])
</script>

<template>
  <span
    :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', config.classes]"
    :title="config.label"
  >
    {{ config.label }}
  </span>
</template>
```

---

### LeaveRequestForm.vue

The creation modal. Uses `AppModal` as base, calls `createRequest` from `useLeaveRequests`.

**State:**
```ts
const leaveTypeId = ref('')
const startDate = ref('')
const endDate = ref('')
const comment = ref('')
const isSubmitting = ref(false)
const formError = ref<string | null>(null)

const today = new Date().toISOString().split('T')[0]

const daysCount = computed(() => {
  if (!startDate.value || !endDate.value) return 0
  const start = new Date(startDate.value)
  const end = new Date(endDate.value)
  const diff = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
  return Math.max(0, diff)
})

const isValid = computed(() =>
  leaveTypeId.value !== ''
  && startDate.value !== ''
  && endDate.value !== ''
  && startDate.value >= today
  && endDate.value >= startDate.value
)
```

**Submit handler:**
```ts
async function handleSubmit() {
  if (!isValid.value) return
  isSubmitting.value = true
  formError.value = null
  try {
    await createRequest({
      leaveTypeId: leaveTypeId.value,
      startDate: startDate.value,
      endDate: endDate.value,
      comment: comment.value || null,
    })
    toast.add('Demande créée avec succès')
    emit('created')   // parent closes modal and refreshes list
  } catch (e) {
    // RPC errors (overlap, insufficient balance) → inline in modal
    formError.value = e instanceof Error ? e.message : 'Erreur lors de la création de la demande'
  } finally {
    isSubmitting.value = false
  }
}
```

**Key template requirements:**
- `<AppModal title="Nouvelle demande de congé">`
- Select for leave type: only `is_active=true` types; if none → show "Aucun type de congé disponible" and disable submit
- Date inputs: `<input type="date">` native, `:min="today"` on start date, `:min="startDate"` on end date
- Dynamic display: "Durée : N jour(s)" updated as user picks dates
- Comment textarea: max 500 characters, optional
- Error block: `v-if="formError"` — red inline message, modal stays open
- Submit button: disabled when `!isValid || isSubmitting`, spinner when submitting

---

### leave-requests.vue (partial — employee view only)

This page will be expanded in RFC-008 (manager/admin views). In this RFC, implement the employee view:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'private' })

const { isEmployee } = useCurrentUser()
const { leaveTypes, fetchLeaveTypes } = useLeaveTypes()
const { requests, isLoading, error, fetchRequests, createRequest } = useLeaveRequests()
const toast = useToast()

const showCreateModal = ref(false)

onMounted(async () => {
  await fetchLeaveTypes()
  await fetchRequests()
})
</script>
```

Employee view layout:
1. Page header with "Demandes de congé" title
2. "Nouvelle demande" button (visible only when `isEmployee`)
3. 4-state async section (loading / error / empty / list)
4. `LeaveRequestForm` modal (`v-if="showCreateModal"`)

---

## Acceptance Criteria

### F10 — RPC Integration

- [ ] `supabase.rpc('create_leave_request', {...})` called with correct parameter names (`p_leave_type_id`, `p_start_date`, `p_end_date`, `p_comment`)
- [ ] Overlap conflict → French error message inline in modal ("Vous avez déjà une demande sur cette période")
- [ ] Insufficient balance → French error inline ("Solde insuffisant — il vous reste N jour(s)")
- [ ] Success → new UUID returned, request appears in list after refresh
- [ ] `days_count` computed as `(end_date - start_date) + 1` — minimum 1

### F09 — Form Modal

- [ ] "Nouvelle demande" button visible only for `employee` role
- [ ] Modal opens on button click
- [ ] Type select shows only `is_active=true` types
- [ ] `start_date` minimum = today (no past dates)
- [ ] `end_date` minimum = `start_date`
- [ ] Calculated days shown dynamically
- [ ] Submit button disabled until form is valid
- [ ] Submit shows spinner and disables button
- [ ] Success: toast shown, modal closed, list refreshed
- [ ] Server error: inline error in modal, modal stays open
- [ ] Comment is optional, max 500 characters

---

## Error Handling

| Error source | Handling location | User message |
|-------------|-------------------|--------------|
| Front validation: past start date | Inline below field | "La date de début ne peut pas être dans le passé" |
| Front validation: end < start | Inline below field | "La date de fin doit être après la date de début" |
| RPC: overlap | `formError` in modal | PostgreSQL French exception message |
| RPC: insufficient balance | `formError` in modal | PostgreSQL French exception message |
| RPC: unknown error | `formError` in modal | Generic French message |
| List fetch error | `AppErrorBanner` on page | With retry button |

---

## Testing Strategy

1. Login as employee1 → click "Nouvelle demande"
2. Select "Congé payé", pick 2026-06-01 to 2026-06-05 → "Durée : 5 jour(s)" shown
3. Submit → success toast, modal closes, new request in list with "En attente" badge
4. Try to create another request on the same dates → "Vous avez déjà une demande sur cette période" shown inline
5. Try to create a 22-day request (Emma has only 20 days remaining) → balance error shown inline
6. Try submitting with `start_date` in the past → front validation blocks, no RPC call
