<script setup lang="ts">
import type { PlanPerson } from '~/components/wb/WbPlanningGrid.vue'

definePageMeta({ titleKey: 'nav.home', layout: 'private' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { profile, isAdmin, isManager, loadProfile } = useCurrentUser()
const { openDetail } = useLeavePanel()

await loadProfile()
// The admin has no personal leave: their home is the dashboard.
if (isAdmin.value) await navigateTo('/dashboard', { replace: true })

const { requests: mine, loaded, isLoading, error, fetchMine } = useMyLeave()
const { balances, isLoading: balLoading, error: balError, fetchBalances } = useLeaveBalances()
const { events, fetchEvents } = useCalendar()
const { members, fetchMembers } = useTeamMembers()
const { toReview, fetchAll: fetchApprovals } = useApprovals()

const today = todayIso()
const year = Number(today.slice(0, 4))

async function load() {
  await Promise.all([fetchMine(), fetchBalances(), fetchEvents(), fetchMembers(), fetchCountry(profile.value?.country ?? 'FR'), isManager.value ? fetchApprovals() : Promise.resolve()])
}
onMounted(load)

const dateLabel = computed(() => {
  const s = fmtDate(today, tag.value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
})

const pending = computed(() => mine.value.filter(r => r.status === 'pending' || r.status === 'manager_approved'))

// Main balance: the first one (Congés payés in the seed), others listed below
const balanceRows = computed(() => balances.value.map((b) => {
  const reserved = reservedDays(mine.value, b.leave_type_id, year)
  return { id: b.id, name: b.leave_types.name, color: b.leave_types.color, allocated: b.allocated_days, used: b.used_days, reserved, left: b.allocated_days - b.used_days - reserved }
}))
const mainBalance = computed(() => balanceRows.value[0])

const nextLeave = computed(() => mine.value
  .filter(r => r.status === 'approved' && r.end_date >= today)
  .sort((a, b) => a.start_date.localeCompare(b.start_date))[0])
const nextLeaveWhen = computed(() => {
  const r = nextLeave.value
  if (!r) return ''
  if (r.start_date <= today) return t('home.onLeaveNow')
  const w = weeksUntil(r.start_date, today)
  if (w >= 1) return t('home.inWeeks', { n: w }, w)
  const d = calendarDays(today, r.start_date) - 1
  return t('home.inDays', { n: d }, d)
})

// Team this week: approved leave of colleagues, Monday to Sunday
const monday = addDays(today, -dayOfWeek(today))
const sunday = addDays(monday, 6)
const teamWeek = computed(() => events.value
  .filter(e => !e.isOwn && e.status === 'approved' && e.startDate <= sunday && e.endDate >= monday)
  .map(e => ({
    id: e.id,
    name: e.employeeName,
    type: e.leaveTypeName,
    color: e.leaveTypeColor,
    when: formatPeriod(e.startDate < monday ? monday : e.startDate, e.endDate > sunday ? sunday : e.endDate, tag.value),
  })))
// Team planning: two weeks from Monday, one row per teammate (own row first)
const { fetchCountry, holidaysOf } = useHolidays()
const holidays = computed(() => holidaysOf(profile.value?.country ?? 'FR'))
const teamDays = Array.from({ length: 14 }, (_, i) => addDays(monday, i))
const teamPeople = computed<PlanPerson[]>(() => members.value
  .filter(m => m.role !== 'admin' && (m.id === profile.value?.id || (m.team_id && m.team_id === profile.value?.team_id)))
  .sort((a, b) => (a.id === profile.value?.id ? -1 : b.id === profile.value?.id ? 1 : 0))
  .map(m => ({
    id: m.id,
    name: fullName(m),
    spans: events.value.filter(e => e.userId === m.id && (e.status === 'approved' || e.isOwn)).map(e => ({ id: e.id, from: e.startDate, to: e.endDate, label: e.leaveTypeName, color: e.leaveTypeColor, pending: e.status !== 'approved' })),
  })))

const presentToday = computed(() => {
  const team = members.value.filter(m => m.team_id && m.team_id === profile.value?.team_id)
  const away = events.value.filter(e => e.status === 'approved' && e.startDate <= today && e.endDate >= today && team.some(m => m.id === e.userId)).length
  return { n: team.length - away, of: team.length }
})

const firstLoad = computed(() => !loaded.value && (isLoading.value || balLoading.value))
const loadError = computed(() => error.value || balError.value)

const pendingDays = computed(() => pending.value.reduce((n, r) => n + Number(r.days_count), 0))
const pct = (b: { allocated: number, used: number, reserved: number }) => {
  const max = Number(b.allocated) || 0
  if (!max) return { used: 0, reserved: 0 }
  return { used: Math.min(100, (Number(b.used) / max) * 100), reserved: Math.min(100, (Number(b.reserved) / max) * 100) }
}
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-home-h">
      <h2 class="h1">{{ t('home.hello', { name: profile?.first_name ?? '' }) }}</h2>
      <span class="wb-mut">{{ dateLabel }}</span>
    </div>

    <WbErrorState v-if="loadError" :message="loadError" @retry="load" />
    <WbSkeleton v-else-if="firstLoad" variant="metric" :count="4" />
    <div v-else-if="!balanceRows.length" class="wb-card">
      <WbEmptyState art="sun" :title="t('home.welcomeTitle')">{{ t('home.welcomeText') }}</WbEmptyState>
    </div>

    <template v-if="!loadError && !firstLoad && balanceRows.length">
      <!-- Key figures in one compact row -->
      <div class="wb-grid wb-cols-4 wb-home-kpis">
        <div v-if="mainBalance" class="wb-metric">
          <span class="small wb-mut2">{{ t('v1.leftLabel', { type: mainBalance.name }) }}</span>
          <span class="wb-metric-v"><b class="display wb-num">{{ fmtDays(mainBalance.left, tag) }}</b><span class="small wb-mut">/ {{ fmtDays(Number(mainBalance.allocated), tag) }} {{ t('home.daysUnit') }}</span></span>
        </div>
        <div class="wb-metric">
          <span class="small wb-mut2">{{ t('v1.pendingLabel') }}</span>
          <span class="wb-metric-v"><b class="display wb-num">{{ pending.length }}</b><span class="small wb-mut">{{ t('v1.pendingDays', { n: fmtDays(pendingDays, tag) }, pendingDays) }}</span></span>
        </div>
        <div class="wb-metric">
          <span class="small wb-mut2">{{ t('home.nextTitle') }}</span>
          <template v-if="nextLeave">
            <b class="h3 wb-kpi-text">{{ nextLeaveWhen }}</b>
            <span class="caption wb-mut">{{ formatPeriod(nextLeave.start_date, nextLeave.end_date, tag) }}</span>
          </template>
          <span v-else class="small wb-mut wb-kpi-text">{{ t('home.noNext') }}</span>
        </div>
        <div class="wb-metric">
          <span class="small wb-mut2">{{ t('v1.teamToday') }}</span>
          <span class="wb-metric-v"><b class="display wb-num">{{ presentToday.n }}</b><span class="small wb-mut">/ {{ presentToday.of }} {{ t('v1.present') }}</span></span>
        </div>
      </div>

      <WbCard
        v-if="isManager"
        :title="t('home.toApprove', { n: toReview.length })"
        :link-label="toReview.length ? t('home.seeAll') : undefined"
        link-to="/approvals"
      >
        <ApprovalQueue v-if="toReview.length" :items="toReview.slice(0, 2)" :is-admin="false" />
        <p v-else class="wb-mut">{{ t('home.nothingToApprove') }}</p>
      </WbCard>

      <div class="wb-split">
        <div class="wb-stack">
          <WbCard :title="t('home.pendingTitle')" :subtitle="isManager ? t('home.managerFlow') : undefined" :link-label="t('home.seeMine')" link-to="/leave-requests">
            <div v-if="pending.length" class="wb-lc-list">
              <LeaveCard v-for="r in pending" :key="r.id" :request="r" :role="profile?.role ?? 'employee'" @open="openDetail" />
            </div>
            <p v-else class="wb-mut">{{ t('home.noPending') }}</p>
          </WbCard>

          <WbCard :title="t('home.teamTitle')" :subtitle="presentToday.of ? t('home.presentToday', { n: presentToday.n, of: presentToday.of }) : undefined">
            <WbPlanningGrid v-if="teamPeople.length > 1" class="wb-home-plan" :days="teamDays" :people="teamPeople" :today="today" :holidays="holidays" dense :presence-label="t('calendar.present')" />
            <ul v-else-if="teamWeek.length" class="wb-list wb-list-dense">
              <li v-for="p in teamWeek" :key="p.id">
                <WbAvatar :name="p.name" :size="28" />
                <span class="wb-grow small"><b>{{ p.name }}</b> <span class="wb-mut2">· {{ p.when }}</span></span>
                <WbTypeBadge :name="p.type" :color="p.color" />
              </li>
            </ul>
            <p v-else class="wb-mut">{{ t('home.teamAllHere') }}</p>
          </WbCard>
        </div>

        <WbCard :title="t('home.balancesTitle')" :link-label="t('v1.details')" link-to="/profile">
          <ul class="wb-bal">
            <li v-for="b in balanceRows" :key="b.id">
              <div class="wb-row-b">
                <WbTypeBadge :name="b.name" :color="b.color" />
                <span class="small wb-num"><b>{{ fmtDays(b.left, tag) }}</b> <span class="wb-mut">/ {{ fmtDays(Number(b.allocated), tag) }} j</span></span>
              </div>
              <div class="wb-bal-bar" role="img" :aria-label="t('home.usedReserved', { used: b.used, reserved: b.reserved })" :style="leaveVars(b.color)">
                <span class="u" :style="{ width: `${pct(b).used}%` }" />
                <span class="r" :style="{ width: `${pct(b).reserved}%` }" />
              </div>
            </li>
          </ul>
          <p class="caption wb-mut wb-bal-lg"><i class="u" /> {{ t('balance.used') }} <i class="r" /> {{ t('balance.reserved') }}</p>
        </WbCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wb-home-h { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
.wb-home-kpis .wb-metric { gap: 2px; }
.wb-kpi-text { margin-top: 4px; }
.wb-lc-list { display: flex; flex-direction: column; gap: var(--space-2); }
.wb-list-dense { gap: var(--space-2); }
.wb-home-plan { margin-top: var(--space-1); }
.wb-bal { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.wb-bal li { display: flex; flex-direction: column; gap: 6px; }
.wb-bal-bar { display: flex; height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.wb-bal-bar .u { background: var(--ls); }
.wb-bal-bar .r { background: repeating-linear-gradient(135deg, var(--ls) 0 3px, transparent 3px 6px); opacity: .7; }
.wb-bal-lg { display: flex; align-items: center; gap: 6px; margin-top: var(--space-3); }
.wb-bal-lg i { display: inline-block; width: 10px; height: 6px; border-radius: 2px; background: var(--ink-3); }
.wb-bal-lg i.r { background: repeating-linear-gradient(135deg, var(--ink-3) 0 2px, transparent 2px 4px); margin-left: 8px; }
</style>
