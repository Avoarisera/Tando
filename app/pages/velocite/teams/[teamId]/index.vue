<script setup lang="ts">
definePageMeta({ layout: 'private', middleware: 'admin-only' })

const route = useRoute()
const router = useRouter()
const teamId = route.params.teamId as string
const workspaceId = route.query.workspaceId as string

const { data, isLoading, error, fetchMetrics } = useMetrics()
const { teams, fetchTeams } = useLinearTeams()
const teamName = computed(() => teams.value.find(t => t.id === teamId)?.name ?? null)
const { problematic, blocked, fetchInsights } = useTeamInsights()


import { VELOCITE_RANGES, getAvailableYears, isValidRange, isValidYear, computeSelectionMonths, selectionLabel } from '~/utils/velocite-periods'

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

function formatMonth(m: string): string {
  if (!m) return ''
  const [year, month] = m.split('-')
  const labels = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
  return `${labels[parseInt(month!) - 1]} ${year}`
}

const periodLabel = computed(() => selectionLabel(selectedYear.value, selectedRange.value))

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
</script>

<template>
  <div class="max-w-7xl mx-auto">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <NuxtLink
          :to="workspaceId ? `/velocite/workspaces/${workspaceId}` : '/velocite'"
          class="text-sm text-brand-primary hover:underline"
        >
          ← Workspaces
        </NuxtLink>
        <h1 class="mt-2 text-2xl font-bold text-gray-900">{{ teamName ?? 'Équipe' }}</h1>
        <p class="text-sm text-gray-500 mt-1">{{ periodLabel }} · cliquer un dev pour le détail</p>
      </div>

      <!-- Filtre période : année + range -->
      <div class="flex flex-wrap items-center gap-2">
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
              : 'text-gray-500 hover:bg-gray-100'"
            @click="selectedRange = r.value"
          >
            {{ r.label }}
          </button>
        </div>
      </div>
    </div>

    <template v-if="isLoading">
      <AppSkeleton class="mb-4 h-10 w-48" />
      <AppSkeleton class="mb-3 h-48" />
    </template>

    <AppErrorBanner v-else-if="error" :message="error" @retry="load" />

    <AppEmptyState
      v-else-if="!data || data.devs.length === 0"
      title="Aucune donnée disponible"
      description="Synchronisez votre workspace Linear pour importer les tickets."
    />

    <template v-else>
      <!-- Synthèse équipe : KPIs agrégés sur la période sélectionnée -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-gray-50 rounded-xl p-4">
          <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Tickets livrés</span>
          <p class="text-2xl font-semibold text-gray-900 mt-3">{{ teamCurrent.ticketsTotal }}</p>
          <p class="text-xs mt-1.5 text-gray-300">{{ periodLabel }}</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4">
          <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Points</span>
          <p class="text-2xl font-semibold text-gray-900 mt-3">{{ teamCurrent.pointsTotal.toFixed(0) }}</p>
          <p class="text-xs mt-1.5 text-gray-300">total estimations</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4">
          <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Cycle médian</span>
          <p class="text-2xl font-semibold text-gray-900 mt-3">{{ teamCurrent.cycleMedian > 0 ? `${teamCurrent.cycleMedian.toFixed(0)}h` : '—' }}</p>
          <p class="text-xs mt-1.5 text-gray-300">In Progress → In Review</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4">
          <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Rework</span>
          <p class="text-2xl font-semibold text-gray-900 mt-3">{{ teamCurrent.reworkRate.toFixed(1) }}<span class="text-base font-normal text-gray-400">%</span></p>
          <p class="text-xs mt-1.5 text-gray-300">tickets reworkés</p>
        </div>
      </div>

      <!-- Insights : tickets bloqués + tickets à analyser -->
      <TeamInsights
        :problematic="problematic"
        :blocked="blocked"
        :workspace-id="workspaceId"
      />

      <!-- Heatmap -->
      <div class="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-gray-700">Tickets livrés — heatmap</h2>
          <span v-if="activeDevs.length < data.devs.length" class="text-xs text-gray-400">
            {{ data.devs.length - activeDevs.length }} dev(s) sans activité masqués
          </span>
        </div>

        <AppEmptyState
          v-if="activeDevs.length === 0"
          title="Aucun ticket livré sur cette période"
          description="Essayez d'élargir la fenêtre temporelle."
        />

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
      </div>

      <!-- Throughput équipe -->
      <div class="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div class="mb-4">
          <h2 class="text-sm font-semibold text-gray-700">Throughput équipe</h2>
          <p class="text-xs text-gray-400 mt-0.5">Tickets livrés collectivement</p>
        </div>

        <AppEmptyState
          v-if="teamThroughput.every(m => m.total === 0)"
          title="Aucun ticket livré sur cette période"
          description="Essayez d'élargir la fenêtre temporelle."
        />

        <ChartTickets
          v-else
          :months="teamThroughput.map(m => m.month)"
          :values="teamThroughput.map(m => m.total)"
        />
      </div>

      <!-- Distribution équipe -->
      <div class="bg-white rounded-lg border border-gray-200 p-5">
        <div class="mb-4">
          <h2 class="text-sm font-semibold text-gray-700">Distribution de l'équipe</h2>
          <p class="text-xs text-gray-400 mt-0.5">
            Chaque dev positionné par rapport à la médiane de l'équipe sur la période — pas une compétition, une lecture rapide du contexte.
          </p>
        </div>

        <AppEmptyState
          v-if="activeDevs.length === 0"
          title="Aucun dev actif sur cette période"
        />

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
      </div>
    </template>
  </div>
</template>
