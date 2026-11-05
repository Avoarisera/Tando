<script setup lang="ts">
import type { MonthlyMetrics } from '~/composables/useMetrics'

const props = defineProps<{ devId: string, name: string, currentMetrics: MonthlyMetrics, to: string }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const m = computed(() => props.currentMetrics)
</script>

<template>
  <NuxtLink :to="to" class="wb-card wb-card-b wb-stack-s wb-devcard">
    <div class="wb-row-b">
      <span class="wb-cp"><WbAvatar :name="name" :size="28" /><b class="small">{{ name }}</b></span>
      <WbIcon name="chevron-right" :size="16" />
    </div>
    <dl class="wb-grid wb-cols-2 small" style="gap: 8px; margin: 0">
      <div><dt class="wb-mut">{{ t('velocityB.kpi.tickets') }}</dt><dd class="h3 wb-num">{{ m.ticketsCount }}</dd></div>
      <div><dt class="wb-mut">{{ t('velocityB.kpi.points') }}</dt><dd class="h3 wb-num">{{ m.pointsSum.toFixed(1) }}</dd></div>
      <div><dt class="wb-mut">{{ t('velocityB.kpi.bugs') }}</dt><dd class="h3 wb-num">{{ m.bugsCount }}</dd></div>
      <div><dt class="wb-mut">{{ t('velocityB.kpi.cycle') }}</dt><dd class="h3 wb-num">{{ velociteDuration(m.medianDevCycleHours, tag) }}</dd></div>
    </dl>
    <p v-if="m.ticketsCount > 0" class="caption wb-mut2">{{ t('velocityB.kpi.rework') }} : {{ m.reworkRate.toFixed(1) }} %</p>
  </NuxtLink>
</template>

<style scoped>
.wb-devcard { color: inherit; text-decoration: none; }
.wb-devcard dd { margin: 0; }
.wb-devcard:hover { box-shadow: var(--shadow-2); }
</style>
