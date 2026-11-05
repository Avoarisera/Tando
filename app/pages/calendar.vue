<script setup lang="ts">
import type { CalBar } from '~/components/wb/WbMonthCalendar.vue'
import type { PlanPerson } from '~/components/wb/WbPlanningGrid.vue'
import type { CalendarEvent, LeaveRequestWithRelations } from '~/types/index'

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
const route = useRoute()
const { toReview, fetchAll: fetchApprovals } = useApprovals()
const { fetchMine } = useMyLeave()
const { openDetail } = useLeavePanel()
const canDecide = computed(() => profile.value?.role === 'manager' || profile.value?.role === 'admin')

const today = todayIso()
const mode = ref<'month' | 'plan' | 'list'>('month')
const month = ref(today.slice(0, 7))
const planStart = ref(addDays(today, -dayOfWeek(today)))
const onlyMe = ref(false)
const typeFilter = ref('all')
const teamFilter = ref('all')

async function load() {
  await loadProfile()
  await Promise.all([
    fetchEvents(), fetchMembers(), fetchLeaveTypes(), fetchMine(),
    isAdmin.value ? fetchTeams() : Promise.resolve(),
    canDecide.value ? fetchApprovals() : Promise.resolve(),
    fetchCountry(profile.value?.country ?? 'FR'),
  ])
}

// Deep link from « À valider » (TND-25): /calendar?view=plan&date=YYYY-MM-DD&team=<id>&focus=<request id>
const focusId = ref<string | null>(null)
function applyQuery() {
  const q = route.query
  if (q.view === 'month' || q.view === 'plan' || q.view === 'list') mode.value = q.view
  if (typeof q.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
    month.value = q.date.slice(0, 7)
    planStart.value = addDays(q.date, -dayOfWeek(q.date))
  }
  if (typeof q.team === 'string' && q.team && isAdmin.value) teamFilter.value = q.team
  focusId.value = typeof q.focus === 'string' && q.focus ? q.focus : null
}
onMounted(async () => {
  await loadProfile()
  applyQuery()
  await load()
  if (focusId.value) {
    await nextTick()
    document.querySelector(`.wb-bar[data-id="${CSS.escape(focusId.value)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }
})
watch(() => route.query, applyQuery)

// Requests I can decide on (manager: own team, admin: everyone) show on the calendar, hatched
type CalEvent = CalendarEvent & { review?: boolean }
function asEvent(r: LeaveRequestWithRelations): CalEvent {
  return {
    id: r.id, userId: r.user_id, employeeName: fullName(r.profiles),
    leaveTypeName: r.leave_types?.name ?? '', leaveTypeColor: r.leave_types?.color ?? '#9E9E9E',
    startDate: r.start_date, endDate: r.end_date, status: r.status, state: r.status, isOwn: false,
    teamId: r.profiles.team_id ?? undefined, teamName: r.profiles.teams?.name,
  }
}
const reviewIds = computed(() => new Set(toReview.value.map(r => r.id)))
const allEvents = computed<CalEvent[]>(() => {
  const known = new Set(events.value.map(e => e.id))
  const extra = toReview.value.filter(r => !known.has(r.id)).map(asEvent)
  return [...events.value, ...extra].map(e => ({ ...e, review: reviewIds.value.has(e.id) }))
})

// Click on a leave: one's own opens « Mes congés » detail; others the decision / read-only panel
const panelId = ref<string | null>(null)
const panelEvent = computed(() => allEvents.value.find(e => e.id === panelId.value) ?? null)
function openLeave(id: string) {
  const e = allEvents.value.find(x => x.id === id)
  if (!e) return
  if (e.isOwn) openDetail(id)
  else panelId.value = id
}
async function onDecided() {
  panelId.value = null
  await fetchEvents()
}
const focusRange = computed(() => {
  const e = allEvents.value.find(x => x.id === focusId.value)
  return e ? { from: e.startDate, to: e.endDate } : undefined
})

const modes = computed(() => [
  { value: 'month', label: t('calendar.month'), icon: 'calendar-days' },
  { value: 'plan', label: t('calendar.plan'), icon: 'table' },
  { value: 'list', label: t('calendar.list'), icon: 'list' },
])
const typeOptions = computed(() => [{ value: 'all', label: t('calendar.allTypes') }, ...leaveTypes.value.map(lt => ({ value: lt.name, label: lt.name }))])
const teamOptions = computed(() => [{ value: 'all', label: t('calendar.allTeams') }, ...teams.value.map(tm => ({ value: tm.id, label: tm.name }))])

// Colleagues: approved leave only. One's own requests show with their status.
const visible = computed(() => allEvents.value.filter(e =>
  // refused: only one's own, still to come (TND-23)
  (e.status !== 'rejected' || (e.isOwn && e.endDate >= today))
  && (!onlyMe.value || e.isOwn)
  && (typeFilter.value === 'all' || e.leaveTypeName === typeFilter.value)
  && (teamFilter.value === 'all' || e.teamId === teamFilter.value)))

const bars = computed<CalBar[]>(() => visible.value.map(e => ({
  id: e.id, from: e.startDate, to: e.endDate, who: e.employeeName, type: e.leaveTypeName, color: e.leaveTypeColor, pending: e.status !== 'approved',
  state: e.isOwn ? (e.state as CalBar['state']) : undefined, review: e.review,
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

// first name, + initial when two people share it (template unwraps the computed)
const shortName = computed(() => shortNames(allEvents.value.map(e => e.employeeName)))
const absentToday = computed(() => events.value.filter(e => e.status === 'approved' && e.startDate <= today && e.endDate >= today))

// Planning: 14 days, one row per visible person
const planDays = computed(() => Array.from({ length: 14 }, (_, i) => addDays(planStart.value, i)))
// Planning grouped by team (alphabetical), people without a team last
const teamNameOf = (id: string | null) => (id ? allEvents.value.find(e => e.teamId === id)?.teamName ?? teams.value.find(x => x.id === id)?.name ?? '' : '') || t('r8a.people.noTeam')
const people = computed<PlanPerson[]>(() => members.value
  .filter(m => m.role !== 'admin' || members.value.length === 1)
  .filter(m => teamFilter.value === 'all' || m.team_id === teamFilter.value)
  .map(m => ({
    id: m.id,
    name: fullName(m),
    group: teamNameOf(m.team_id),
    spans: visible.value.filter(e => e.userId === m.id).map(e => ({ id: e.id, from: e.startDate, to: e.endDate, label: e.isOwn && e.state === 'rejected' ? `${e.leaveTypeName} · ${t('tnd23.state.rejected')}` : e.review ? `${e.leaveTypeName} · ${t('tnd25.toReview')}` : e.leaveTypeName, shortLabel: e.leaveTypeName, color: e.leaveTypeColor, pending: e.status !== 'approved', state: e.isOwn ? e.state : undefined, review: e.review })),
  }))
  .filter(p => !onlyMe.value || p.spans.length)
  .sort((a, b) => (a.group === t('r8a.people.noTeam') ? 1 : 0) - (b.group === t('r8a.people.noTeam') ? 1 : 0) || (a.group ?? '').localeCompare(b.group ?? '') || a.name.localeCompare(b.name)))

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

// Jump to any month / year (no need to click month after month)
const monthOptions = computed(() => Array.from({ length: 12 }, (_, i) => {
  const m = `${String(i + 1).padStart(2, '0')}`
  const l = new Date(2026, i, 1).toLocaleDateString(tag.value, { month: 'long' })
  return { value: m, label: l.charAt(0).toUpperCase() + l.slice(1) }
}))
const yearOptions = computed(() => {
  const y = Number(today.slice(0, 4))
  const shown = Number(month.value.slice(0, 4))
  const ys = new Set<number>([y - 2, y - 1, y, y + 1, y + 2, shown])
  return [...ys].sort((a, b) => a - b).map(v => ({ value: String(v), label: String(v) }))
})
function jumpTo(ym: string) {
  month.value = ym
  const first = `${ym}-01`
  planStart.value = addDays(first, -dayOfWeek(first))
}
const pickMonth = computed({
  get: () => (mode.value === 'plan' ? addDays(planStart.value, 3) : month.value).slice(5, 7),
  set: (m: string) => jumpTo(`${pickYear.value}-${m}`),
})
const pickYear = computed<string>({
  get: () => (mode.value === 'plan' ? addDays(planStart.value, 3) : month.value).slice(0, 4),
  set: (y: string) => jumpTo(`${y}-${pickMonth.value}`),
})

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
          <h2 :class="['h2', { 'wb-sr': mode !== 'plan' }]">{{ mode === 'plan' ? planTitle : monthTitle }}</h2>
          <div class="wb-row wb-cal-jump">
            <WbSelect v-model="pickMonth" :options="monthOptions" :aria-label="t('calendar.pickMonth')" />
            <WbSelect v-model="pickYear" :options="yearOptions" :aria-label="t('calendar.pickYear')" />
          </div>
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
            <WbAvatar :name="e.employeeName" :size="22" />{{ shortName(e.employeeName) }} · {{ e.leaveTypeName }}
          </span>
        </template>
        <span v-else class="wb-mut">{{ t('calendar.nobodyAway') }}</span>
      </div>

      <div class="wb-card-b">
        <WbErrorState v-if="error" :message="error" @retry="load" />
        <WbSkeleton v-else-if="isLoading && !events.length" variant="table" />
        <template v-else>
          <WbMonthCalendar v-if="mode === 'month'" :month="month" :events="bars" :today="today" :holidays="holidays" interactive :focus="focusId" @open="openLeave" />
          <WbPlanningGrid v-else-if="mode === 'plan'" :style="{ '--rows': Math.max(people.length, 1) }" :days="planDays" :people="people" :today="today" :holidays="holidays" :presence-label="t('calendar.present')" interactive :focus="focusId" :highlight="focusRange" @open="openLeave" />
          <div v-else class="wb-stack-s">
            <p v-if="!weeks.length" class="wb-mut">{{ t('calendar.emptyMonth') }}</p>
            <div v-for="w in weeks" :key="w.wk" class="wb-stack-s">
              <h3 class="caption wb-mut wb-cal-wk">{{ t('calendar.weekOf', { date: fmtDate(w.wk, tag, { day: 'numeric', month: 'long' }) }) }}</h3>
              <button v-for="e in w.items" :key="e.id" type="button" :data-id="e.id" :class="['wb-row wb-cal-li', { 'is-focus': e.id === focusId }]" @click="openLeave(e.id)">
                <WbAvatar :name="e.employeeName" :size="28" />
                <span class="wb-grow small">
                  <b>{{ e.employeeName }}</b>
                  <span class="wb-mut2"> · {{ formatPeriod(e.startDate, e.endDate, tag) }}<template v-if="e.review"> · {{ t('tnd25.toReview') }}</template><template v-else-if="e.status !== 'approved'"> · {{ t('leave.status.pending') }}</template></span>
                </span>
                <WbTypeBadge :name="e.leaveTypeName" :color="e.leaveTypeColor" />
                <WbIcon name="chevron-right" :size="16" class="wb-mut2" />
              </button>
            </div>
          </div>

          <ul v-if="legend.length" class="wb-leg caption wb-cal-leg">
            <li v-for="l in legend" :key="l.name"><WbTypeBadge :name="l.name" :color="l.color" /></li>
            <li class="wb-leg-st"><i class="is-pend" />{{ t('tnd23.legend.pending') }}</li>
            <li class="wb-leg-st"><i class="is-ok" />{{ t('tnd23.legend.approved') }}</li>
            <li class="wb-leg-st"><i class="is-rej" />{{ t('tnd23.legend.rejected') }}</li>
          </ul>
        </template>
      </div>
    </section>
    <CalendarLeavePanel v-if="panelEvent" :event="panelEvent" @close="panelId = null" @decided="onDecided" />
  </div>
</template>

<style scoped>
.wb-cal-tb { align-items: center; flex-wrap: wrap; padding-bottom: var(--space-3); border-bottom: 1px solid var(--border); }
.wb-cal-nav { gap: 4px; }
.wb-cal-nav .h2 { margin-left: var(--space-2); white-space: nowrap; }
.wb-cal-filters { gap: var(--space-2); margin-left: auto; }
/* the two groups wrap onto two lines instead of overlapping (long planning title, admin team filter) */
.wb-cal-nav, .wb-cal-filters { flex: 0 1 auto; min-width: min-content; }
.wb-cal-filters :deep(.wb-field) { flex: 0 0 auto; }
/* A long type name must not stretch the filter */
.wb-cal-filters :deep(.wb-input), .wb-cal-jump :deep(.wb-input) { max-width: 220px; }
.wb-cal-filters :deep(select), .wb-cal-jump :deep(select) { text-overflow: ellipsis; min-width: 0; }
.wb-cal-jump { gap: var(--space-2); margin-left: var(--space-2); }
.wb-cal-jump :deep(.wb-field) { flex: 0 0 auto; }
.wb-cal-away { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); padding: var(--space-2) var(--space-5); background: var(--surface-2); border-bottom: 1px solid var(--border); }
.wb-cal-away-p { display: inline-flex; align-items: center; gap: 6px; }
.wb-cal-wk { text-transform: none; margin-top: var(--space-2); }
.wb-cal-li { gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); width: 100%; background: var(--surface); color: inherit; font: inherit; text-align: left; cursor: pointer; }
.wb-cal-li:hover { background: var(--surface-2); }
.wb-cal-li.is-focus { border-color: var(--brand); box-shadow: 0 0 0 1px var(--brand); }
.wb-cal-leg { margin-top: var(--space-3); }
/* Denser month grid: shorter weeks, bars on 22 px lanes */
.wb-cal-card :deep(.wb-cal-w) { grid-template-rows: calc(28px + var(--lanes) * 22px); }
.wb-cal-card :deep(.wb-cal .wb-bar) { top: calc(27px + var(--l) * 22px); height: 20px; }
/* Desktop: the month grid fills the screen height (6 weeks under the toolbar) */
@container wbapp (min-width: 1024px) {
  .wb-cal-card { flex: 1 0 auto; }
  /* Planning: taller rows and readable day headers */
  .wb-cal-card :deep(.wb-plan-cells) { min-height: clamp(40px, calc((100dvh - 420px) / var(--rows, 6)), 88px); }
  .wb-cal-card :deep(.wb-plan .wb-bar) { height: 28px; margin-top: -14px; font-size: 13px; }
  .wb-cal-card :deep(.wb-plan-hd) { font-size: 13px; }
  .wb-cal-card :deep(.wb-cal-w) { grid-template-rows: max(calc(28px + var(--lanes) * 22px), calc((100dvh - 330px) / 6)); }
}
@container wbapp (max-width: 767px) {
  .wb-cal-nav { flex-wrap: wrap; min-width: 0; }
  .wb-cal-nav .h2 { white-space: normal; margin-left: 0; flex-basis: 100%; }
  .wb-cal-filters { margin-left: 0; }
  .wb-cal-filters :deep(.wb-seg) { flex-basis: 100%; }
  .wb-cal-away { padding-inline: var(--space-4); }
}
</style>
