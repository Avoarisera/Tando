<script setup lang="ts">
definePageMeta({ titleKey: 'nav.dashboard', middleware: 'admin-only', layout: 'private' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { snapshot, isLoading, error, fetchSnapshot } = useDashboard()
const { toReview, requests, fetchAll } = useApprovals()
const { events, fetchEvents } = useCalendar()
const { fetchMembers } = useTeamMembers()
const { balanceAfter } = useApprovals()

const today = todayIso()

async function load() {
  await Promise.all([fetchSnapshot(), fetchAll(), fetchEvents(), fetchMembers()])
}
onMounted(load)

const kpis = computed(() => {
  const s = snapshot.value
  if (!s) return []
  return [
    { label: t('dashboard.headcount'), value: s.total_employees },
    { label: t('dashboard.presentToday'), value: s.present },
    { label: t('dashboard.awayToday'), value: s.on_leave_today, tone: s.on_leave_today ? 'warning' as const : undefined },
    { label: t('dashboard.awayWeek'), value: s.on_leave_week },
  ]
})

const awayToday = computed(() => (snapshot.value?.employees ?? []).filter(e => e.on_leave))

// Absent people per day over the next 14 days (approved leave)
const approved = computed(() => events.value.filter(e => e.status === 'approved'))
const next14 = computed(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)))
const next14Labels = computed(() => next14.value.map(d => fmtDate(d, tag.value, { weekday: 'short', day: 'numeric' })))
const next14Counts = computed(() => next14.value.map(d => approved.value.filter(e => e.startDate <= d && e.endDate >= d).length))
const departures = computed(() => approved.value
  .filter(e => e.startDate > today && e.startDate <= next14.value.at(-1)!)
  .sort((a, b) => a.startDate.localeCompare(b.startDate))
  .map(e => t('dashboard.departure', { who: e.employeeName, date: fmtDate(e.startDate, tag.value, { day: 'numeric', month: 'long' }) })))

// Alerts: requests waiting for more than 3 days, balances that would go negative
const alerts = computed(() => {
  const list: { icon: string, text: string, to: string, tone: 'warning' | 'danger' }[] = []
  const limit = addDays(today, -3)
  for (const r of toReview.value) {
    const sent = r.created_at.slice(0, 10)
    if (sent <= limit) list.push({ icon: 'clock', tone: 'warning', to: '/approvals', text: t('dashboard.alertWaiting', { who: fullName(r.profiles), n: calendarDays(sent, today) - 1 }) })
    const after = balanceAfter(r)
    if (after !== null && after < 0) list.push({ icon: 'triangle-alert', tone: 'danger', to: '/approvals', text: t('dashboard.alertNegative', { who: fullName(r.profiles), type: r.leave_types?.name ?? '', n: after }) })
  }
  return list
})

// Monthly export (CSV) of approved leave overlapping the current month
function exportMonth() {
  const month = today.slice(0, 7)
  const first = `${month}-01`
  const last = monthDays(month).at(-1)!
  const rows = requests.value.filter(r => r.status === 'approved' && r.start_date <= last && r.end_date >= first)
  const esc = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`
  const header = [t('dashboard.csv.person'), t('dashboard.csv.team'), t('dashboard.csv.type'), t('dashboard.csv.start'), t('dashboard.csv.end'), t('dashboard.csv.days')]
  const lines = rows.map(r => [fullName(r.profiles), r.profiles.teams?.name ?? '', r.leave_types?.name ?? '', r.start_date, r.end_date, r.days_count].map(esc).join(';'))
  const blob = new Blob([`﻿${[header.map(esc).join(';'), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `absences-${month}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-row wb-wrap">
      <WbButton variant="secondary" icon="download" @click="exportMonth">{{ t('dashboard.export') }}</WbButton>
      <WbButton variant="secondary" icon="receipt-text" to="/invoices?new=1">{{ t('dashboard.newInvoice') }}</WbButton>
    </div>

    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="isLoading && !snapshot" variant="metric" :count="4" />

    <template v-else-if="snapshot">
      <div class="wb-grid wb-cols-4">
        <WbMetricCard v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :tone="k.tone" />
      </div>

      <div class="wb-split">
        <div class="wb-stack">
          <WbCard :title="t('nav.approvals')" :link-label="toReview.length ? t('dashboard.seeAll', { n: toReview.length }) : undefined" link-to="/approvals">
            <ApprovalQueue v-if="toReview.length" :items="toReview.slice(0, 2)" is-admin />
            <p v-else class="wb-mut">{{ t('home.nothingToApprove') }}</p>
          </WbCard>

          <WbCard :title="t('dashboard.next14')" :subtitle="t('dashboard.next14Hint')">
            <div class="wb-stack-s">
              <WbBarChart :title="t('dashboard.next14Hint')" :labels="next14Labels" :series="[{ label: t('dashboard.away'), data: next14Counts }]" />
              <p v-if="departures.length" class="small wb-mut2">{{ t('dashboard.departures') }} {{ departures.join(', ') }}.</p>
            </div>
          </WbCard>
        </div>

        <div class="wb-stack">
          <WbCard :title="t('calendar.today')">
            <ul v-if="awayToday.length" class="wb-list">
              <li v-for="e in awayToday" :key="e.id">
                <WbAvatar :name="`${e.first_name} ${e.last_name}`" />
                <span class="wb-grow small">
                  {{ e.first_name }} {{ e.last_name }}
                  <template v-if="e.leave_end_date"><br><span class="wb-mut">{{ t('dashboard.backOn', { date: fmtDate(addDays(e.leave_end_date, 1), tag, { weekday: 'long', day: 'numeric', month: 'long' }) }) }}</span></template>
                </span>
                <WbBadge v-if="e.leave_type_name">{{ e.leave_type_name }}</WbBadge>
              </li>
            </ul>
            <p v-else class="wb-mut">{{ t('dashboard.allHere') }}</p>
          </WbCard>

          <WbCard :title="t('dashboard.alerts')">
            <ul v-if="alerts.length" class="wb-list">
              <li v-for="(a, i) in alerts" :key="i" :class="['small', `wb-c-${a.tone}`]">
                <WbIcon :name="a.icon" /><NuxtLink class="wb-grow" :to="a.to">{{ a.text }}</NuxtLink>
              </li>
            </ul>
            <p v-else class="wb-mut">{{ t('dashboard.noAlerts') }}</p>
          </WbCard>

          <WbCard :title="t('nav.velocity')" :link-label="t('dashboard.seeVelocity')" link-to="/velocite">
            <p class="small wb-mut">{{ t('dashboard.velocityHint') }}</p>
          </WbCard>
        </div>
      </div>
    </template>
  </div>
</template>
