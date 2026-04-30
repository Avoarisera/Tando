<script setup lang="ts">
import type { TicketRow } from '~/components/velocite/TicketsTable.vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

definePageMeta({ layout: 'private', middleware: 'admin-only' })

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

function monthLabel(m: string): string {
  const [year, month] = m.split('-')
  const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  return `${labels[parseInt(month!) - 1]} ${year?.slice(2)}`
}

const cycleQaChartData = computed(() => ({
  labels: months.value.map(monthLabel),
  datasets: [
    {
      label: 'Cycle dev (h)',
      data: [...cycleP50Values.value],
      backgroundColor: '#2563EB',
      borderRadius: 4,
      stack: 'time',
    },
    {
      label: 'Temps review (h)',
      data: [...reviewTimeValues.value],
      backgroundColor: '#D97706',
      borderRadius: 4,
      stack: 'time',
    },
    {
      label: 'Temps QA (h)',
      data: [...qaTimeValues.value],
      backgroundColor: '#16A34A',
      borderRadius: 4,
      stack: 'time',
    },
  ],
}))

const cycleQaChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top' as const, labels: { boxWidth: 12, font: { size: 11 } } },
    tooltip: { mode: 'index' as const, intersect: false },
  },
  scales: {
    x: { stacked: true },
    y: { beginAtZero: true, stacked: true },
  },
}

// Rework rate: reworked tickets / total tickets for the selected month.
// Derived from the tickets data — consistent with the ↩ badge shown in the table.
const periodReworkRate = computed(() => {
  if (!tickets.value.length) return 0
  const reworked = tickets.value.filter(t => t.hasRework).length
  return (reworked / tickets.value.length) * 100
})

const reworkRateClass = computed(() => {
  const r = periodReworkRate.value
  if (r === 0) return 'text-gray-400'
  if (r < 10) return 'text-green-600'
  if (r <= 25) return 'text-amber-600'
  return 'text-red-600'
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
  return `${sign}${v}% vs mois précédent`
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
  return `Moyenne sur la période : ${avg} tickets/mois`
}

function pointInsight(): string {
  const avg = pointValues.value.length
    ? (pointValues.value.reduce((s, v) => s + v, 0) / pointValues.value.length).toFixed(1)
    : '0'
  return `Moyenne sur la période : ${avg} pts/mois`
}

function compositionInsight(): string {
  const totalBugs = bugValues.value.reduce((s, v) => s + v, 0)
  const totalTickets = ticketValues.value.reduce((s, v) => s + v, 0)
  if (totalTickets === 0) return 'Pas de données'
  const ratio = Math.round((totalBugs / totalTickets) * 100)
  return `${ratio}% de tickets sans estimation (proxy bugs) sur la période`
}

function formatMonth(m: string): string {
  if (!m) return ''
  const [year, month] = m.split('-')
  const labels = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
  return `${labels[parseInt(month!) - 1]} ${year}`
}


function handleTicketClick(ticketId: string) {
  router.push(`/velocite/issues/${ticketId}?workspaceId=${workspaceId}&returnUrl=${encodeURIComponent(route.fullPath)}`)
}
</script>

<template>
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <button class="text-sm text-brand-primary hover:underline" @click="goBack">← Équipe</button>
      <div class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 class="text-2xl font-bold text-gray-900">
          {{ devInfo?.display_name ?? devId }}
        </h1>
        <!-- Period selector : year + range -->
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <div class="relative">
            <select
              v-model.number="selectedYear"
              class="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-4 pr-9 text-sm font-medium text-gray-700 shadow-sm hover:border-gray-300 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            >
              <option v-for="y in availableYears" :key="y" :value="y">
                {{ y === currentYear ? `${y} (en cours)` : y }}
              </option>
            </select>
            <span class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-gray-400">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 7.5L10 12l4.5-4.5h-9z" /></svg>
            </span>
          </div>
          <div class="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <button
              v-for="r in VELOCITE_RANGES"
              :key="r.value"
              class="rounded-md px-3 py-1 text-sm font-medium transition-colors"
              :class="selectedRange === r.value
                ? 'bg-brand-primary text-white'
                : 'text-gray-600 hover:bg-gray-100'"
              @click="selectedRange = r.value"
            >
              {{ r.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <template v-if="isLoading">
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <AppSkeleton v-for="i in 5" :key="i" class="h-24" />
      </div>
      <AppSkeleton class="h-56 mb-4" />
    </template>

    <AppErrorBanner v-else-if="error" :message="error" @retry="handleRetry" />

    <template v-else>
      <!-- KPI Cards -->
      <div class="grid grid-cols-3 md:grid-cols-6 gap-3 mb-8">
        <!-- Tickets -->
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center gap-1 mb-3">
            <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Tickets</span>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-400 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                Tickets livrés (passés en In Review, Done ou Deployed) sur la période sélectionnée.
              </div>
            </div>
          </div>
          <p class="text-2xl font-semibold text-gray-900">{{ aggregatedMetrics.ticketsCount }}</p>
          <p v-if="isSingleMonth && momVariation(devId, 'ticketsCount', selectedMonth) !== null" class="text-xs mt-1.5 text-gray-400">
            <span :class="(momVariation(devId, 'ticketsCount', selectedMonth) ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-500'">{{ variationLabel('ticketsCount') }}</span>
            vs mois préc.
          </p>
          <p v-else class="text-xs mt-1.5 text-gray-300">—</p>
        </div>
        <!-- Points -->
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center gap-1 mb-3">
            <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Points</span>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-400 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                Somme des story points des tickets livrés. Reflète la complexité plus que le volume.
              </div>
            </div>
          </div>
          <p class="text-2xl font-semibold text-gray-900">{{ aggregatedMetrics.pointsSum.toFixed(0) }}</p>
          <p v-if="isSingleMonth && momVariation(devId, 'pointsSum', selectedMonth) !== null" class="text-xs mt-1.5 text-gray-400">
            <span :class="(momVariation(devId, 'pointsSum', selectedMonth) ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-500'">{{ variationLabel('pointsSum') }}</span>
            vs mois préc.
          </p>
          <p v-else class="text-xs mt-1.5 text-gray-300">—</p>
        </div>
        <!-- Bugs -->
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center gap-1 mb-3">
            <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Bugs</span>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-400 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                Tickets sans estimation (proxy bugs). À croiser avec la Composition.
              </div>
            </div>
          </div>
          <p class="text-2xl font-semibold text-gray-900">{{ aggregatedMetrics.bugsCount }}</p>
          <p class="text-xs mt-1.5 text-gray-300">sans estimation</p>
        </div>
        <!-- Cycle P50 -->
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center gap-1 mb-3">
            <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Cycle P50</span>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-400 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                Temps médian In Progress → In Review. 50% des tickets livrés plus vite que cette valeur.
              </div>
            </div>
          </div>
          <p class="text-2xl font-semibold text-gray-900">
            {{ aggregatedMetrics.medianDevCycleHours > 0 ? `${aggregatedMetrics.medianDevCycleHours.toFixed(0)}h` : '—' }}
          </p>
          <p v-if="aggregatedMetrics.p90DevCycleHours > 0" class="text-xs mt-1.5 text-gray-400">P90 · {{ aggregatedMetrics.p90DevCycleHours.toFixed(0) }}h</p>
          <p v-else class="text-xs mt-1.5 text-gray-300">—</p>
        </div>
        <!-- Rework -->
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center gap-1 mb-3">
            <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Rework</span>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-400 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                % de tickets ayant eu un retour arrière (Review/Q/A → état antérieur) sur la période.
              </div>
            </div>
          </div>
          <p class="text-2xl font-semibold text-gray-900">{{ periodReworkRate.toFixed(1) }}<span class="text-base font-normal text-gray-400">%</span></p>
          <p class="text-xs mt-1.5 text-gray-400">{{ tickets.filter(t => t.hasRework).length }} / {{ tickets.length }} tickets</p>
        </div>
        <!-- WIP -->
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center gap-1 mb-3">
            <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">WIP moy</span>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-400 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                Nombre moyen de tickets ouverts simultanément par mois. Au-delà de 3, le switch de contexte devient coûteux.
              </div>
            </div>
          </div>
          <p class="text-2xl font-semibold text-gray-900">{{ aggregatedMetrics.wipCount.toFixed(1) }}</p>
          <p class="text-xs mt-1.5" :class="aggregatedMetrics.wipCount <= 2 ? 'text-emerald-600' : aggregatedMetrics.wipCount <= 3 ? 'text-amber-500' : 'text-rose-500'">
            {{ aggregatedMetrics.wipCount <= 2 ? 'bon niveau' : aggregatedMetrics.wipCount <= 3 ? 'limite' : 'trop élevé' }}
          </p>
        </div>
      </div>

      <!-- Sections verticales -->
      <div class="space-y-4 mb-8">
        <!-- Tickets livrés -->
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 class="text-sm font-semibold text-gray-700">Tickets livrés</h2>
            <!-- Rework filter -->
            <button
              class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
              :class="showReworkOnly
                ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="showReworkOnly = !showReworkOnly"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="showReworkOnly ? 'bg-orange-500' : 'bg-gray-300'" />
              Rework uniquement
            </button>
          </div>
          <!-- Multi-select month filter -->
          <div class="flex flex-wrap gap-1 mb-4">
            <button
              v-for="m in months"
              :key="m"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              :class="selectedMonths.includes(m)
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="toggleMonth(m)"
            >
              {{ monthLabel(m) }}
            </button>
          </div>
          <TicketsTable
            :tickets="displayedTickets"
            :is-loading="ticketsLoading"
            @ticket-click="handleTicketClick"
          />
        </div>

        <!-- Cycle dev vs Temps QA -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Cycle dev vs Temps QA</h3>
          <p class="text-xs text-gray-400 mb-3">
            Bleu = Cycle dev (In Progress → In Review). Vert = Temps QA (In Review → Done). La hauteur totale = temps de livraison complet. Un bar entièrement vert signale un goulot en review/QA.
          </p>
          <template v-if="hasCycleQaData">
            <div class="h-48">
              <Bar :data="cycleQaChartData" :options="cycleQaChartOptions" />
            </div>
            <p class="mt-3 text-xs text-gray-500">
              Cycle dev P50 : {{ aggregatedMetrics.medianDevCycleHours > 0 ? `${aggregatedMetrics.medianDevCycleHours.toFixed(0)}h` : '—' }}
              <template v-if="aggregatedMetrics.p90DevCycleHours > 0">
                · P90 : {{ aggregatedMetrics.p90DevCycleHours.toFixed(0) }}h
              </template>
            </p>
          </template>
          <AppEmptyState
            v-else
            title="Pas de données de cycle"
            description="Les métriques apparaîtront une fois les tickets synchronisés avec started_at et completed_at."
          />
        </div>

        <!-- Tickets / mois -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Tickets / mois</h3>
          <p class="text-xs text-gray-400 mb-3">Nombre de tickets livrés par mois. Mesure le volume de livraison, pas la qualité.</p>
          <ChartTickets :months="months" :values="ticketValues" />
          <InsightBadge :text="ticketInsight()" :trend="variationTrend('ticketsCount')" />
        </div>

        <!-- Points / mois -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Points / mois</h3>
          <p class="text-xs text-gray-400 mb-3">Points d'estimation livrés par mois. Reflète la complexité plutôt que le volume — un gros ticket vaut plus qu'un fix rapide.</p>
          <ChartPoints :months="months" :values="pointValues" />
          <InsightBadge :text="pointInsight()" :trend="variationTrend('pointsSum')" />
        </div>

        <!-- Composition -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Composition</h3>
          <p class="text-xs text-gray-400 mb-3">Tickets avec estimation (bleu = features) vs tickets sans estimation (rouge = bugs proxy). Un ratio bugs élevé peut indiquer de la dette technique non planifiée.</p>
          <ChartComposition :months="months" :features="featureValues" :bugs="bugValues" />
          <InsightBadge :text="compositionInsight()" trend="neutral" />
        </div>
      </div>
    </template>
  </div>
</template>
