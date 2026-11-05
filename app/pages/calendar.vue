<script setup lang="ts">
import type { CalBar } from '~/components/wb/WbMonthCalendar.vue'
import type { PlanPerson } from '~/components/wb/WbPlanningGrid.vue'

definePageMeta({ titleKey: 'nav.calendar', layout: 'private' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { isAdmin, loadProfile } = useCurrentUser()
const { events, isLoading, error, fetchEvents } = useCalendar()
const { members, fetchMembers } = useTeamMembers()
const { teams, fetchTeams } = useTeams()
const { leaveTypes, fetchLeaveTypes } = useLeaveTypes()

const today = todayIso()
const mode = ref<'month' | 'plan' | 'list'>('month')
const month = ref(today.slice(0, 7))
const planStart = ref(addDays(today, -dayOfWeek(today)))
const onlyMe = ref(false)
const typeFilter = ref('all')
const teamFilter = ref('all')

async function load() {
  await loadProfile()
  await Promise.all([fetchEvents(), fetchMembers(), fetchLeaveTypes(), isAdmin.value ? fetchTeams() : Promise.resolve()])
}
onMounted(load)

const modes = computed(() => [
  { value: 'month', label: t('calendar.month'), icon: 'calendar-days' },
  { value: 'plan', label: t('calendar.plan'), icon: 'table' },
  { value: 'list', label: t('calendar.list'), icon: 'list' },
])
const typeOptions = computed(() => [{ value: 'all', label: t('calendar.allTypes') }, ...leaveTypes.value.map(lt => ({ value: lt.name, label: lt.name }))])
const teamOptions = computed(() => [{ value: 'all', label: t('calendar.allTeams') }, ...teams.value.map(tm => ({ value: tm.id, label: tm.name }))])

// Refused requests never show; own pending ones are hatched
const visible = computed(() => events.value.filter(e =>
  e.status !== 'rejected'
  && (!onlyMe.value || e.isOwn)
  && (typeFilter.value === 'all' || e.leaveTypeName === typeFilter.value)
  && (teamFilter.value === 'all' || e.teamId === teamFilter.value)))

const bars = computed<CalBar[]>(() => visible.value.map(e => ({
  id: e.id, from: e.startDate, to: e.endDate, who: e.employeeName, type: e.leaveTypeName, color: e.leaveTypeColor, pending: e.status !== 'approved',
})))

// Legend: only the types shown in the current month or planning window
const shownRange = computed(() => (mode.value === 'plan'
  ? [planDays.value[0]!, planDays.value.at(-1)!]
  : [addDays(`${month.value}-01`, -6), addDays(monthDays(month.value).at(-1)!, 6)]))
const legend = computed(() => {
  const [a, b] = shownRange.value
  const seen = new Map<string, string>()
  for (const e of visible.value) if (e.startDate <= b! && e.endDate >= a!) seen.set(e.leaveTypeName, e.leaveTypeColor)
  return [...seen].map(([name, color]) => ({ name, color }))
})

const absentToday = computed(() => events.value.filter(e => e.status === 'approved' && e.startDate <= today && e.endDate >= today))

// Planning: 14 days, one row per visible person
const planDays = computed(() => Array.from({ length: 14 }, (_, i) => addDays(planStart.value, i)))
const people = computed<PlanPerson[]>(() => members.value
  .filter(m => m.role !== 'admin' || members.value.length === 1)
  .filter(m => teamFilter.value === 'all' || m.team_id === teamFilter.value)
  .map(m => ({
    id: m.id,
    name: fullName(m),
    spans: visible.value.filter(e => e.userId === m.id).map(e => ({ id: e.id, from: e.startDate, to: e.endDate, label: e.leaveTypeName, color: e.leaveTypeColor, pending: e.status !== 'approved' })),
  }))
  .filter(p => !onlyMe.value || p.spans.length))

// List: leave of the shown month, grouped by week
const weeks = computed(() => {
  const first = `${month.value}-01`
  const last = monthDays(month.value).at(-1)!
  const map = new Map<string, typeof visible.value>()
  for (const e of [...visible.value].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (e.endDate < first || e.startDate > last) continue
    const s = e.startDate < first ? first : e.startDate
    const wk = addDays(s, -dayOfWeek(s))
    map.set(wk, [...(map.get(wk) ?? []), e])
  }
  return [...map].map(([wk, items]) => ({ wk, items }))
})

const monthTitle = computed(() => {
  const s = fmtMonth(`${month.value}-01`, tag.value)
  return s.charAt(0).toUpperCase() + s.slice(1)
})
const planTitle = computed(() => formatPeriod(planDays.value[0]!, planDays.value.at(-1)!, tag.value))

function prev() {
  if (mode.value === 'plan') planStart.value = addDays(planStart.value, -7)
  else month.value = shiftMonth(month.value, -1)
}
function next() {
  if (mode.value === 'plan') planStart.value = addDays(planStart.value, 7)
  else month.value = shiftMonth(month.value, 1)
}
function goToday() {
  month.value = today.slice(0, 7)
  planStart.value = addDays(today, -dayOfWeek(today))
}
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-row-b wb-wrap">
      <WbSegmented v-model="mode" :options="modes" :label="t('calendar.view')" />
      <div class="wb-row wb-wrap">
        <WbFilterChip v-model="onlyMe">{{ t('calendar.onlyMe') }}</WbFilterChip>
        <WbSelect v-if="isAdmin" v-model="teamFilter" :options="teamOptions" :aria-label="t('calendar.team')" />
        <WbSelect v-model="typeFilter" :options="typeOptions" :aria-label="t('calendar.type')" />
      </div>
    </div>

    <div class="wb-card wb-card-b wb-row wb-wrap" style="gap: 12px">
      <span class="h3">{{ t('calendar.awayToday') }}</span>
      <template v-if="absentToday.length">
        <span v-for="e in absentToday" :key="e.id" class="wb-row" style="gap: 6px">
          <WbAvatar :name="e.employeeName" :size="28" /><span class="small">{{ e.employeeName.split(' ')[0] }} · {{ e.leaveTypeName }}</span>
        </span>
      </template>
      <span v-else class="small wb-mut">{{ t('calendar.nobodyAway') }}</span>
    </div>

    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="isLoading && !events.length" variant="table" />

    <template v-else>
      <WbCard :title="mode === 'plan' ? planTitle : monthTitle">
        <template #action>
          <div class="wb-row" style="gap: 4px">
            <WbButton variant="ghost" size="sm" icon="chevron-left" icon-only @click="prev">{{ t('picker.prev') }}</WbButton>
            <WbButton variant="secondary" size="sm" @click="goToday">{{ t('calendar.today') }}</WbButton>
            <WbButton variant="ghost" size="sm" icon="chevron-right" icon-only @click="next">{{ t('picker.next') }}</WbButton>
          </div>
        </template>

        <WbMonthCalendar v-if="mode === 'month'" :month="month" :events="bars" :today="today" />
        <WbPlanningGrid v-else-if="mode === 'plan'" :days="planDays" :people="people" :today="today" :presence-label="t('calendar.present')" />
        <div v-else class="wb-stack">
          <p v-if="!weeks.length" class="wb-mut">{{ t('calendar.emptyMonth') }}</p>
          <div v-for="w in weeks" :key="w.wk" class="wb-stack-s">
            <h3 class="h3">{{ t('calendar.weekOf', { date: fmtDate(w.wk, tag, { day: 'numeric', month: 'long' }) }) }}</h3>
            <div v-for="e in w.items" :key="e.id" class="wb-row wb-cal-li" style="gap: 12px">
              <WbAvatar :name="e.employeeName" />
              <div class="wb-grow">
                <p class="h3">{{ e.employeeName }}</p>
                <p class="small wb-mut2">{{ formatPeriod(e.startDate, e.endDate, tag) }}<template v-if="e.status !== 'approved'"> · {{ t('leave.status.pending') }}</template></p>
              </div>
              <WbTypeBadge :name="e.leaveTypeName" :color="e.leaveTypeColor" />
            </div>
          </div>
        </div>
      </WbCard>

      <ul v-if="legend.length" class="wb-leg caption">
        <li v-for="l in legend" :key="l.name"><WbTypeBadge :name="l.name" :color="l.color" /></li>
        <li>{{ t('calendar.hatched') }}</li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.wb-cal-li { padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); }
</style>
