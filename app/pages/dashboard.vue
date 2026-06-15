<script setup lang="ts">
import type { DashboardEmployee } from '~/types'

definePageMeta({ middleware: 'admin-only', layout: 'private' })

type FilterMode = 'all' | 'present' | 'on_leave'

const { snapshot, isLoading, error, fetchSnapshot } = useDashboard()
const filter = ref<FilterMode>('all')

const filteredEmployees = computed<DashboardEmployee[]>(() => {
  if (!snapshot.value) return []
  if (filter.value === 'present') return snapshot.value.employees.filter(e => !e.on_leave)
  if (filter.value === 'on_leave') return snapshot.value.employees.filter(e => e.on_leave)
  return snapshot.value.employees
})

onMounted(fetchSnapshot)
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-6">
    <h1 class="text-2xl font-bold text-gray-900">Tableau de bord</h1>

    <template v-if="isLoading">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AppSkeleton v-for="i in 4" :key="i" class="h-24 rounded-lg" />
      </div>
      <AppSkeleton v-for="i in 5" :key="i" class="h-10 rounded" />
    </template>

    <AppErrorBanner
      v-else-if="error"
      :message="error"
      @retry="fetchSnapshot"
    />

    <template v-else-if="snapshot">
      <DashboardMetrics :snapshot="snapshot" />
      <EmployeeStatusTable
        :employees="filteredEmployees"
        :filter="filter"
        @update:filter="filter = $event"
      />
    </template>
  </div>
</template>
