<script setup lang="ts">
import type { TicketRow } from '~/components/velocite/TicketsTable.vue'
definePageMeta({ titleKey: 'nav.velocity', layout: 'private', middleware: 'admin-only' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

const route = useRoute()
const router = useRouter()
const teamId = route.params.teamId as string
const devId = route.params.devId as string
const workspaceId = route.query.workspaceId as string
const monthParam = route.query.month as string | undefined

import { VELOCITE_RANGES, getAvailableYears, isValidRange, isValidYear, computeFetchMonths } from '~/utils/velocite-periods'

const availableYears = getAvailableYears()
const currentYear = new Date().getFullYear()

const yearQuery = Number(route.query.year)
const rangeQuery = Number(route.query.range)

function rangeForMonth(month: string): number {
  const now = new Date()
  const [y2, m2] = month.split('-').map(Number)
  const diff = (now.getFullYear() - y2!) * 12 + (now.getMonth() - m2! + 1)
  if (diff <= 3) return 3
  if (diff <= 6) return 6
  return 12
}

const selectedYear = ref(
  isValidYear(yearQuery)
    ? yearQuery
    : monthParam ? Number(monthParam.split('-')[0]) : currentYear,
)
const selectedRange = ref(
  isValidRange(rangeQuery)
    ? rangeQuery
    : monthParam ? rangeForMonth(monthParam) : 6,
)

const { data, isLoading, error, fetchMetrics, momVariation } = useMetrics()

const tickets = ref<TicketRow[]>([])
const ticketsLoading = ref(false)
const selectedMonths = ref<string[]>([])
const showReworkOnly = ref(false)

const displayedTickets = computed(() =>
  showReworkOnly.value ? tickets.value.filter(t => t.hasRework) : tickets.value,
)

function toggleMonth(m: string) {
  const idx = selectedMonths.value.indexOf(m)
  if (idx === -1) {
    selectedMonths.value = [...selectedMonths.value, m]
  } else if (selectedMonths.value.length > 1) {
    // Keep at least one selected
    selectedMonths.value = selectedMonths.value.filter(x => x !== m)
  }
}

function resetMonths() {
  selectedMonths.value = [...months.value]
}

onMounted(async () => {
  await fetchMetrics({ workspaceId, teamId, months: computeFetchMonths(selectedYear.value, selectedRange.value) })
  selectedMonths.value = monthParam ? [monthParam] : [...months.value]
  await fetchCurrentMonthTickets()
})

watch([selectedYear, selectedRange], async () => {
  await fetchMetrics({ workspaceId, teamId, months: computeFetchMonths(selectedYear.value, selectedRange.value) })
  selectedMonths.value = [...months.value]
  await fetchCurrentMonthTickets()
})

watch(selectedMonths, fetchCurrentMonthTickets)

// API returns N+1 months (with one lookback for MoM); strip the first for display.
const months = computed(() => (data.value?.months ?? []).slice(1))
const currentMonth = computed(() => months.value[months.value.length - 1] ?? '')
const devInfo = computed(() => data.value?.devs.find(d => d.id === devId))
const devMetrics = computed(() => data.value?.metrics[devId] ?? {})

const isSingleMonth = computed(() => selectedMonths.value.length === 1)

const aggregatedMetrics = computed(() => {
  const sel = selectedMonths.value.length ? selectedMonths.value : months.value
  let ticketsCount = 0
  let pointsSum = 0
  let bugsCount = 0
  const cycleHours: number[] = []
  const p90Hours: number[] = []
  const qaHours: number[] = []
  const reviewHours: number[] = []
  const wipValues: number[] = []
  for (const m of sel) {
    const mm = devMetrics.value[m]
    if (!mm) continue
    ticketsCount += mm.ticketsCount
    pointsSum += mm.pointsSum
    bugsCount += mm.bugsCount
    if (mm.medianDevCycleHours > 0) cycleHours.push(mm.medianDevCycleHours)
    if (mm.p90DevCycleHours > 0) p90Hours.push(mm.p90DevCycleHours)
    if (mm.medianQaTimeHours > 0) qaHours.push(mm.medianQaTimeHours)
    if (mm.medianReviewTimeHours > 0) reviewHours.push(mm.medianReviewTimeHours)
    wipValues.push(mm.wipCount)
  }
  const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
  return {
    ticketsCount,
    pointsSum,
    bugsCount,
    avgSize: 0,
    medianDevCycleHours: avg(cycleHours),
    p90DevCycleHours: avg(p90Hours),
    medianLeadTimeHours: 0,
    medianQaTimeHours: avg(qaHours),
    medianReviewTimeHours: avg(reviewHours),
    reworkRate: 0,
    wipCount: avg(wipValues),
    ticketIds: [] as string[],
  }
})

const ticketValues = computed(() => months.value.map(m => devMetrics.value[m]?.ticketsCount ?? 0))
const pointValues = computed(() => months.value.map(m => devMetrics.value[m]?.pointsSum ?? 0))
const featureValues = computed(() => months.value.map(m => {
  const t = devMetrics.value[m]?.ticketsCount ?? 0
  const b = devMetrics.value[m]?.bugsCount ?? 0
  return t - b
}))
const bugValues = computed(() => months.value.map(m => devMetrics.value[m]?.bugsCount ?? 0))
const cycleP50Values = computed(() => months.value.map(m => devMetrics.value[m]?.medianDevCycleHours ?? 0))
const qaTimeValues = computed(() => months.value.map(m => devMetrics.value[m]?.medianQaTimeHours ?? 0))
const reviewTimeValues = computed(() => months.value.map(m => devMetrics.value[m]?.medianReviewTimeHours ?? 0))

const hasCycleQaData = computed(() =>
  cycleP50Values.value.some(v => v > 0) || qaTimeValues.value.some(v => v > 0) || reviewTimeValues.value.some(v => v > 0)
)

const monthLabel = (m: string) => velociteMonth(m, tag.value)
const chartLabels = computed(() => months.value.map(monthLabel))

// Rework rate: reworked tickets / total tickets for the selected month.
// Derived from the tickets data — consistent with the ↩ badge shown in the table.
const periodReworkRate = computed(() => {
  if (!tickets.value.length) return 0
  const reworked = tickets.value.filter(t => t.hasRework).length
  return (reworked / tickets.value.length) * 100
})

async function fetchCurrentMonthTickets() {
  if (!selectedMonths.value.length) return
  ticketsLoading.value = true
  try {
    const fetched = await $fetch<TicketRow[]>('/api/tickets', {
      query: { workspaceId, teamId, assigneeId: devId, months: selectedMonths.value.join(',') },
    })
    tickets.value = fetched
  }
  finally {
    ticketsLoading.value = false
  }
}

function goBack() {
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push(`/velocite/teams/${teamId}?workspaceId=${workspaceId}&year=${selectedYear.value}&range=${selectedRange.value}`)
  }
}

async function handleRetry() {
  await fetchMetrics({ workspaceId, teamId, months: computeFetchMonths(selectedYear.value, selectedRange.value) })
  await fetchCurrentMonthTickets()
}

const selectedMonth = computed(() => isSingleMonth.value ? selectedMonths.value[0] : undefined)

function variationLabel(metric: 'ticketsCount' | 'pointsSum' | 'bugsCount' | 'medianDevCycleHours'): string {
  const v = momVariation(devId, metric, selectedMonth.value)
  if (v === null) return ''
  const sign = v > 0 ? '+' : ''
  return t('velocityB.dev.vsPrev', { v: `${sign}${v}` })
}

function variationTrend(metric: 'ticketsCount' | 'pointsSum'): 'up' | 'down' | 'neutral' {
  const v = momVariation(devId, metric)
  if (v === null || v === 0) return 'neutral'
  return v > 0 ? 'up' : 'down'
}

function ticketInsight(): string {
  const avg = ticketValues.value.length
    ? (ticketValues.value.reduce((s, v) => s + v, 0) / ticketValues.value.length).toFixed(1)
    : '0'
  return t('velocityB.dev.avgTickets', { n: avg })
}

function pointInsight(): string {
  const avg = pointValues.value.length
    ? (pointValues.value.reduce((s, v) => s + v, 0) / pointValues.value.length).toFixed(1)
    : '0'
  return t('velocityB.dev.avgPoints', { n: avg })
}

function compositionInsight(): string {
  const totalBugs = bugValues.value.reduce((s, v) => s + v, 0)
  const totalTickets = ticketValues.value.reduce((s, v) => s + v, 0)
  if (totalTickets === 0) return t('velocityB.dev.noData')
  const ratio = Math.round((totalBugs / totalTickets) * 100)
  return t('velocityB.dev.bugRatio', { n: ratio })
}

function handleTicketClick(ticketId: string) {
  router.push(`/velocite/issues/${ticketId}?workspaceId=${workspaceId}&returnUrl=${encodeURIComponent(route.fullPath)}`)
}

usePageHeader(() => ({
  crumbs: [
    { label: t('nav.velocity'), to: '/velocite' },
    { label: t('velocityB.team'), to: `/velocite/teams/${teamId}?workspaceId=${workspaceId}&year=${selectedYear.value}&range=${selectedRange.value}` },
    { label: devInfo.value?.display_name ?? t('velocityB.dev.title') },
  ],
}))

const yearOptions = computed(() => availableYears.map(y => ({ value: String(y), label: y === currentYear ? t('velocityB.period.current', { y }) : String(y) })))
const yearModel = computed({ get: () => String(selectedYear.value), set: (v: string) => { selectedYear.value = Number(v) } })
const rangeOptions = computed(() => VELOCITE_RANGES.map(r => ({ value: String(r.value), label: t('velocityB.period.months', { n: r.value }) })))
const rangeModel = computed({ get: () => String(selectedRange.value), set: (v: string) => { selectedRange.value = Number(v) } })

const reworkedCount = computed(() => tickets.value.filter(tk => tk.hasRework).length)
const wipWord = computed(() => {
  const w = aggregatedMetrics.value.wipCount
  return w <= 2 ? t('velocityB.dev.wipGood') : w <= 3 ? t('velocityB.dev.wipLimit') : t('velocityB.dev.wipHigh')
})
const wipTone = computed(() => {
  const w = aggregatedMetrics.value.wipCount
  return w <= 2 ? 'wb-c-success' : w <= 3 ? 'wb-c-warning' : 'wb-c-danger'
})
function mom(metric: 'ticketsCount' | 'pointsSum'): string {
  return isSingleMonth.value && momVariation(devId, metric, selectedMonth.value) !== null ? variationLabel(metric) : ''
}
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-row-b wb-wrap">
      <!-- back to the team sits with the person, on the left (feedback 05/11) -->
      <div class="wb-row" style="gap: 12px">
        <WbButton variant="secondary" size="sm" icon="arrow-left" data-action="back-team" @click="goBack">{{ t('velocityB.team') }}</WbButton>
        <WbAvatar :name="devInfo?.display_name ?? devId" :size="48" />
        <div>
          <h2 class="h1">{{ devInfo?.display_name ?? devId }}</h2>
          <p class="small wb-mut">{{ t('velocityB.dev.visibility') }}</p>
        </div>
      </div>
      <div class="wb-row wb-wrap wb-period-row">
        <WbSelect v-model="yearModel" :options="yearOptions" :aria-label="t('velocityB.period.year')" />
        <div class="wb-period"><WbSegmented v-model="rangeModel" :options="rangeOptions" :label="t('velocityB.period.label')" /></div>
      </div>
    </div>

    <WbSkeleton v-if="isLoading" variant="metric" :count="4" />
    <WbErrorState v-else-if="error" :message="readableApiError(error)" @retry="handleRetry" />

    <template v-else>
      <div class="wb-grid wb-cols-3 wb-vel-kpis">
        <WbMetricCard :label="t('velocityB.kpi.tickets')" :value="aggregatedMetrics.ticketsCount" :hint="mom('ticketsCount') || undefined" :info="t('velocityB.kpi.ticketsInfo')" />
        <WbMetricCard :label="t('velocityB.kpi.points')" :value="aggregatedMetrics.pointsSum.toFixed(0)" :hint="mom('pointsSum') || undefined" :info="t('velocityB.kpi.pointsInfo')" />
        <WbMetricCard :label="t('velocityB.kpi.bugs')" :value="aggregatedMetrics.bugsCount" :hint="t('velocityB.kpi.bugsHint')" :info="t('velocityB.kpi.bugsInfo')" />
        <WbMetricCard
          :label="t('velocityB.kpi.cycle')"
          :value="velociteDuration(aggregatedMetrics.medianDevCycleHours, tag)"
          :hint="aggregatedMetrics.p90DevCycleHours > 0 ? t('velocityB.kpi.p90', { v: velociteDuration(aggregatedMetrics.p90DevCycleHours, tag) }) : undefined"
          :info="t('velocityB.kpi.cycleInfo')"
        />
        <WbMetricCard
          :label="t('velocityB.kpi.rework')"
          :value="periodReworkRate.toFixed(1)"
          unit="%"
          :hint="t('velocityB.kpi.reworkCount', { n: reworkedCount, of: tickets.length })"
          :info="t('velocityB.kpi.reworkInfo')"
        />
        <WbMetricCard :label="t('velocityB.kpi.wip')" :value="aggregatedMetrics.wipCount.toFixed(1)" :info="t('velocityB.kpi.wipInfo')">
          <p class="caption" :class="wipTone">{{ wipWord }}</p>
        </WbMetricCard>
      </div>

      <WbCard :title="t('velocityB.tickets.caption')" :pad="false">
        <div class="wb-card-b wb-row wb-wrap" style="padding-bottom: 0">
          <WbFilterChip
            v-for="m in months"
            :key="m"
            :model-value="selectedMonths.includes(m)"
            @update:model-value="toggleMonth(m)"
          >
            {{ monthLabel(m) }}
          </WbFilterChip>
          <WbFilterChip v-model="showReworkOnly">{{ t('velocityB.dev.reworkOnly') }}</WbFilterChip>
        </div>
        <TicketsTable :tickets="displayedTickets" :is-loading="ticketsLoading" @ticket-click="handleTicketClick" />
      </WbCard>

      <div class="wb-grid wb-cols-2">
        <WbCard :title="t('velocityB.dev.cycleTitle')">
          <WbChartFrame
            v-if="hasCycleQaData"
            :title="t('velocityB.dev.cycleChart')"
            :info="t('velocityB.dev.cycleInfo')"
            :legend="[
              { label: t('velocityB.dev.cycleDev'), color: '--chart-1' },
              { label: t('velocityB.dev.cycleReview'), color: '--chart-2' },
              { label: t('velocityB.dev.cycleQa'), color: '--chart-3' },
            ]"
          >
            <WbBarChart
              :title="t('velocityB.dev.cycleChart')"
              :labels="chartLabels"
              :series="[
                { label: t('velocityB.dev.cycleDev'), data: cycleP50Values, color: '--chart-1' },
                { label: t('velocityB.dev.cycleReview'), data: reviewTimeValues, color: '--chart-2' },
                { label: t('velocityB.dev.cycleQa'), data: qaTimeValues, color: '--chart-3' },
              ]"
              stacked
              :height="200"
              :legend="false"
            />
            <p class="small wb-mut2 wb-num">
              {{ t('velocityB.kpi.cycle') }} : {{ velociteDuration(aggregatedMetrics.medianDevCycleHours, tag) }}
              <template v-if="aggregatedMetrics.p90DevCycleHours > 0"> · {{ t('velocityB.kpi.p90', { v: velociteDuration(aggregatedMetrics.p90DevCycleHours, tag) }) }}</template>
            </p>
          </WbChartFrame>
          <p v-else class="wb-mut">{{ t('velocityB.dev.noCycle') }}</p>
        </WbCard>

        <WbCard :title="t('velocityB.charts.composition')">
          <WbChartFrame
            :title="t('velocityB.dev.compositionChart')"
            :info="t('velocityB.dev.compositionInfo')"
            :legend="[{ label: t('velocityB.charts.features'), color: '--chart-1' }, { label: t('velocityB.charts.bugs'), color: '--chart-2' }]"
          >
            <ChartComposition :months="months" :features="featureValues" :bugs="bugValues" />
            <InsightBadge :text="compositionInsight()" trend="neutral" />
          </WbChartFrame>
        </WbCard>

        <WbCard :title="t('velocityB.charts.tickets')">
          <WbChartFrame :title="t('velocityB.charts.tickets')" :info="t('velocityB.dev.ticketsInfo')" :legend="[{ label: t('velocityB.charts.delivered'), color: '--chart-1' }]">
            <ChartTickets :months="months" :values="ticketValues" />
            <InsightBadge :text="ticketInsight()" :trend="variationTrend('ticketsCount')" />
          </WbChartFrame>
        </WbCard>

        <WbCard :title="t('velocityB.charts.points')">
          <WbChartFrame :title="t('velocityB.charts.points')" :info="t('velocityB.dev.pointsInfo')" :legend="[{ label: t('velocityB.charts.pointsDelivered'), color: '--chart-1' }]">
            <ChartPoints :months="months" :values="pointValues" />
            <InsightBadge :text="pointInsight()" :trend="variationTrend('pointsSum')" />
          </WbChartFrame>
        </WbCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Six indicators on one row on wide screens */
@container wbapp (min-width: 1280px) { .wb-vel-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.wb-vel-kpis :deep(.wb-metric) { padding: var(--space-3) var(--space-4); }
/* The period switch never widens the page (TND-09): it scrolls inside on small screens */
.wb-period-row { min-width: 0; max-width: 100%; }
.wb-period { min-width: 0; max-width: 100%; overflow-x: auto; }
</style>
