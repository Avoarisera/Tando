# RFC-006 — Shared UI Components

**ID:** RFC-006  
**Title:** AppConfirmModal + useToast + AppToastContainer  
**Sprint:** 2  
**Complexity:** Low  
**Predecessor:** RFC-005  
**Successor:** RFC-007

---

## Summary

This RFC builds the two shared UI primitives required by every mutation action in Sprint 2: a reusable confirmation modal and a global toast notification system. It covers features **F29** (confirm modal) and **F30** (toasts). Both must be complete before any action-based features (RFC-007 through RFC-009) are implemented.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F29 | AppConfirmModal (approve/reject confirmation) | Low |
| F30 | useToast + AppToastContainer | Low |

---

## Dependencies

- **Predecessors:** RFC-005 (AppButton component already exists)
- **Successors:** RFC-007, RFC-008, RFC-009 — all mutation actions use toasts and confirm modals

---

## Technical Approach

### Files created in this RFC

```
app/
├── components/
│   └── app/
│       ├── AppModal.vue              ← Base modal primitive
│       ├── AppConfirmModal.vue       ← Confirm/cancel with async action
│       ├── AppToast.vue              ← Single toast notification
│       └── AppToastContainer.vue    ← Singleton toast list (added to private.vue)
└── composables/
    └── useToast.ts                  ← Global toast state management
```

The private layout (`layouts/private.vue`) must be updated to include `<AppToastContainer />`.

---

### AppModal.vue (base modal primitive)

Generic modal shell used by both `AppConfirmModal` and `LeaveRequestForm` (RFC-007).

```vue
<script setup lang="ts">
defineProps<{
  title: string
  maxWidth?: string
}>()
defineEmits<{ close: [] }>()

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
    @click.self="$emit('close')"
  >
    <!-- Dialog -->
    <div
      :class="['bg-white rounded-xl shadow-xl w-full', maxWidth ?? 'max-w-lg']"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'modal-title'"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 id="modal-title" class="text-lg font-semibold text-gray-900">{{ title }}</h2>
        <button
          class="text-gray-400 hover:text-gray-600 p-1 rounded"
          aria-label="Fermer"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>
      <!-- Content -->
      <div class="px-6 py-4">
        <slot />
      </div>
    </div>
  </div>
</template>
```

---

### AppConfirmModal.vue

```vue
<script setup lang="ts">
const props = defineProps<{
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
}>()
const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const isConfirming = ref(false)

async function handleConfirm() {
  isConfirming.value = true
  emit('confirm')
  // Parent controls closing; isConfirming reset when component is destroyed
}
</script>

<template>
  <AppModal :title="title" @close="$emit('cancel')">
    <p class="text-gray-600 text-sm">{{ description }}</p>
    <div class="flex justify-end gap-3 mt-6">
      <AppButton variant="secondary" @click="$emit('cancel')">
        {{ cancelLabel ?? 'Annuler' }}
      </AppButton>
      <AppButton
        variant="primary"
        :disabled="isConfirming"
        @click="handleConfirm"
      >
        <span v-if="isConfirming" class="flex items-center gap-2">
          <span class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          En cours…
        </span>
        <span v-else>{{ confirmLabel ?? 'Confirmer' }}</span>
      </AppButton>
    </div>
  </AppModal>
</template>
```

**Usage pattern in parent components:**

```vue
<!-- Parent template -->
<AppConfirmModal
  v-if="confirmAction"
  :title="`Approuver la demande de ${confirmAction.employeeName} ?`"
  :description="`Du ${confirmAction.startDate} au ${confirmAction.endDate} (${confirmAction.daysCount} jours).`"
  confirm-label="Approuver"
  @confirm="executeConfirmAction"
  @cancel="confirmAction = null"
/>
```

The `confirm` emit triggers the async action in the parent; the parent closes the modal by setting `confirmAction = null` after success/error.

---

### useToast composable

```ts
// app/composables/useToast.ts
interface Toast {
  id: string
  message: string
  type: 'success' | 'error'
}

const toasts = useState<Toast[]>('toasts', () => [])
const MAX_TOASTS = 3

export function useToast() {
  function add(message: string, type: Toast['type'] = 'success') {
    const id = crypto.randomUUID()

    // Evict oldest toast if at max capacity
    if (toasts.value.length >= MAX_TOASTS) {
      toasts.value = toasts.value.slice(toasts.value.length - MAX_TOASTS + 1)
    }

    toasts.value.push({ id, message, type })

    if (type === 'success') {
      setTimeout(() => remove(id), 3000)
    }
  }

  function remove(id: string) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return { toasts: readonly(toasts), add, remove }
}
```

**Behavior rules:**
- Success toasts: auto-dismiss after 3 seconds
- Error toasts: persist until manually closed
- Maximum 3 simultaneous toasts: oldest removed when capacity exceeded

---

### AppToast.vue

```vue
<script setup lang="ts">
defineProps<{
  id: string
  message: string
  type: 'success' | 'error'
}>()
defineEmits<{ dismiss: [id: string] }>()
</script>

<template>
  <div
    :class="[
      'flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg min-w-72 max-w-sm',
      type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
    ]"
    role="alert"
    :aria-live="type === 'error' ? 'assertive' : 'polite'"
  >
    <span :class="type === 'success' ? 'text-green-600' : 'text-red-600'" class="text-sm flex-1">
      {{ message }}
    </span>
    <button
      :class="type === 'success' ? 'text-green-400 hover:text-green-600' : 'text-red-400 hover:text-red-600'"
      aria-label="Fermer la notification"
      @click="$emit('dismiss', id)"
    >
      ✕
    </button>
  </div>
</template>
```

---

### AppToastContainer.vue

Singleton placed in `layouts/private.vue`.

```vue
<script setup lang="ts">
const { toasts, remove } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <TransitionGroup name="toast">
        <AppToast
          v-for="toast in toasts"
          :key="toast.id"
          :id="toast.id"
          :message="toast.message"
          :type="toast.type"
          class="pointer-events-auto"
          @dismiss="remove"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style>
.toast-enter-active, .toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from { opacity: 0; transform: translateY(8px); }
.toast-leave-to   { opacity: 0; transform: translateY(8px); }
</style>
```

**Layout update:** Add `<AppToastContainer />` at the end of `layouts/private.vue`'s template.

---

## Acceptance Criteria

### F29 — AppConfirmModal

- [ ] Modal renders with title and description props
- [ ] Clicking "Confirmer" emits `confirm` event; button shows spinner and disables during async wait
- [ ] Clicking "Annuler" or the ✕ or backdrop emits `cancel` event and closes modal
- [ ] Pressing Escape emits `cancel` and closes modal
- [ ] Modal has `role="dialog"` and `aria-modal="true"`
- [ ] Focus is trapped inside (Tab cannot leave the dialog)
- [ ] `confirmLabel` and `cancelLabel` props override defaults ("Confirmer" / "Annuler")

### F30 — Toasts

- [ ] `useToast().add('message', 'success')` shows a green toast
- [ ] `useToast().add('message', 'error')` shows a red toast
- [ ] Success toast auto-dismisses after 3 seconds
- [ ] Error toast persists until manually closed
- [ ] Manual close button (✕) removes the toast immediately
- [ ] Maximum 3 toasts shown simultaneously; oldest evicted when exceeded
- [ ] Toasts positioned bottom-right on desktop, bottom-center on mobile (adjust if needed)
- [ ] `AppToastContainer` is present in `layouts/private.vue`
- [ ] Toast enter/leave transition is smooth (200ms)

---

## Usage Examples

```ts
// In a composable or component action:
const toast = useToast()

// After successful approval:
toast.add('Demande approuvée avec succès')

// After failed operation:
toast.add('Erreur lors de la mise à jour. Veuillez réessayer.', 'error')
```

```vue
<!-- In a manager/admin view: -->
<AppConfirmModal
  v-if="pendingApproval"
  title="Approuver la demande ?"
  :description="`Demande de ${pendingApproval.employee} du ${pendingApproval.start} au ${pendingApproval.end}.`"
  confirm-label="Approuver"
  @confirm="handleApprove"
  @cancel="pendingApproval = null"
/>
```

---

## Testing Strategy

1. Add a test button that calls `toast.add('Test succès')` → green toast appears, auto-dismisses after 3s
2. Add a test button that calls `toast.add('Test erreur', 'error')` → red toast stays until manually closed
3. Click ✕ on any toast → it disappears immediately
4. Add 4 toasts rapidly → only 3 shown (oldest removed)
5. Open `AppConfirmModal` → verify Escape key closes it
6. Click backdrop area outside the modal → modal closes
7. Click Confirmer → spinner shows, parent can control closing
