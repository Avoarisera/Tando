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

definePageMeta({ layout: 'private' })

const route = useRoute()
const router = useRouter()
const teamId = route.params.teamId as string
const devId = route.params.devId as string
const workspaceId = route.query.workspaceId as string
const monthParam = route.query.month as string | undefined
const periodParam = route.query.period ? Number(route.query.period) : null

const PERIODS = [
  { label: '3 mois', value: 3 },
  { label: '6 mois', value: 6 },
  { label: '12 mois', value: 12 },
]

function periodForMonth(month: string): number {
  const now = new Date()
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [y1, m1] = current.split('-').map(Number)
  const [y2, m2] = month.split('-').map(Number)
  const diff = (y1! - y2!) * 12 + (m1! - m2!)
  if (diff <= 3) return 3
  if (diff <= 6) return 6
  return 12
}

const selectedPeriod = ref(
  periodParam && [3, 6, 12].includes(periodParam)
    ? periodParam
    : monthParam ? periodForMonth(monthParam) : 6,
)

function computeMonths(n: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

const { data, isLoading, error, fetchMetrics, momVariation } = useMetrics()

const tickets = ref<TicketRow[]>([])
const ticketsLoading = ref(false)
const selectedMonths = ref<string[]>([])

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
  await fetchMetrics({ workspaceId, teamId, months: computeMonths(selectedPeriod.value) })
  selectedMonths.value = monthParam ? [monthParam] : [...months.value]
  await fetchCurrentMonthTickets()
})

watch(selectedPeriod, async () => {
  await fetchMetrics({ workspaceId, teamId, months: computeMonths(selectedPeriod.value) })
  selectedMonths.value = [...months.value]
  await fetchCurrentMonthTickets()
})

watch(selectedMonths, fetchCurrentMonthTickets)

const months = computed(() => data.value?.months ?? [])
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
  for (const m of sel) {
    const mm = devMetrics.value[m]
    if (!mm) continue
    ticketsCount += mm.ticketsCount
    pointsSum += mm.pointsSum
    bugsCount += mm.bugsCount
    if (mm.medianDevCycleHours > 0) cycleHours.push(mm.medianDevCycleHours)
    if (mm.p90DevCycleHours > 0) p90Hours.push(mm.p90DevCycleHours)
    if (mm.medianQaTimeHours > 0) qaHours.push(mm.medianQaTimeHours)
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
    reworkRate: 0,
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

const hasCycleQaData = computed(() =>
  cycleP50Values.value.some(v => v > 0) || qaTimeValues.value.some(v => v > 0)
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
    router.push(`/velocite/teams/${teamId}?workspaceId=${workspaceId}&period=${selectedPeriod.value}`)
  }
}

async function handleRetry() {
  await fetchMetrics({ workspaceId, teamId, months: computeMonths(selectedPeriod.value) })
  await fetchCurrentMonthTickets()
}

function variationLabel(metric: 'ticketsCount' | 'pointsSum' | 'bugsCount' | 'medianDevCycleHours'): string {
  const v = momVariation(devId, metric)
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

function ticketsSectionTitle(): string {
  if (!selectedMonths.value.length || selectedMonths.value.length === months.value.length) {
    return 'Tickets livrés — Toute la période'
  }
  const labels = selectedMonths.value.map(m => monthLabel(m))
  return `Tickets livrés — ${labels.join(', ')}`
}

function handleTicketClick(ticketId: string) {
  router.push(`/velocite/issues/${ticketId}?workspaceId=${workspaceId}&returnUrl=${encodeURIComponent(route.fullPath)}`)
}
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <button class="text-sm text-brand-primary hover:underline" @click="goBack">← Équipe</button>
      <div class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 class="text-2xl font-bold text-gray-900">
          {{ devInfo?.display_name ?? devId }}
        </h1>
        <!-- Period selector -->
        <div class="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shrink-0">
          <button
            v-for="period in PERIODS"
            :key="period.value"
            class="rounded-md px-3 py-1 text-sm font-medium transition-colors"
            :class="selectedPeriod === period.value
              ? 'bg-brand-primary text-white'
              : 'text-gray-600 hover:bg-gray-100'"
            @click="selectedPeriod = period.value"
          >
            {{ period.label }}
          </button>
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
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <!-- Tickets -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <div class="relative flex items-center gap-1 mb-1">
            <p class="text-xs text-gray-500">Tickets</p>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-500 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-md bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                Nombre de tickets livrés ce mois (passés en Q/A Check, Done ou Deployed). Indicateur de volume de livraison.
              </div>
            </div>
          </div>
          <p class="text-3xl font-bold text-gray-900">{{ aggregatedMetrics.ticketsCount }}</p>
          <p v-if="isSingleMonth && momVariation(devId, 'ticketsCount') !== null" class="text-xs mt-1"
            :class="(momVariation(devId, 'ticketsCount') ?? 0) > 0 ? 'text-green-600' : 'text-red-600'">
            {{ variationLabel('ticketsCount') }}
          </p>
        </div>
        <!-- Points -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <div class="relative flex items-center gap-1 mb-1">
            <p class="text-xs text-gray-500">Points</p>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-500 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-md bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                Points = estimations Linear (story points). Chaque ticket a 0, 1, 2, 3, 5, 8... points selon la complexité estimée. Total = somme des points des tickets livrés ce mois. Un ticket sans estimation compte 0.
              </div>
            </div>
          </div>
          <p class="text-3xl font-bold text-gray-900">{{ aggregatedMetrics.pointsSum.toFixed(0) }}</p>
          <p v-if="isSingleMonth && momVariation(devId, 'pointsSum') !== null" class="text-xs mt-1"
            :class="(momVariation(devId, 'pointsSum') ?? 0) > 0 ? 'text-green-600' : 'text-red-600'">
            {{ variationLabel('pointsSum') }}
          </p>
        </div>
        <!-- Bugs -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <div class="relative flex items-center gap-1 mb-1">
            <p class="text-xs text-gray-500">Bugs</p>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-500 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-md bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                Tickets livrés sans estimation (proxy bugs). Un ticket sans point est souvent un bug ou une tâche non planifiée. À croiser avec la Composition.
              </div>
            </div>
          </div>
          <p class="text-3xl font-bold text-gray-900">{{ aggregatedMetrics.bugsCount }}</p>
        </div>
        <!-- Cycle P50 -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <div class="relative flex items-center gap-1 mb-1">
            <p class="text-xs text-gray-500">Cycle P50</p>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-500 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-md bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                Temps médian entre le début du développement (started_at) et l'entrée en Q/A. 50% des tickets ont été livrés plus vite que cette valeur. Médiane = robuste aux outliers.
              </div>
            </div>
          </div>
          <p class="text-3xl font-bold text-gray-900">
            {{ aggregatedMetrics.medianDevCycleHours > 0 ? `${aggregatedMetrics.medianDevCycleHours.toFixed(0)}h` : '—' }}
          </p>
        </div>
        <!-- Rework -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <div class="relative flex items-center gap-1 mb-1">
            <p class="text-xs text-gray-500">Rework</p>
            <div class="group relative">
              <span class="cursor-help text-gray-300 hover:text-gray-500 text-xs">ⓘ</span>
              <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 rounded-md bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 text-left leading-relaxed">
                Tickets avec au moins un retour arrière (Review/Q/A → état antérieur) ÷ total tickets actifs sur la période. Numérateur et dénominateur viennent tous deux de l'historique Linear — même source que "Retours en arrière".
              </div>
            </div>
          </div>
          <p
            class="text-3xl font-bold"
            :class="reworkRateClass"
          >
            {{ periodReworkRate.toFixed(1) }}%
          </p>
          <p class="text-xs text-gray-400 mt-1">
            {{ tickets.filter(t => t.hasRework).length }} / {{ tickets.length }} tickets
          </p>
        </div>
      </div>

      <!-- Sections verticales -->
      <div class="space-y-4 mb-8">
        <!-- Tickets livrés -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
          <div class="mb-3">
            <h2 class="text-sm font-semibold text-gray-700">{{ ticketsSectionTitle() }}</h2>
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
            :tickets="tickets"
            :is-loading="ticketsLoading"
            @ticket-click="handleTicketClick"
          />
        </div>

        <!-- Cycle dev vs Temps QA -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Cycle dev vs Temps QA</h3>
          <p class="text-xs text-gray-400 mb-3">
            Bleu = Cycle dev (In Progress → Q/A). Vert = Temps QA (Q/A → Done). La hauteur totale = temps de livraison complet. Un bar entièrement vert signale un goulot en QA.
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
