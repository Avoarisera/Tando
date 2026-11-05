<script setup lang="ts">
import type { MonthlyMetrics } from '~/composables/useMetrics'
import type { TicketRow } from './TicketsTable.vue'

type MetricKey = 'ticketsCount' | 'pointsSum' | 'bugsCount' | 'medianDevCycleHours' | 'avgSize'

const props = defineProps<{
  metric: MetricKey
  devId: string
  devName: string
  months: string[]
  devMetrics: Record<string, MonthlyMetrics>
  workspaceId: string
  teamId?: string
}>()

const emit = defineEmits<{ close: [] }>()

const expanded = ref<Record<string, boolean>>({})
const ticketsCache = ref<Record<string, TicketRow[]>>({})
const loadingMonth = ref<string | null>(null)

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const UNITS: Record<MetricKey, string> = { ticketsCount: 'tickets', pointsSum: 'pts', bugsCount: 'tickets', medianDevCycleHours: 'h', avgSize: 'pts' }
const config = computed(() => ({
  label: t(`velocityB.drill.${props.metric}.label`),
  unit: UNITS[props.metric],
  note: t(`velocityB.drill.${props.metric}.note`),
}))

function getValue(month: string): number {
  return props.devMetrics[month]?.[props.metric] ?? 0
}

const monthlyValues = computed(() => props.months.map(m => getValue(m)))

const avgValue = computed(() => {
  if (!monthlyValues.value.length) return 0
  return monthlyValues.value.reduce((s, v) => s + v, 0) / monthlyValues.value.length
})

function formatValue(v: number): string {
  return props.metric === 'medianDevCycleHours' ? `${v.toFixed(0)}h` : v.toFixed(1)
}

const monthLabel = (m: string) => velociteMonth(m, tag.value, true)

async function toggleMonth(month: string) {
  expanded.value[month] = !expanded.value[month]
  if (!expanded.value[month] || ticketsCache.value[month]) return

  loadingMonth.value = month
  try {
    const data = await $fetch<TicketRow[]>('/api/tickets', {
      query: {
        workspaceId: props.workspaceId,
        teamId: props.teamId,
        assigneeId: props.devId,
        month,
      },
    })
    ticketsCache.value[month] = data
  } finally {
    loadingMonth.value = null
  }
}

function linearUrl(identifier: string | null): string {
  if (!identifier) return '#'
  return `https://linear.app/issue/${identifier}`
}

</script>

<template>
  <WbSidePanel :title="config.label" :subtitle="devName" @close="emit('close')">
    <div class="wb-card wb-card-b wb-stack-s" style="background: var(--bg); box-shadow: none">
      <p class="caption wb-mut">{{ t('velocityB.drill.formula', { n: months.length }) }}</p>
      <p class="wb-mono">
        <b>{{ formatValue(avgValue) }} {{ config.unit }}</b>
        = ({{ monthlyValues.map(v => formatValue(v)).join(' + ') }}) / {{ months.length }}
      </p>
    </div>

    <ul class="wb-stack-s wb-drill">
      <li v-for="(month, i) in months" :key="month" class="wb-card">
        <button type="button" class="wb-drill-h" :aria-expanded="!!expanded[month]" @click="toggleMonth(month)">
          <span class="h3">{{ monthLabel(month) }}</span>
          <span class="wb-row" style="gap: 8px">
            <b class="wb-num small">{{ formatValue(monthlyValues[i] ?? 0) }} {{ config.unit }}</b>
            <WbIcon name="chevron-down" :size="14" :class="{ 'wb-drill-up': expanded[month] }" />
          </span>
        </button>
        <div v-if="expanded[month]" class="wb-card-b" style="padding-top: 0">
          <WbSkeleton v-if="loadingMonth === month" variant="table" :count="3" />
          <ul v-else-if="ticketsCache[month]?.length" class="wb-list">
            <li v-for="tk in ticketsCache[month]" :key="tk.id" class="small">
              <a :href="linearUrl(tk.identifier)" target="_blank" rel="noopener noreferrer" class="wb-mono" @click.stop>{{ tk.identifier ?? '—' }}</a>
              <span class="wb-grow">{{ tk.title ?? '—' }}</span>
              <WbBadge size="sm"><span class="wb-num">{{ tk.estimate != null ? t('velocityB.insights.pts', { n: tk.estimate }) : t('velocityB.insights.noEstimate') }}</span></WbBadge>
            </li>
          </ul>
          <p v-else class="small wb-mut">{{ t('velocityB.drill.noTickets') }}</p>
        </div>
      </li>
    </ul>

    <p class="small wb-mut2"><b>{{ t('velocityB.drill.method') }}</b> {{ config.note }}</p>
  </WbSidePanel>
</template>

<style scoped>
.wb-drill { list-style: none; margin: 0; padding: 0; }
.wb-drill-h { all: unset; box-sizing: border-box; cursor: pointer; display: flex; justify-content: space-between; align-items: center; width: 100%; padding: var(--space-3) var(--space-4); }
.wb-drill-h:focus-visible { outline: 2px solid var(--focus); }
.wb-drill-up { transform: rotate(180deg); }
</style>
