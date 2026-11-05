<script setup lang="ts">
import type { LeaveRequestWithRelations } from '~/types/index'

definePageMeta({ titleKey: 'nav.approvals', layout: 'private' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { isEmployee, isAdmin, loadProfile } = useCurrentUser()

await loadProfile()
if (isEmployee.value) await navigateTo('/leave-requests', { replace: true })

const { requests, loaded, isLoading, error, toReview, reviewed, fetchAll } = useApprovals()
const { fetchEvents } = useCalendar()
const { fetchMembers } = useTeamMembers()
const { teams, fetchTeams } = useTeams()

async function load() {
  await Promise.all([fetchAll(), fetchEvents(), fetchMembers(), isAdmin.value ? fetchTeams() : Promise.resolve()])
}
onMounted(load)

const tab = ref<'todo' | 'done'>('todo')
const tabs = computed(() => [
  { id: 'todo', label: t('approvals.tabTodo'), count: toReview.value.length },
  { id: 'done', label: t('approvals.tabDone'), count: reviewed.value.length },
])

// Admin filters
const search = ref('')
const level2 = ref(false)
const level1 = ref(false)
const teamFilter = ref('all')
const typeFilter = ref('all')
const teamOptions = computed(() => [{ value: 'all', label: t('calendar.allTeams') }, ...teams.value.map(x => ({ value: x.id, label: x.name }))])
const typeOptions = computed(() => {
  const names = [...new Set(requests.value.map(r => r.leave_types?.name).filter(Boolean))] as string[]
  return [{ value: 'all', label: t('calendar.allTypes') }, ...names.map(n => ({ value: n, label: n }))]
})
const level2Count = computed(() => toReview.value.filter(r => r.status === 'manager_approved').length)
const level1Count = computed(() => toReview.value.filter(r => r.status === 'pending').length)

function matches(r: LeaveRequestWithRelations) {
  const q = search.value.trim().toLowerCase()
  if (q && !fullName(r.profiles).toLowerCase().includes(q)) return false
  if (teamFilter.value !== 'all' && r.profiles.team_id !== teamFilter.value) return false
  if (typeFilter.value !== 'all' && r.leave_types?.name !== typeFilter.value) return false
  if (level2.value !== level1.value) {
    if (level2.value && r.status !== 'manager_approved') return false
    if (level1.value && r.status !== 'pending') return false
  }
  return true
}
const shown = computed(() => (isAdmin.value ? toReview.value.filter(matches) : toReview.value))
const shownDone = computed(() => (isAdmin.value ? reviewed.value.filter(matches) : reviewed.value))
const donePager = usePagination(shownDone)

function resetFilters() {
  search.value = ''
  level2.value = false
  level1.value = false
  teamFilter.value = 'all'
  typeFilter.value = 'all'
}

</script>

<template>
  <div class="wb-page wb-stack wb-ap-page">
    <WbTabs v-model="tab" :tabs="tabs" :label="t('nav.approvals')" />

    <ol v-if="isAdmin && tab === 'todo'" class="wb-ap-flow small" :aria-label="t('approvals.flowTitle')">
      <li><span class="wb-ap-n">1</span>{{ t('approvals.flow1') }}</li>
      <li><span class="wb-ap-n">2</span>{{ t('approvals.flow2') }}</li>
      <li><span class="wb-ap-n">3</span>{{ t('approvals.flow3') }}</li>
      <li class="wb-mut2">{{ t('approvals.flowNoManager') }}</li>
    </ol>

    <div v-if="isAdmin" class="wb-fb wb-ap-toolbar">
      <div class="wb-fb-s"><WbInput v-model="search" icon="search" type="search" :aria-label="t('approvals.search')" :placeholder="t('approvals.search')" /></div>
      <div class="wb-fb-c">
        <WbFilterChip v-model="level2" :count="level2Count">{{ t('approvals.level2') }}</WbFilterChip>
        <WbFilterChip v-model="level1" :count="level1Count">{{ t('approvals.level1') }}</WbFilterChip>
        <WbSelect v-model="teamFilter" :options="teamOptions" :aria-label="t('calendar.team')" />
        <WbSelect v-model="typeFilter" :options="typeOptions" :aria-label="t('calendar.type')" />
        <WbButton variant="ghost" size="sm" @click="resetFilters">{{ t('approvals.reset') }}</WbButton>
      </div>
    </div>

    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!loaded && isLoading" />

    <template v-else-if="tab === 'todo'">
      <div v-if="!toReview.length" class="wb-card">
        <WbEmptyState art="inbox" :title="t('approvals.emptyTitle')">{{ t('approvals.emptyText') }}</WbEmptyState>
      </div>
      <p v-else-if="!shown.length" class="wb-card wb-card-b wb-mut">{{ t('approvals.noMatch') }}</p>
      <div v-else class="wb-ap-scroll">
        <ApprovalQueue role="tabpanel" :items="shown" :is-admin="isAdmin" bulk grid :with-planning="!isAdmin" />
      </div>
    </template>

    <template v-else>
      <p v-if="!shownDone.length" class="wb-card wb-card-b wb-mut">{{ t('approvals.noneDone') }}</p>
      <WbCard v-else :pad="false" role="tabpanel" class="wb-ap-done">
        <div class="wb-scroll wb-dt">
          <table>
            <caption class="wb-sr">{{ t('approvals.tabDone') }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ t('dashboard.csv.person') }}</th>
                <th scope="col">{{ t('calendar.type') }}</th>
                <th scope="col">{{ t('v2.period') }}</th>
                <th scope="col" class="is-r">{{ t('dashboard.csv.days') }}</th>
                <th scope="col">{{ t('rules.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in donePager.items.value" :key="r.id">
                <td><span class="wb-cp"><WbAvatar :name="fullName(r.profiles)" :size="28" /><b class="small">{{ fullName(r.profiles) }}</b></span></td>
                <td><WbTypeBadge :name="r.leave_types?.name ?? ''" :color="r.leave_types?.color" /></td>
                <td class="wb-num">{{ formatPeriod(r.start_date, r.end_date, tag) }}</td>
                <td class="is-r wb-num">{{ fmtDays(Number(r.days_count), tag) }}</td>
                <td><span class="wb-row" style="gap: 6px"><WbStatusBadge :status="r.status" /><WbBadge v-if="r.is_exception" tone="warning" size="sm" icon="shield" :title="r.exception_reason ?? undefined">{{ t('tnd23.badge') }}</WbBadge></span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <WbTableFooter v-model:page="donePager.page.value" :total="donePager.total.value" :page-size="donePager.pageSize.value" />
      </WbCard>
    </template>

  </div>
</template>

<style scoped>
/* Desktop: the page never scrolls; the list of requests scrolls under the filters */
@container wbapp (min-width: 1024px) {
  .wb-main > .wb-ap-page { flex: none; height: calc(100dvh - 56px - var(--space-5) - var(--space-8) - 8px); max-height: calc(100dvh - 56px - var(--space-5) - var(--space-8) - 8px); min-height: 0; overflow: hidden; }
  /* positioned, so absolutely placed bits (hidden checkboxes) stay inside the scroll area */
  .wb-ap-scroll { position: relative; flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 2px; margin: -2px; }
  .wb-ap-scroll :deep(.wb-aq-bar) { top: 0; }
  .wb-ap-done { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
  .wb-ap-done :deep(.wb-scroll) { flex: 1 1 0; min-height: 0; overflow-y: auto; }
}
/* Approval flow, always visible above the queue */
.wb-ap-flow { list-style: none; margin: 0; padding: var(--space-3) var(--space-4); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-5); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); color: var(--ink-2); }
.wb-ap-flow li { display: inline-flex; align-items: center; gap: var(--space-2); }
.wb-ap-flow li:last-child { flex-basis: 100%; }
.wb-ap-n { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; background: var(--brand-tint); color: var(--brand-text); font-size: 12px; font-weight: 700; line-height: 1; }

.wb-ap-toolbar { padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.wb-ap-toolbar :deep(.wb-btn) { margin: 0; }
</style>
