<script setup lang="ts">
definePageMeta({ titleKey: 'nav.velocity', layout: 'private', middleware: 'admin-only' })

const { t } = useI18n()
const route = useRoute()
const workspaceId = route.params.id as string

const { workspaces, fetchWorkspaces } = useLinearWorkspace()
const { teams, isLoading, error, fetchTeams } = useLinearTeams()

onMounted(async () => {
  await Promise.all([fetchWorkspaces(), fetchTeams(workspaceId)])
})

const workspace = computed(() => workspaces.value.find(w => w.id === workspaceId))

usePageHeader(() => ({
  crumbs: [
    { label: t('nav.velocity'), to: '/velocite' },
    { label: workspace.value?.name ?? t('velocityA.workspace') },
  ],
}))

// Stable colour per team, from the design's leave palette
const COLORS = ['blue', 'violet', 'teal', 'amber', 'pink', 'cyan']
const teamColor = (i: number) => leaveVars(COLORS[i % COLORS.length])
const teamInitial = (name: string | null) => (name ?? '?').charAt(0).toUpperCase()
</script>

<template>
  <div class="wb-page wb-stack">
    <p class="wb-mut2">{{ t('velocityA.teamsIntro') }}</p>

    <WbErrorState v-if="error" :message="readableApiError(error)" @retry="fetchTeams(workspaceId)" />
    <WbSkeleton v-else-if="isLoading && !teams.length" variant="table" :count="4" />
    <div v-else-if="teams.length === 0" class="wb-card">
      <WbEmptyState art="link" :title="t('velocityA.noTeamsTitle')">{{ t('velocityA.noTeamsText') }}</WbEmptyState>
    </div>

    <div v-else class="wb-grid wb-cols-2">
      <NuxtLink
        v-for="(team, i) in teams"
        :key="team.id"
        :to="`/velocite/teams/${team.id}?workspaceId=${workspaceId}`"
        class="wb-card wb-card-b wb-row wb-team-link"
        :data-team="team.name ?? team.id"
      >
        <span class="wb-team-i h3" :style="teamColor(i)" aria-hidden="true">{{ teamInitial(team.name) }}</span>
        <span class="wb-grow">
          <span class="h3 wb-team-n">{{ team.name ?? team.id }}</span>
          <span class="small wb-mut">{{ t('velocityA.teamCard') }}</span>
        </span>
        <WbIcon name="chevron-right" :size="18" />
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.wb-team-link { gap: var(--space-4); text-decoration: none; color: var(--ink); transition: box-shadow 120ms; }
.wb-team-link:hover { box-shadow: var(--shadow-2); }
.wb-team-i { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--lt); color: var(--lx); }
.wb-team-n { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .wb-team-link { transition: none; } }
</style>
