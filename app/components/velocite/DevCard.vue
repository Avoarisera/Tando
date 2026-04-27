<script setup lang="ts">
import type { MonthlyMetrics } from '~/composables/useMetrics'

const props = defineProps<{
  devId: string
  name: string
  currentMetrics: MonthlyMetrics
  to: string
}>()

const reworkRateClass = computed(() => {
  const r = props.currentMetrics.reworkRate
  if (r === 0) return 'text-gray-400'
  if (r < 10) return 'text-green-600'
  if (r <= 25) return 'text-amber-600'
  return 'text-red-600'
})
</script>

<template>
  <NuxtLink
    :to="to"
    class="block bg-white rounded-lg border border-gray-200 p-4 hover:border-brand-primary hover:shadow-sm transition-all"
  >
    <div class="flex items-start justify-between">
      <p class="font-semibold text-gray-900 text-sm truncate max-w-[140px]">{{ name }}</p>
      <span class="text-xs text-brand-primary font-medium flex-shrink-0">Voir →</span>
    </div>
    <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div>
        <p class="text-gray-500">Tickets</p>
        <p class="font-bold text-gray-900 text-base">{{ currentMetrics.ticketsCount }}</p>
      </div>
      <div>
        <p class="text-gray-500">Points</p>
        <p class="font-bold text-gray-900 text-base">{{ currentMetrics.pointsSum.toFixed(1) }}</p>
      </div>
      <div>
        <p class="text-gray-500">Bugs</p>
        <p class="font-bold text-gray-900 text-base">{{ currentMetrics.bugsCount }}</p>
      </div>
      <div>
        <p class="text-gray-500">Cycle P50</p>
        <p class="font-bold text-gray-900 text-base">
          {{ currentMetrics.medianDevCycleHours > 0 ? `${currentMetrics.medianDevCycleHours.toFixed(0)}h` : '—' }}
        </p>
      </div>
    </div>
    <p
      v-if="currentMetrics.ticketsCount > 0"
      class="mt-2 text-xs"
      :class="reworkRateClass"
    >
      Rework : {{ currentMetrics.reworkRate.toFixed(1) }}%
    </p>
  </NuxtLink>
</template>
