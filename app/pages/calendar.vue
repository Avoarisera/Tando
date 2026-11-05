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
const { profile } = useCurrentUser()
const { fetchCountry, holidaysOf } = useHolidays()
const holidays = computed(() => holidaysOf(profile.value?.country ?? 'FR'))

const today = todayIso()
const mode = ref<'month' | 'plan' | 'list'>('month')
const month = ref(today.slice(0, 7))
const planStart = ref(addDays(today, -dayOfWeek(today)))
const onlyMe = ref(false)
const typeFilter = ref('all')
const teamFilter = ref('all')

async function load() {
  await loadProfile()
  await Promise.all([fetchEvents(), fetchMembers(), fetchLeaveTypes(), isAdmin.value ? fetchTeams() : Promise.resolve(), fetchCountry(profile.value?.country ?? 'FR')])
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
  <div class="wb-page">
    <section class="wb-card wb-cal-card">
      <!-- One toolbar: period navigation on the left, view and filters on the right -->
      <header class="wb-card-h wb-cal-tb">
        <div class="wb-row wb-cal-nav">
          <WbButton variant="ghost" size="sm" icon="chevron-left" icon-only @click="prev">{{ t('picker.prev') }}</WbButton>
          <WbButton variant="secondary" size="sm" @click="goToday">{{ t('calendar.today') }}</WbButton>
          <WbButton variant="ghost" size="sm" icon="chevron-right" icon-only @click="next">{{ t('picker.next') }}</WbButton>
          <h2 class="h2">{{ mode === 'plan' ? planTitle : monthTitle }}</h2>
        </div>
        <div class="wb-row wb-wrap wb-cal-filters">
          <WbSegmented v-model="mode" :options="modes" :label="t('calendar.view')" />
          <WbFilterChip v-model="onlyMe">{{ t('calendar.onlyMe') }}</WbFilterChip>
          <WbSelect v-if="isAdmin" v-model="teamFilter" :options="teamOptions" :aria-label="t('calendar.team')" />
          <WbSelect v-model="typeFilter" :options="typeOptions" :aria-label="t('calendar.type')" />
        </div>
      </header>

      <div class="wb-cal-away small">
        <b>{{ t('calendar.awayToday') }}</b>
        <template v-if="absentToday.length">
          <span v-for="e in absentToday" :key="e.id" class="wb-cal-away-p">
            <WbAvatar :name="e.employeeName" :size="22" />{{ e.employeeName.split(' ')[0] }} · {{ e.leaveTypeName }}
          </span>
        </template>
        <span v-else class="wb-mut">{{ t('calendar.nobodyAway') }}</span>
      </div>

      <div class="wb-card-b">
        <WbErrorState v-if="error" :message="error" @retry="load" />
        <WbSkeleton v-else-if="isLoading && !events.length" variant="table" />
        <template v-else>
          <WbMonthCalendar v-if="mode === 'month'" :month="month" :events="bars" :today="today" :holidays="holidays" />
          <WbPlanningGrid v-else-if="mode === 'plan'" :days="planDays" :people="people" :today="today" :holidays="holidays" :presence-label="t('calendar.present')" />
          <div v-else class="wb-stack-s">
            <p v-if="!weeks.length" class="wb-mut">{{ t('calendar.emptyMonth') }}</p>
            <div v-for="w in weeks" :key="w.wk" class="wb-stack-s">
              <h3 class="caption wb-mut wb-cal-wk">{{ t('calendar.weekOf', { date: fmtDate(w.wk, tag, { day: 'numeric', month: 'long' }) }) }}</h3>
              <div v-for="e in w.items" :key="e.id" class="wb-row wb-cal-li">
                <WbAvatar :name="e.employeeName" :size="28" />
                <div class="wb-grow small">
                  <b>{{ e.employeeName }}</b>
                  <span class="wb-mut2"> · {{ formatPeriod(e.startDate, e.endDate, tag) }}<template v-if="e.status !== 'approved'"> · {{ t('leave.status.pending') }}</template></span>
                </div>
                <WbTypeBadge :name="e.leaveTypeName" :color="e.leaveTypeColor" />
              </div>
            </div>
          </div>

          <ul v-if="legend.length" class="wb-leg caption wb-cal-leg">
            <li v-for="l in legend" :key="l.name"><WbTypeBadge :name="l.name" :color="l.color" /></li>
            <li>{{ t('calendar.hatched') }}</li>
          </ul>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wb-cal-tb { align-items: center; flex-wrap: wrap; padding-bottom: var(--space-3); border-bottom: 1px solid var(--border); }
.wb-cal-nav { gap: 4px; }
.wb-cal-nav .h2 { margin-left: var(--space-2); white-space: nowrap; }
.wb-cal-filters { gap: var(--space-2); margin-left: auto; }
.wb-cal-filters :deep(.wb-field) { flex: 0 0 auto; }
.wb-cal-away { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); padding: var(--space-2) var(--space-5); background: var(--surface-2); border-bottom: 1px solid var(--border); }
.wb-cal-away-p { display: inline-flex; align-items: center; gap: 6px; }
.wb-cal-wk { text-transform: none; margin-top: var(--space-2); }
.wb-cal-li { gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); }
.wb-cal-leg { margin-top: var(--space-3); }
/* Denser month grid: shorter weeks, bars on 22 px lanes */
.wb-cal-card :deep(.wb-cal-w) { grid-template-rows: calc(28px + var(--lanes) * 22px); }
.wb-cal-card :deep(.wb-cal .wb-bar) { top: calc(27px + var(--l) * 22px); height: 20px; }
@container wbapp (max-width: 767px) {
  .wb-cal-nav { flex-wrap: wrap; min-width: 0; }
  .wb-cal-nav .h2 { white-space: normal; margin-left: 0; flex-basis: 100%; }
  .wb-cal-filters { margin-left: 0; }
  .wb-cal-filters :deep(.wb-seg) { flex-basis: 100%; }
  .wb-cal-away { padding-inline: var(--space-4); }
}
</style>
