<script setup lang="ts">
import type { MonthlyMetrics } from '~/composables/useMetrics'

const props = defineProps<{
  months: readonly string[]
  devs: readonly { id: string, display_name: string | null }[]
  metrics: Record<string, Record<string, MonthlyMetrics> | undefined>
  teamId: string
  workspaceId: string
}>()
const emit = defineEmits<{ 'dev-click': [devId: string], 'cell-click': [devId: string, month: string] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

const cols = computed(() => props.months.map(m => velociteMonth(m, tag.value)))
const rows = computed(() => props.devs.map(d => ({
  id: d.id,
  name: d.display_name ?? d.id,
  values: props.months.map(m => props.metrics[d.id]?.[m]?.ticketsCount ?? 0),
})))
</script>

<template>
  <WbHeatmap
    :cols="cols"
    :rows="rows"
    :unit-label="t('velocityB.heatmap.unit')"
    @row-click="emit('dev-click', $event)"
    @cell-click="(id, i) => emit('cell-click', id, months[i]!)"
  />
</template>
