<script setup lang="ts">
definePageMeta({ layout: 'private' })

const route = useRoute()
const router = useRouter()
const teamId = route.params.teamId as string
const workspaceId = route.query.workspaceId as string

const { data, isLoading, error, fetchMetrics } = useMetrics()
const { teams, fetchTeams } = useLinearTeams()
const teamName = computed(() => teams.value.find(t => t.id === teamId)?.name ?? null)


const PERIODS = [
  { label: '3 mois', value: 3 },
  { label: '6 mois', value: 6 },
  { label: '12 mois', value: 12 },
]

const periodQuery = Number(route.query.period)
const selectedPeriod = ref([3, 6, 12].includes(periodQuery) ? periodQuery : 6)

// Keep period in URL so router.back() restores it correctly
watch(selectedPeriod, (val) => {
  router.replace({ query: { ...route.query, period: String(val) } })
}, { immediate: false })

function computeMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function load() {
  const months = computeMonths(selectedPeriod.value)
  fetchMetrics({ workspaceId, teamId, months })
}

onMounted(() => {
  load()
  fetchTeams(workspaceId)
})
watch(selectedPeriod, load)

// Devs ayant au moins 1 ticket sur la période sélectionnée
const activeDevs = computed(() => {
  if (!data.value) return []
  return data.value.devs.filter(dev =>
    data.value!.months.some(m => (data.value!.metrics[dev.id]?.[m]?.ticketsCount ?? 0) > 0),
  )
})

function goToDev(devId: string) {
  router.push(`/velocite/teams/${teamId}/devs/${devId}?workspaceId=${workspaceId}&period=${selectedPeriod.value}`)
}

function handleCellClick(devId: string, month: string) {
  router.push(`/velocite/teams/${teamId}/devs/${devId}?workspaceId=${workspaceId}&period=${selectedPeriod.value}&month=${month}`)
}

function formatMonth(m: string): string {
  if (!m) return ''
  const [year, month] = m.split('-')
  const labels = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
  return `${labels[parseInt(month!) - 1]} ${year}`
}

const periodLabel = computed(() => `${selectedPeriod.value} derniers mois`)

// Throughput équipe : total tickets livrés par mois (somme de tous les devs)
const teamThroughput = computed<{ month: string; total: number }[]>(() => {
  if (!data.value) return []
  return data.value.months.map(m => ({
    month: m,
    total: data.value!.devs.reduce(
      (sum, dev) => sum + (data.value!.metrics[dev.id]?.[m]?.ticketsCount ?? 0),
      0,
    ),
  }))
})
</script>

<template>
  <div class="max-w-5xl mx-auto">
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

      <!-- Filtre période -->
      <div class="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
        <button
          v-for="p in PERIODS"
          :key="p.value"
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          :class="selectedPeriod === p.value
            ? 'bg-brand-primary text-white'
            : 'text-gray-500 hover:bg-gray-100'"
          @click="selectedPeriod = p.value"
        >
          {{ p.label }}
        </button>
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
          :months="data.months"
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
          :months="data.months"
          :metrics="data.metrics"
          :team-id="teamId"
          :workspace-id="workspaceId"
          :period="selectedPeriod"
        />
      </div>
    </template>
  </div>
</template>
