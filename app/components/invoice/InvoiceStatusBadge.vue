<script setup lang="ts">
import type { InvoiceStatus } from '~/types/index'

defineProps<{ status: InvoiceStatus }>()

const CONFIG: Record<InvoiceStatus, { label: string; classes: string }> = {
  en_attente: { label: 'En attente', classes: 'bg-gray-100 text-gray-700' },
  envoyee:    { label: 'Envoyée',    classes: 'bg-blue-100 text-blue-700' },
  payee:      { label: 'Payée',      classes: 'bg-green-100 text-green-700' },
}
</script>

<template>
  <span
    :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', CONFIG[status].classes]"
    :title="CONFIG[status].label"
    :aria-label="CONFIG[status].label"
  >
    {{ CONFIG[status].label }}
  </span>
</template>
