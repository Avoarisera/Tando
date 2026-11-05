<script setup lang="ts">
import type { LeaveGroup } from '~/composables/useMyLeave'

definePageMeta({ titleKey: 'nav.leaves', layout: 'private' })

const { t } = useI18n()
const { profile, isAdmin, loadProfile } = useCurrentUser()

await loadProfile()
// Admins have no personal leave; their approvals live on /approvals.
if (isAdmin.value) await navigateTo('/approvals', { replace: true })

const { requests, loaded, isLoading, error, fetchMine } = useMyLeave()
const { open: openLeave, openDetail } = useLeavePanel()
const route = useRoute()
const router = useRouter()
const today = todayIso()

onMounted(fetchMine)

const grouped = computed(() => {
  const g: Record<LeaveGroup, typeof requests.value[number][]> = { upcoming: [], pending: [], past: [], refused: [] }
  for (const r of requests.value) g[leaveGroup(r, today)].push(r)
  // Upcoming and pending: soonest first; past and refused: latest first
  g.upcoming.sort((a, b) => a.start_date.localeCompare(b.start_date))
  g.pending.sort((a, b) => a.start_date.localeCompare(b.start_date))
  return g
})

const GROUPS: LeaveGroup[] = ['upcoming', 'pending', 'past', 'refused']
const tabs = computed(() => GROUPS.map(id => ({ id, label: t(`leaves.tabs.${id}`), count: grouped.value[id].length })))

// Default tab: pending if something waits, else upcoming. Kept in the URL (?tab=).
const tab = computed<LeaveGroup>({
  get: () => {
    const q = route.query.tab
    if (typeof q === 'string' && (GROUPS as string[]).includes(q)) return q as LeaveGroup
    return grouped.value.pending.length ? 'pending' : 'upcoming'
  },
  set: (v) => { router.replace({ query: { ...route.query, tab: v } }) },
})
const list = computed(() => grouped.value[tab.value])
</script>

<template>
  <div class="wb-page wb-stack wb-leaves">
    <div class="wb-leaves-bar">
      <WbTabs v-model="tab" :tabs="tabs" :label="t('nav.leaves')" />
      <WbButton class="wb-hide-m" size="sm" variant="secondary" icon="plus" aria-haspopup="dialog" @click="openLeave()">{{ t('nav.leave') }}</WbButton>
    </div>

    <WbErrorState v-if="error" :message="error" @retry="fetchMine" />
    <WbSkeleton v-else-if="!loaded && isLoading" />
    <div v-else-if="!requests.length" class="wb-card">
      <WbEmptyState art="calendar" :title="t('leaves.emptyTitle')">
        {{ t('leaves.emptyText') }}
        <template #action>
          <WbButton icon="plus" aria-haspopup="dialog" @click="openLeave()">{{ t('nav.leave') }}</WbButton>
        </template>
      </WbEmptyState>
    </div>
    <div v-else-if="!list.length" class="wb-card wb-card-b">
      <p class="wb-mut">{{ t(`leaves.none.${tab}`) }}</p>
    </div>
    <div v-else class="wb-lc-list" role="tabpanel">
      <LeaveCard v-for="r in list" :key="r.id" :request="r" :role="profile?.role ?? 'employee'" @open="openDetail" />
    </div>
  </div>
</template>

<style scoped>
.wb-leaves { gap: var(--space-3); }
.wb-leaves-bar { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-3); border-bottom: 1px solid var(--border); }
.wb-leaves-bar :deep(.wb-tabs) { border-bottom: 0; flex: 1; min-width: 0; }
.wb-leaves-bar > .wb-btn { margin-bottom: 6px; }
.wb-lc-list { display: flex; flex-direction: column; gap: var(--space-2); }
</style>
