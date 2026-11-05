<script setup lang="ts">
import { VELOCITE_RANGES, getAvailableYears, isValidRange, isValidYear, computeSelectionMonths } from '~/utils/velocite-periods'

// key: switching team (same page, other param) remounts the page with the new team
definePageMeta({ titleKey: 'nav.velocity', layout: 'private', middleware: 'velocity-access', key: r => String(r.params.teamId) })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

const route = useRoute()
const router = useRouter()
const teamId = route.params.teamId as string
const workspaceId = route.query.workspaceId as string

const { data, isLoading, error, fetchMetrics } = useMetrics()
const { teams, fetchTeams } = useLinearTeams()
// the overview passes the name in the link: shown at once, before anything loads (TND-24)
const teamName = computed(() => teams.value.find(t => t.id === teamId)?.name ?? (route.query.name as string | undefined) ?? null)
const teamOptions = computed(() => teams.value.map(x => ({ value: x.id, label: x.name ?? x.id })))
const teamModel = computed({
  get: () => teamId,
  set: (id: string) => {
    const name = teams.value.find(x => x.id === id)?.name ?? undefined
    navigateTo({ path: `/velocite/teams/${id}`, query: { workspaceId, name, year: String(selectedYear.value), range: String(selectedRange.value) } })
  },
})
const { problematic, blocked, fetchInsights } = useTeamInsights()


const availableYears = getAvailableYears()
const currentYear = new Date().getFullYear()

const yearQuery = Number(route.query.year)
const rangeQuery = Number(route.query.range)
const selectedYear = ref(isValidYear(yearQuery) ? yearQuery : currentYear)
const selectedRange = ref(isValidRange(rangeQuery) ? rangeQuery : 6)

// Keep selection in URL so router.back() restores it correctly
watch([selectedYear, selectedRange], ([y, r]) => {
  router.replace({ query: { ...route.query, year: String(y), range: String(r) } })
}, { immediate: false })

function load() {
  const months = computeSelectionMonths(selectedYear.value, selectedRange.value)
  fetchMetrics({ workspaceId, teamId, months })
  fetchInsights({ workspaceId, teamId, year: selectedYear.value, range: selectedRange.value })
}

const displayMonths = computed(() => data.value?.months ?? [])

onMounted(() => {
  load()
  fetchTeams(workspaceId)
  // remembered for the overview ("Récemment consultée")
  try { localStorage.setItem('wb_vel_last', teamId) }
  catch { /* private mode */ }
})
watch([selectedYear, selectedRange], load)

// Devs ayant au moins 1 ticket sur la période sélectionnée
const activeDevs = computed(() => {
  if (!data.value) return []
  return data.value.devs.filter(dev =>
    displayMonths.value.some(m => (data.value!.metrics[dev.id]?.[m]?.ticketsCount ?? 0) > 0),
  )
})

function goToDev(devId: string) {
  router.push(`/velocite/teams/${teamId}/devs/${devId}?workspaceId=${workspaceId}&year=${selectedYear.value}&range=${selectedRange.value}`)
}

function handleCellClick(devId: string, month: string) {
  router.push(`/velocite/teams/${teamId}/devs/${devId}?workspaceId=${workspaceId}&year=${selectedYear.value}&range=${selectedRange.value}&month=${month}`)
}

// Same wording rule as selectionLabel() (utils/velocite-periods), localised
const periodLabel = computed(() => {
  if (selectedYear.value === currentYear) return t('velocityB.period.lastN', { n: selectedRange.value })
  if (selectedRange.value === 12) return t('velocityB.period.wholeYear', { y: selectedYear.value })
  return t('velocityB.period.lastNOf', { n: selectedRange.value, y: selectedYear.value })
})

// Throughput équipe : total tickets livrés par mois (somme de tous les devs)
const teamThroughput = computed<{ month: string; total: number }[]>(() => {
  if (!data.value) return []
  return displayMonths.value.map(m => ({
    month: m,
    total: data.value!.devs.reduce(
      (sum, dev) => sum + (data.value!.metrics[dev.id]?.[m]?.ticketsCount ?? 0),
      0,
    ),
  }))
})

// Aggregates over the entire displayed period
function aggregateTeamMetrics(months: string[]) {
  if (!data.value || !months.length) {
    return { ticketsTotal: 0, pointsTotal: 0, bugsTotal: 0, cycleMedian: 0, reworkRate: 0 }
  }
  let ticketsTotal = 0, pointsTotal = 0, bugsTotal = 0
  let cycleSum = 0, cycleCount = 0
  let reworkWeighted = 0
  for (const dev of data.value.devs) {
    for (const m of months) {
      const mm = data.value.metrics[dev.id]?.[m]
      if (!mm) continue
      ticketsTotal += mm.ticketsCount
      pointsTotal += mm.pointsSum
      bugsTotal += mm.bugsCount
      if (mm.medianDevCycleHours > 0 && mm.ticketsCount > 0) {
        cycleSum += mm.medianDevCycleHours * mm.ticketsCount
        cycleCount += mm.ticketsCount
      }
      if (mm.ticketsCount > 0) reworkWeighted += mm.reworkRate * mm.ticketsCount
    }
  }
  return {
    ticketsTotal, pointsTotal, bugsTotal,
    cycleMedian: cycleCount > 0 ? cycleSum / cycleCount : 0,
    reworkRate: ticketsTotal > 0 ? reworkWeighted / ticketsTotal : 0,
  }
}

const teamCurrent = computed(() => aggregateTeamMetrics(displayMonths.value))

usePageHeader(() => ({
  crumbs: [
    // ?all=1: the overview, even when there is a single team
    { label: t('nav.velocity'), to: '/velocite?all=1' },
    { label: teamName.value ?? t('velocityB.team') },
  ],
}))

// Period selector: year (Select, values as strings) + range (Segmented)
const yearOptions = computed(() => availableYears.map(y => ({ value: String(y), label: y === currentYear ? t('velocityB.period.current', { y }) : String(y) })))
const yearModel = computed({ get: () => String(selectedYear.value), set: (v: string) => { selectedYear.value = Number(v) } })
const rangeOptions = computed(() => VELOCITE_RANGES.map(r => ({ value: String(r.value), label: t('velocityB.period.months', { n: r.value }) })))
const rangeModel = computed({ get: () => String(selectedRange.value), set: (v: string) => { selectedRange.value = Number(v) } })

const kpis = computed(() => [
  { label: t('velocityB.kpi.delivered'), value: teamCurrent.value.ticketsTotal, hint: periodLabel.value, info: t('velocityB.kpi.ticketsInfo') },
  { label: t('velocityB.kpi.points'), value: teamCurrent.value.pointsTotal.toFixed(0), hint: t('velocityB.kpi.pointsHint'), info: t('velocityB.kpi.pointsInfo') },
  { label: t('velocityB.kpi.cycleMedian'), value: velociteDuration(teamCurrent.value.cycleMedian, tag.value), hint: t('velocityB.kpi.cycleHint'), info: t('velocityB.kpi.cycleInfo') },
  { label: t('velocityB.kpi.rework'), value: teamCurrent.value.reworkRate.toFixed(1), unit: '%', hint: t('velocityB.kpi.reworkHint'), info: t('velocityB.kpi.reworkInfo') },
])
const throughputLabels = computed(() => teamThroughput.value.map(m => velociteMonth(m.month, tag.value)))
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-row-b wb-wrap">
      <div>
        <h2 class="h1">{{ teamName ?? t('velocityB.team') }}</h2>
        <p class="small wb-mut">{{ periodLabel }} · {{ t('velocityB.teamHint') }}</p>
      </div>
      <div class="wb-row wb-wrap wb-period-row">
        <WbSelect v-if="teamOptions.length > 1" v-model="teamModel" :options="teamOptions" :aria-label="t('tnd24.switch')" data-action="switch-team" />
        <WbSelect v-model="yearModel" :options="yearOptions" :aria-label="t('velocityB.period.year')" />
        <div class="wb-period"><WbSegmented v-model="rangeModel" :options="rangeOptions" :label="t('velocityB.period.label')" /></div>
      </div>
    </div>

    <!-- loading until the first answer: never a false "no data yet" (TND-24) -->
    <WbSkeleton v-if="isLoading || (!data && !error)" variant="metric" :count="4" />
    <WbErrorState v-else-if="error" :message="readableApiError(error)" @retry="load" />
    <div v-else-if="!data || data.devs.length === 0" class="wb-card">
      <WbEmptyState art="link" :title="t('velocityB.empty.title')">{{ t('velocityB.empty.text') }}</WbEmptyState>
    </div>

    <template v-else>
      <div class="wb-grid wb-cols-4">
        <WbMetricCard v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :unit="k.unit" :hint="k.hint" :info="k.info" />
      </div>

      <!-- What needs attention first, right under the numbers -->
      <TeamInsights :problematic="problematic" :blocked="blocked" :workspace-id="workspaceId" />

      <!-- Delivery: team throughput next to deliveries per person and month -->
      <div class="wb-vel-pair">
        <WbCard class="wb-vel-tp" :title="t('velocityB.throughput.title')">
        <p v-if="teamThroughput.every(m => m.total === 0)" class="wb-mut">{{ t('velocityB.empty.period') }}</p>
        <WbChartFrame v-else :title="t('velocityB.throughput.chart')" :legend="[{ label: t('velocityB.charts.delivered'), color: '--chart-1' }]">
          <WbLineChart
            :title="t('velocityB.throughput.chart')"
            :labels="throughputLabels"
            :series="[{ label: t('velocityB.charts.delivered'), data: teamThroughput.map(m => m.total) }]"
            area
            :legend="false"
          />
        </WbChartFrame>
      </WbCard>
      <WbCard :title="t('velocityB.heatmap.title')" :subtitle="activeDevs.length < data.devs.length ? t('velocityB.heatmap.hidden', { n: data.devs.length - activeDevs.length }) : t('velocityB.heatmap.hint')">
        <p v-if="activeDevs.length === 0" class="wb-mut">{{ t('velocityB.empty.period') }}</p>
        <VelociteHeatmap
          v-else
          :months="displayMonths"
          :devs="activeDevs"
          :metrics="data.metrics"
          :team-id="teamId"
          :workspace-id="workspaceId"
          @dev-click="goToDev"
          @cell-click="handleCellClick"
        />
      </WbCard>
      </div>

      <!-- People: distribution next to the capacity of the period -->
      <div class="wb-vel-pair">
      <WbCard :title="t('velocityB.dist.title')" :subtitle="t('velocityB.dist.hint')">
        <p v-if="activeDevs.length === 0" class="wb-mut">{{ t('velocityB.empty.noDev') }}</p>
        <TeamDistribution
          v-else
          :devs="activeDevs"
          :months="displayMonths"
          :metrics="data.metrics"
          :team-id="teamId"
          :workspace-id="workspaceId"
          :year="selectedYear"
          :range="selectedRange"
        />
      </WbCard>
        <CapacityCard v-if="workspaceId" :workspace-id="workspaceId" :team-id="teamId" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.wb-page :deep(.wb-metric) { padding: var(--space-3) var(--space-4); }
/* Two charts per row on wide screens */
.wb-vel-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: stretch; }
.wb-vel-pair > * { min-width: 0; }
/* Throughput: the chart sits at the bottom of its card, level with the grid next to it */
.wb-vel-tp { display: flex; flex-direction: column; }
.wb-vel-tp :deep(> div:last-child) { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; }
/* the heatmap and the distribution need room: one per row below 1440 px */
@container wbapp (max-width: 1439px) { .wb-vel-pair { grid-template-columns: minmax(0, 1fr); } }
/* The period switch never widens the page (TND-09): it scrolls inside on small screens */
.wb-period-row { min-width: 0; max-width: 100%; }
.wb-period { min-width: 0; max-width: 100%; overflow-x: auto; }
</style>
