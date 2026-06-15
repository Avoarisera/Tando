<script setup lang="ts">
import type { DashboardSnapshot } from '~/types'

defineProps<{
  snapshot: DashboardSnapshot
}>()
</script>

<template>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="bg-white rounded-lg border border-gray-200 p-4">
      <p class="text-sm text-gray-500">Effectif total</p>
      <p class="mt-1 text-3xl font-bold text-gray-900">{{ snapshot.total_employees }}</p>
    </div>

    <div class="bg-white rounded-lg border border-gray-200 p-4">
      <p class="text-sm text-gray-500">Présents aujourd'hui</p>
      <p class="mt-1 text-3xl font-bold text-brand-success">{{ snapshot.present }}</p>
    </div>

    <div class="bg-amber-50 rounded-lg border border-amber-200 p-4">
      <p class="text-sm text-amber-700">En congé aujourd'hui</p>
      <p class="mt-1 text-3xl font-bold text-amber-700">{{ snapshot.on_leave_today }}</p>
    </div>

    <div class="bg-white rounded-lg border border-gray-200 p-4">
      <p class="text-sm text-gray-500">En congé cette semaine</p>
      <p class="mt-1 text-3xl font-bold text-gray-900">{{ snapshot.on_leave_week }}</p>
    </div>
  </div>
</template>
