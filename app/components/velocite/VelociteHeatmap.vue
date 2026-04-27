<script setup lang="ts">
import type { MonthlyMetrics } from '~/composables/useMetrics'

const props = defineProps<{
  months: readonly string[]
  devs: readonly { id: string; display_name: string | null }[]
  metrics: Record<string, Record<string, MonthlyMetrics> | undefined>
  teamId: string
  workspaceId: string
}>()

const emit = defineEmits<{
  'dev-click': [devId: string]
  'cell-click': [devId: string, month: string]
}>()

function monthLabel(m: string): string {
  const [year, month] = m.split('-')
  const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  return `${labels[parseInt(month!) - 1]} ${year}`
}

const maxTickets = computed(() => {
  let max = 1
  for (const dev of props.devs) {
    for (const month of props.months) {
      const v = props.metrics[dev.id]?.[month]?.ticketsCount ?? 0
      if (v > max) max = v
    }
  }
  return max
})

function cellColor(tickets: number): string {
  if (tickets === 0) return 'bg-gray-100'
  const ratio = tickets / maxTickets.value
  if (ratio < 0.25) return 'bg-blue-100'
  if (ratio < 0.5) return 'bg-blue-300'
  if (ratio < 0.75) return 'bg-blue-500'
  return 'bg-blue-700'
}

function cellTextColor(tickets: number): string {
  const ratio = tickets / maxTickets.value
  return ratio >= 0.5 ? 'text-white' : 'text-gray-700'
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs border-separate border-spacing-0.5">
      <thead>
        <tr>
          <th class="text-left text-gray-500 font-medium pb-2 pr-4 min-w-[120px]">Dev</th>
          <th
            v-for="month in months"
            :key="month"
            class="text-center text-gray-500 font-medium pb-2 min-w-[56px]"
          >
            {{ monthLabel(month) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="dev in devs"
          :key="dev.id"
          class="group"
        >
          <td class="pr-4 py-1 cursor-pointer" @click.stop="emit('dev-click', dev.id)">
            <span class="font-medium text-gray-800 group-hover:text-brand-primary transition-colors truncate block max-w-[120px]">
              {{ dev.display_name ?? dev.id }}
            </span>
          </td>
          <td
            v-for="month in months"
            :key="month"
            class="rounded text-center py-1.5 font-semibold transition-opacity cursor-pointer hover:opacity-80"
            :class="[cellColor(metrics[dev.id]?.[month]?.ticketsCount ?? 0), cellTextColor(metrics[dev.id]?.[month]?.ticketsCount ?? 0)]"
            :title="`${metrics[dev.id]?.[month]?.ticketsCount ?? 0} tickets`"
            @click.stop="emit('cell-click', dev.id, month)"
          >
            {{ metrics[dev.id]?.[month]?.ticketsCount ?? 0 }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
