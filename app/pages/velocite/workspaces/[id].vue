<script setup lang="ts">
definePageMeta({ layout: 'private', middleware: 'admin-only' })

const route = useRoute()
const workspaceId = route.params.id as string

const { workspaces, fetchWorkspaces } = useLinearWorkspace()
const { teams, isLoading, error, fetchTeams } = useLinearTeams()

onMounted(async () => {
  await Promise.all([fetchWorkspaces(), fetchTeams(workspaceId)])
})

const workspace = computed(() => workspaces.value.find(w => w.id === workspaceId))

function teamInitial(name: string | null): string {
  return (name ?? '?')[0]!.toUpperCase()
}

const PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]

function teamColor(index: number): string {
  return PALETTE[index % PALETTE.length]!
}
</script>

<template>
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <NuxtLink to="/velocite" class="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-brand-primary transition-colors">
        ← Workspaces
      </NuxtLink>
      <h1 class="mt-3 text-2xl font-bold text-gray-900">
        {{ workspace?.name ?? 'Workspace' }}
      </h1>
      <p class="text-sm text-gray-400 mt-1">Choisissez une équipe pour explorer ses métriques.</p>
    </div>

    <!-- Loading -->
    <template v-if="isLoading">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AppSkeleton v-for="i in 4" :key="i" class="h-[72px] rounded-xl" />
      </div>
    </template>

    <AppErrorBanner v-else-if="error" :message="error" @retry="fetchTeams(workspaceId)" />

    <AppEmptyState
      v-else-if="teams.length === 0"
      title="Aucune équipe synchronisée"
      description="Lancez une synchronisation depuis la page Workspaces pour importer les équipes Linear."
    />

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <NuxtLink
        v-for="(team, i) in teams"
        :key="team.id"
        :to="`/velocite/teams/${team.id}?workspaceId=${workspaceId}`"
        class="group flex items-center gap-4 bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-brand-primary hover:shadow-md transition-all duration-150"
      >
        <div
          class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
          :class="teamColor(i)"
        >
          {{ teamInitial(team.name) }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-gray-900 truncate">{{ team.name ?? team.id }}</p>
          <p class="text-xs text-gray-400 mt-0.5">Métriques & vélocité</p>
        </div>
        <span class="text-gray-300 group-hover:text-brand-primary transition-colors text-base leading-none">→</span>
      </NuxtLink>
    </div>
  </div>
</template>
