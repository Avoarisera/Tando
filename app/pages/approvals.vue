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

function resetFilters() {
  search.value = ''
  level2.value = false
  level1.value = false
  teamFilter.value = 'all'
  typeFilter.value = 'all'
}

</script>

<template>
  <div class="wb-page wb-stack">
    <WbTabs v-model="tab" :tabs="tabs" :label="t('nav.approvals')" />

    <div v-if="isAdmin" class="wb-fb">
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
      <ApprovalQueue v-else role="tabpanel" :items="shown" :is-admin="isAdmin" bulk :with-planning="!isAdmin" />
    </template>

    <template v-else>
      <p v-if="!shownDone.length" class="wb-card wb-card-b wb-mut">{{ t('approvals.noneDone') }}</p>
      <ul v-else class="wb-card wb-card-b wb-list" role="tabpanel">
        <li v-for="r in shownDone" :key="r.id">
          <WbAvatar :name="fullName(r.profiles)" />
          <span class="wb-grow">
            <b class="small">{{ fullName(r.profiles) }}</b><br>
            <span class="small wb-mut2">{{ r.leave_types?.name }} · {{ formatPeriod(r.start_date, r.end_date, tag) }}</span>
          </span>
          <WbStatusBadge :status="r.status" />
        </li>
      </ul>
    </template>

  </div>
</template>
