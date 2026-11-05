<script setup lang="ts">
definePageMeta({ titleKey: 'nav.home', layout: 'private' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { profile, isAdmin, isManager, loadProfile } = useCurrentUser()
const { open: openLeave, openDetail } = useLeavePanel()

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
  await Promise.all([fetchMine(), fetchBalances(), fetchEvents(), fetchMembers(), isManager.value ? fetchApprovals() : Promise.resolve()])
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
const presentToday = computed(() => {
  const team = members.value.filter(m => m.team_id && m.team_id === profile.value?.team_id)
  const away = events.value.filter(e => e.status === 'approved' && e.startDate <= today && e.endDate >= today && team.some(m => m.id === e.userId)).length
  return { n: team.length - away, of: team.length }
})

const firstLoad = computed(() => !loaded.value && (isLoading.value || balLoading.value))
const loadError = computed(() => error.value || balError.value)
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-ph" style="margin: 0">
      <div class="wb-ph-t">
        <h2 class="display">{{ t('home.hello', { name: profile?.first_name ?? '' }) }}</h2>
        <p class="wb-mut">{{ dateLabel }}</p>
      </div>
      <div class="wb-ph-a">
        <WbButton size="lg" icon="plus" aria-haspopup="dialog" @click="openLeave()">{{ t('nav.leave') }}</WbButton>
      </div>
    </div>

    <WbErrorState v-if="loadError" :message="loadError" @retry="load" />
    <WbSkeleton v-else-if="firstLoad" />
    <div v-else-if="!balanceRows.length" class="wb-card">
      <WbEmptyState art="sun" :title="t('home.welcomeTitle')">{{ t('home.welcomeText') }}</WbEmptyState>
    </div>

    <WbCard
      v-if="isManager && !loadError && !firstLoad"
      :title="t('home.toApprove', { n: toReview.length })"
      :link-label="toReview.length ? t('home.seeAll') : undefined"
      link-to="/approvals"
    >
      <ApprovalQueue v-if="toReview.length" :items="toReview.slice(0, 2)" :is-admin="false" />
      <p v-else class="wb-mut">{{ t('home.nothingToApprove') }}</p>
    </WbCard>

    <div v-if="!loadError && !firstLoad && balanceRows.length" class="wb-split">
      <div class="wb-stack">
        <WbCard :title="t('home.pendingTitle')" :subtitle="isManager ? t('home.managerFlow') : undefined" :link-label="t('home.seeMine')" link-to="/leave-requests">
          <div v-if="pending.length" class="wb-stack-s">
            <LeaveCard v-for="r in pending" :key="r.id" :request="r" :role="profile?.role ?? 'employee'" @open="openDetail" />
          </div>
          <p v-else class="wb-mut">{{ t('home.noPending') }}</p>
        </WbCard>

        <WbCard :title="t('home.teamTitle')" :subtitle="presentToday.of ? t('home.presentToday', { n: presentToday.n, of: presentToday.of }) : undefined">
          <ul v-if="teamWeek.length" class="wb-list">
            <li v-for="p in teamWeek" :key="p.id">
              <WbAvatar :name="p.name" />
              <span class="wb-grow"><b class="small">{{ p.name }}</b><br><span class="small wb-mut2">{{ p.when }}</span></span>
              <WbTypeBadge :name="p.type" :color="p.color" />
            </li>
          </ul>
          <p v-else class="wb-mut">{{ t('home.teamAllHere') }}</p>
        </WbCard>
      </div>

      <div class="wb-stack">
        <WbCard :title="t('home.balancesTitle')">
          <div class="wb-stack-s">
            <div v-if="mainBalance" class="wb-row" style="gap: 16px">
              <WbProgressRing :value="mainBalance.left" :max="mainBalance.allocated" :label="mainBalance.name" :unit="t('home.daysUnit')" />
              <div>
                <p class="h3">{{ mainBalance.name }}</p>
                <p class="small wb-mut">{{ t('home.usedReserved', { used: mainBalance.used, reserved: mainBalance.reserved }) }}</p>
              </div>
            </div>
            <ul v-if="balanceRows.length > 1" class="wb-list">
              <li v-for="b in balanceRows.slice(1)" :key="b.id">
                <WbTypeBadge :name="b.name" :color="b.color" />
                <span class="wb-grow" />
                <span class="small wb-num">{{ t('home.leftOf', { n: b.left, of: b.allocated }) }}</span>
              </li>
            </ul>
          </div>
        </WbCard>

        <WbCard :title="t('home.nextTitle')">
          <template v-if="nextLeave">
            <p class="h3">{{ nextLeaveWhen }}</p>
            <p class="small wb-mut2">{{ formatPeriod(nextLeave.start_date, nextLeave.end_date, tag) }} · {{ t('leave.days', { n: nextLeave.days_count }, nextLeave.days_count) }}</p>
          </template>
          <p v-else class="wb-mut">{{ t('home.noNext') }}</p>
        </WbCard>
      </div>
    </div>
  </div>
</template>
