<script setup lang="ts">
import type { LeaveStatus } from '~/types/index'

const props = defineProps<{ status: LeaveStatus }>()

const CONFIG: Record<LeaveStatus, { label: string; classes: string }> = {
  pending:          { label: 'En attente',     classes: 'bg-gray-100 text-gray-700' },
  manager_approved: { label: 'Validé manager', classes: 'bg-amber-100 text-amber-700' },
  approved:         { label: 'Approuvé',        classes: 'bg-green-100 text-green-700' },
  rejected:         { label: 'Refusé',          classes: 'bg-red-100 text-red-700' },
}

const config = computed(() => CONFIG[props.status])
</script>

<template>
  <span
    :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', config.classes]"
    :title="config.label"
    :aria-label="config.label"
  >
    {{ config.label }}
  </span>
</template>
