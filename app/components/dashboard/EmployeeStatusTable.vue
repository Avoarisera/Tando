<script setup lang="ts">
import type { DashboardEmployee } from '~/types'

type FilterMode = 'all' | 'present' | 'on_leave'

const props = defineProps<{
  employees: DashboardEmployee[]
  filter: FilterMode
}>()

const emit = defineEmits<{
  'update:filter': [value: FilterMode]
}>()

const filters: { label: string; value: FilterMode }[] = [
  { label: 'Tous', value: 'all' },
  { label: 'Présents', value: 'present' },
  { label: 'En congé', value: 'on_leave' },
]

function seniority(joinedAt: string): string {
  const years = new Date().getFullYear() - new Date(joinedAt).getFullYear()
  if (years < 1) {
    const months = Math.floor((Date.now() - new Date(joinedAt).getTime()) / (1000 * 60 * 60 * 24 * 30))
    return `${months} mois`
  }
  return `${years} an${years > 1 ? 's' : ''}`
}

function returnDate(endDate: string): string {
  const d = new Date(endDate)
  d.setDate(d.getDate() + 1)
  return formatDate(d.toISOString().substring(0, 10))
}
</script>

<template>
  <div>
    <div class="flex gap-2 mb-4" role="group" aria-label="Filtrer les employés">
      <button
        v-for="f in filters"
        :key="f.value"
        class="px-3 py-1.5 text-sm rounded-md border transition-colors"
        :class="filter === f.value
          ? 'bg-brand-primary text-white border-brand-primary'
          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'"
        @click="emit('update:filter', f.value)"
      >
        {{ f.label }}
      </button>
    </div>

    <div v-if="employees.length === 0">
      <AppEmptyState title="Aucun employé" description="Aucun résultat pour ce filtre." />
    </div>

    <div v-else class="overflow-x-auto rounded-lg border border-gray-200">
      <table class="min-w-full divide-y divide-gray-200 text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left font-medium text-gray-500">Employé</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500">Équipe</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500">Ancienneté</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500">Congé / Retour</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-100">
          <tr v-for="emp in employees" :key="emp.id">
            <td class="px-4 py-3 font-medium text-gray-900">
              {{ emp.last_name }} {{ emp.first_name }}
            </td>
            <td class="px-4 py-3 text-gray-500">{{ emp.team_name ?? '—' }}</td>
            <td class="px-4 py-3 text-gray-500">{{ seniority(emp.joined_at) }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                :class="emp.on_leave
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-green-100 text-green-700'"
                :title="emp.on_leave ? 'En congé' : 'Présent'"
              >
                {{ emp.on_leave ? 'En congé' : 'Présent' }}
              </span>
            </td>
            <td class="px-4 py-3 text-gray-500">
              <template v-if="emp.on_leave && emp.leave_type_name && emp.leave_end_date">
                {{ emp.leave_type_name }} — Retour le {{ returnDate(emp.leave_end_date) }}
              </template>
              <template v-else>—</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
