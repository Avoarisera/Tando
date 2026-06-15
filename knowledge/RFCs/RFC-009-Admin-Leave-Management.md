# RFC-009 — Admin Leave Management

**ID:** RFC-009  
**Title:** Admin Leave Request Table, Final Validation, and Level-1 Bypass  
**Sprint:** 2  
**Complexity:** Medium  
**Predecessor:** RFC-008  
**Successor:** RFC-010

---

## Summary

This RFC implements the admin view of `/leave-requests`: a full-company request table with status filtering, approval and rejection actions (including the level-1 bypass where admin can approve a `pending` request directly), and all status transitions that trigger the balance update. It covers features **F14**, **F15**, and **F16**.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F14 | Table admin — toutes les demandes + filtre statut | Medium |
| F15 | Validation finale admin — niveau 2 | Medium |
| F16 | Bypass niveau 1 : admin approuve un `pending` directement | Low |

---

## Dependencies

- **Predecessors:** RFC-008 (composables and `LeaveRequestTable` already exist)
- **Successors:** RFC-010 (approved requests appear in calendar)

---

## Technical Approach

### Files modified in this RFC

```
app/
└── pages/
    └── leave-requests.vue    ← Admin view section added (replaces stub from RFC-008)
```

No new composables or components are needed — everything reuses `useLeaveRequests`, `LeaveStatusBadge`, `LeaveRequestTable`, `AppConfirmModal`, and `useToast` from previous RFCs.

---

### Admin view layout

```
┌──────────────────────────────────────────────────┐
│  "Demandes de congé — Vue admin"                 │
│  Filter: [select: Tous | En attente | ...]       │
├──────────────────────────────────────────────────┤
│  Table: all requests (filtered by status select) │
│  Columns: Employé, Équipe, Type, Période,        │
│           Durée, Statut, Date, Actions           │
│  Actions: [Approuver] [Refuser] (contextual)     │
└──────────────────────────────────────────────────┘
```

---

### Status filter

Client-side filtering — no extra Supabase query:

```ts
const statusFilter = ref<LeaveStatus | 'all'>('all')

const filteredRequests = computed(() => {
  if (statusFilter.value === 'all') return requests.value
  return requests.value.filter(r => r.status === statusFilter.value)
})
```

Filter select options:
```ts
const FILTER_OPTIONS = [
  { value: 'all',              label: 'Tous les statuts' },
  { value: 'pending',          label: 'En attente' },
  { value: 'manager_approved', label: 'Validé manager' },
  { value: 'approved',         label: 'Approuvé' },
  { value: 'rejected',         label: 'Refusé' },
]
```

---

### Action buttons visibility rules

| Request status | Approuver | Refuser |
|----------------|-----------|---------|
| `pending`          | ✅ (level-1 bypass — F16) | ✅ |
| `manager_approved` | ✅ (level-2 — F15) | ✅ |
| `approved`         | — | — |
| `rejected`         | — | — |

```ts
function canApprove(status: LeaveStatus) {
  return status === 'pending' || status === 'manager_approved'
}
function canReject(status: LeaveStatus) {
  return status === 'pending' || status === 'manager_approved'
}
```

---

### F15 — Admin approval (level 2: `manager_approved → approved`)

```ts
async function handleAdminApprove(requestId: string, currentStatus: LeaveStatus) {
  try {
    const updatePayload: Partial<LeaveRequest> = {
      status: 'approved',
      admin_reviewed_by: profile.value!.id,
      admin_reviewed_at: new Date().toISOString(),
    }
    await updateRequestStatus(requestId, updatePayload)
    toast.add('Demande approuvée — solde mis à jour')
    await fetchRequests()
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors de l\'approbation', 'error')
  } finally {
    confirmAction.value = null
  }
}
```

When `status` transitions to `approved`, the PostgreSQL trigger `update_leave_balance` fires automatically and increments `used_days`. No client-side balance update is needed.

---

### F16 — Bypass level 1 (`pending → approved`)

This uses the **same** `handleAdminApprove` function — the distinction is the previous `status` value (`pending` vs `manager_approved`). The update payload is identical: `status: 'approved'`, `admin_reviewed_by`, `admin_reviewed_at`. The `manager_reviewed_by` field remains NULL.

The confirm modal text should communicate the bypass when `currentStatus === 'pending'`:

```ts
const confirmTitle = computed(() => {
  if (confirmAction.value?.currentStatus === 'pending') {
    return `Approuver directement (sans validation manager) ?`
  }
  return `Approuver la demande de ${confirmAction.value?.employeeName} ?`
})
```

---

### Admin rejection

```ts
async function handleAdminReject(requestId: string) {
  try {
    await updateRequestStatus(requestId, {
      status: 'rejected',
      admin_reviewed_by: profile.value!.id,
      admin_reviewed_at: new Date().toISOString(),
    })
    toast.add('Demande refusée')
    await fetchRequests()
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors du refus', 'error')
  } finally {
    confirmAction.value = null
  }
}
```

---

### Confirm modal state

```ts
interface ConfirmActionState {
  requestId: string
  type: 'approve' | 'reject'
  currentStatus: LeaveStatus
  employeeName: string
  period: string
}

const confirmAction = ref<ConfirmActionState | null>(null)

function openApproveModal(request: LeaveRequestWithJoins) {
  confirmAction.value = {
    requestId: request.id,
    type: 'approve',
    currentStatus: request.status,
    employeeName: `${request.profiles.first_name} ${request.profiles.last_name}`,
    period: `du ${formatDate(request.start_date)} au ${formatDate(request.end_date)}`,
  }
}

function openRejectModal(request: LeaveRequestWithJoins) {
  confirmAction.value = {
    requestId: request.id,
    type: 'reject',
    currentStatus: request.status,
    employeeName: `${request.profiles.first_name} ${request.profiles.last_name}`,
    period: `du ${formatDate(request.start_date)} au ${formatDate(request.end_date)}`,
  }
}

async function executeConfirmAction() {
  if (!confirmAction.value) return
  const { requestId, type } = confirmAction.value
  if (type === 'approve') {
    await handleAdminApprove(requestId, confirmAction.value.currentStatus)
  } else {
    await handleAdminReject(requestId)
  }
}
```

---

## Acceptance Criteria

### F14 — Admin Table

- [ ] All requests from all employees and teams displayed (RLS allows admin full access)
- [ ] Columns: Employé (prénom + nom), Équipe, Type (badge), Période, Durée, Statut (badge), Date de création, Actions
- [ ] Status filter select: Tous / En attente / Validé manager / Approuvé / Refusé
- [ ] Filtering applied instantly client-side on select change
- [ ] Sorted by `created_at DESC` by default
- [ ] Skeleton shown during initial fetch
- [ ] Empty state if no requests match the filter

### F15 — Admin Validation (level 2)

- [ ] "Approuver" button on `manager_approved` requests → confirm modal → `status = 'approved'`, `admin_reviewed_by` + `admin_reviewed_at` set
- [ ] After approval: `leave_balances.used_days` incremented (trigger fires on DB side — verify via Supabase Studio)
- [ ] Toast "Demande approuvée — solde mis à jour" shown
- [ ] "Refuser" button on `manager_approved` requests → `status = 'rejected'`, admin reviewer fields set
- [ ] After rejection: `used_days` unchanged (no trigger impact for non-approved source)
- [ ] Toast "Demande refusée" shown

### F16 — Level-1 Bypass

- [ ] "Approuver" button visible on `pending` requests (not just `manager_approved`)
- [ ] Confirm modal title reflects bypass ("sans validation manager")
- [ ] After approval: `status = 'approved'`, `manager_reviewed_by = NULL`, `admin_reviewed_by` set
- [ ] Trigger fires identically — `used_days` incremented
- [ ] Request appears as `approved` in all subsequent views (calendar, employee history)

---

## Business Logic Summary

```
Admin approves manager_approved → approved
  trigger fires: used_days += days_count

Admin approves pending (bypass) → approved
  trigger fires: used_days += days_count
  manager_reviewed_by remains NULL

Admin rejects pending → rejected
  used_days unchanged

Admin rejects manager_approved → rejected
  used_days unchanged

[Theoretical] Admin reverses approved → rejected
  trigger fires: used_days -= days_count (with GREATEST 0 guard)
```

---

## Testing Strategy

1. Login as admin → all 4 seed requests visible in table
2. Use status filter "Validé manager" → only Eddy's RTT request shown
3. Approve Eddy's RTT (`manager_approved`) → confirm → status becomes `approved`
4. Check Supabase Studio: `leave_balances` for Eddy RTT — `used_days` should now be 3 (no RTT balance seeded — this should raise a trigger exception — see note)
5. Login as admin → use "Approuver" on Emma's `pending` request → confirm modal shows bypass wording → approve → `manager_reviewed_by` remains NULL
6. Verify Emma's balance: `used_days` now 10 (5 from the seeded approved + 5 new)
7. Use filter "Refusé" → Eddy's maladie shown; no action buttons visible

> **Note on step 4:** Eddy's RTT request is seeded with `manager_approved` status but there is no RTT balance seeded in `leave_balances`. Approving it will trigger the `update_leave_balance` function, which will raise a French exception "Aucun solde trouvé pour cet utilisateur, ce type de congé et cette année". This surfaces correctly as an error toast. For demo purposes, only approve requests for types that have balances seeded (Congé payé).
