<script setup lang="ts">
definePageMeta({ titleKey: 'nav.dashboard', middleware: 'admin-only', layout: 'private' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { snapshot, isLoading, error, fetchSnapshot } = useDashboard()
const { toReview, requests, fetchAll } = useApprovals()
const { events, fetchEvents } = useCalendar()
const { members, fetchMembers } = useTeamMembers()
const { balanceAfter } = useApprovals()
const { workspaces, fetchWorkspaces } = useLinearWorkspace()

const today = todayIso()

async function load() {
  // Vélocité is optional: a Linear error must not break the dashboard
  await Promise.all([fetchSnapshot(), fetchAll(), fetchEvents(), fetchMembers(), fetchWorkspaces().catch(() => undefined)])
}

// Vélocité card: one line per connected Linear workspace
const wsRows = computed(() => workspaces.value.map((ws) => {
  const status = ws.sync_status === 'running'
    ? { tone: 'info' as const, label: t('velocityA.status.running') }
    : ws.sync_status === 'error'
      ? { tone: 'danger' as const, label: t('velocityA.status.error') }
      : ws.last_synced_at
        ? { tone: 'success' as const, label: t('velocityA.status.ok') }
        : { tone: 'neutral' as const, label: t('velocityA.status.idle') }
  const when = ws.last_synced_at
    ? new Intl.DateTimeFormat(tag.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ws.last_synced_at))
    : t('velocityA.never')
  const teams = ws.selected_teams?.length ? ws.selected_teams.map(x => x.name).join(', ') : t('velocityA.allTeams')
  return { id: ws.id, name: ws.name, status, when, teams, tickets: ws.sync_issues_done }
}))
onMounted(load)

const kpis = computed(() => {
  const s = snapshot.value
  if (!s) return []
  const rate = s.total_employees ? Math.round((s.present / s.total_employees) * 100) : 100
  return [
    { label: t('dashboard.headcount'), value: s.total_employees, icon: 'users', sub: t('v2.headcountSub') },
    { label: t('dashboard.presentToday'), value: s.present, icon: 'circle-check', sub: t('v2.presenceRate', { n: rate }) },
    { label: t('dashboard.awayToday'), value: s.on_leave_today, icon: 'tree-palm', tone: s.on_leave_today ? 'warning' as const : undefined, sub: t('v2.awayTodaySub') },
    { label: t('dashboard.awayWeek'), value: s.on_leave_week, icon: 'calendar-days', sub: t('v2.awayWeekSub') },
  ]
})
const todayLabel = computed(() => {
  const x = fmtDate(today, tag.value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return x.charAt(0).toUpperCase() + x.slice(1)
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
// Teams under half of their headcount on a working day of the next 14 days
// (approved leave only); one alert per team, on its worst day
const understaffed = computed(() => {
  const out: { icon: string, text: string, to: string, tone: 'warning' | 'danger' }[] = []
  const teams = new Map<string, { name: string, size: number }>()
  for (const m of members.value) {
    if (m.role === 'admin' || !m.team_id) continue
    const e = events.value.find(x => x.teamId === m.team_id && x.teamName)
    const cur = teams.get(m.team_id) ?? { name: e?.teamName ?? '', size: 0 }
    cur.size++
    teams.set(m.team_id, cur)
  }
  for (const [id, tm] of teams) {
    if (tm.size < 2 || !tm.name) continue
    let worst: { day: string, n: number } | null = null
    for (let i = 0; i < 14; i++) {
      const day = addDays(today, i)
      if (isWeekend(day)) continue
      const away = new Set(events.value.filter(x => x.teamId === id && x.status === 'approved' && x.startDate <= day && x.endDate >= day).map(x => x.userId)).size
      const n = tm.size - away
      if (n / tm.size < 0.5 && (!worst || n < worst.n)) worst = { day, n }
    }
    if (worst) out.push({ icon: 'users', tone: 'danger', to: '/calendar', text: t('dashboard.alertUnderstaffed', { team: tm.name, n: worst.n, of: tm.size, day: fmtDate(worst.day, tag.value, { weekday: 'short', day: 'numeric', month: 'short' }) }) })
  }
  return out
})

const alerts = computed(() => {
  const list: { icon: string, text: string, to: string, tone: 'warning' | 'danger' }[] = []
  const limit = addDays(today, -3)
  for (const r of toReview.value) {
    const sent = r.created_at.slice(0, 10)
    if (sent <= limit) list.push({ icon: 'clock', tone: 'warning', to: '/approvals', text: t('dashboard.alertWaiting', { who: fullName(r.profiles), n: calendarDays(sent, today) - 1 }) })
    const after = balanceAfter(r)
    if (after !== null && after < 0) list.push({ icon: 'triangle-alert', tone: 'danger', to: '/approvals', text: t('dashboard.alertNegative', { who: fullName(r.profiles), type: r.leave_types?.name ?? '', n: after }) })
  }
  list.push(...understaffed.value)
  return list
})

// Monthly export (CSV) of approved leave overlapping the current month
function exportMonth() {
  const month = today.slice(0, 7)
  const first = `${month}-01`
  const last = monthDays(month).at(-1)!
  const rows = requests.value.filter(r => r.status === 'approved' && r.start_date <= last && r.end_date >= first)
  const esc = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`
  const header = [t('dashboard.csv.person'), t('dashboard.csv.team'), t('dashboard.csv.type'), t('dashboard.csv.start'), t('dashboard.csv.end'), t('dashboard.csv.days'), t('tnd23.badge')]
  const lines = rows.map(r => [fullName(r.profiles), r.profiles.teams?.name ?? '', r.leave_types?.name ?? '', r.start_date, r.end_date, r.days_count, r.is_exception ? (r.exception_reason ?? t('tnd23.badge')) : ''].map(esc).join(';'))
  const blob = new Blob([`﻿${[header.map(esc).join(';'), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `absences-${month}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="wb-page wb-stack wb-dash">
    <div class="wb-row-b wb-wrap wb-dash-bar">
      <div>
        <p class="h3">{{ todayLabel }}</p>
        <p class="small wb-mut2">{{ t('v2.toReviewCount', { n: toReview.length }, toReview.length) }}</p>
      </div>
      <div class="wb-row wb-wrap" style="gap: 8px">
        <WbButton variant="secondary" size="sm" icon="download" @click="exportMonth">{{ t('dashboard.export') }}</WbButton>
        <WbButton variant="secondary" size="sm" icon="receipt-text" to="/invoices?new=1">{{ t('dashboard.newInvoice') }}</WbButton>
      </div>
    </div>

    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="isLoading && !snapshot" variant="metric" :count="4" />

    <template v-else-if="snapshot">
      <!-- KPI strip: one card split in four cells -->
      <section class="wb-card wb-kpis" :aria-label="t('v2.kpis')">
        <div v-for="k in kpis" :key="k.label" class="wb-metric wb-kpi">
          <span class="wb-kpi-i" aria-hidden="true"><WbIcon :name="k.icon" :size="18" /></span>
          <div>
            <span class="small wb-mut2">{{ k.label }}</span>
            <div class="wb-kpi-v"><span :class="['display', 'wb-num', k.tone && `wb-c-${k.tone}`]">{{ k.value }}</span></div>
            <span class="caption wb-mut">{{ k.sub }}</span>
          </div>
        </div>
      </section>

      <div class="wb-split">
        <div class="wb-stack">
          <WbCard :title="t('nav.approvals')" :link-label="toReview.length ? t('dashboard.seeAll', { n: toReview.length }) : undefined" link-to="/approvals">
            <ApprovalQueue v-if="toReview.length" :items="toReview.slice(0, 3)" is-admin />
            <p v-else class="wb-mut">{{ t('home.nothingToApprove') }}</p>
          </WbCard>

          <WbCard :title="t('dashboard.next14')" :subtitle="t('dashboard.next14Hint')">
            <div class="wb-stack-s wb-dash-chart">
              <WbBarChart :title="t('dashboard.next14Hint')" :labels="next14Labels" :series="[{ label: t('dashboard.away'), data: next14Counts }]" :height="'max(240px, calc(100dvh - 540px))'" />
              <p v-if="departures.length" class="small wb-mut2">{{ t('dashboard.departures') }} {{ departures.join(', ') }}.</p>
            </div>
          </WbCard>
        </div>

        <div class="wb-stack">
          <WbCard :title="t('calendar.today')">
            <ul v-if="awayToday.length" class="wb-list wb-dash-list">
              <li v-for="e in awayToday" :key="e.id">
                <WbAvatar :name="`${e.first_name} ${e.last_name}`" :size="28" />
                <span class="wb-grow small">
                  <b>{{ e.first_name }} {{ e.last_name }}</b>
                  <template v-if="e.leave_end_date"><br><span class="wb-mut">{{ t('dashboard.backOn', { date: fmtDate(addDays(e.leave_end_date, 1), tag, { weekday: 'short', day: 'numeric', month: 'short' }) }) }}</span></template>
                </span>
                <WbBadge v-if="e.leave_type_name" size="sm">{{ e.leave_type_name }}</WbBadge>
              </li>
            </ul>
            <p v-else class="small wb-mut">{{ t('dashboard.allHere') }}</p>
          </WbCard>

          <WbCard :title="t('dashboard.alerts')">
            <ul v-if="alerts.length" class="wb-list wb-dash-list">
              <li v-for="(a, i) in alerts" :key="i" :class="['small', `wb-c-${a.tone}`]">
                <WbIcon :name="a.icon" :size="16" /><NuxtLink class="wb-grow" :to="a.to">{{ a.text }}</NuxtLink>
              </li>
            </ul>
            <p v-else class="small wb-mut">{{ t('dashboard.noAlerts') }}</p>
          </WbCard>

          <WbCard :title="t('nav.velocity')" :link-label="t('dashboard.seeVelocity')" link-to="/velocite">
            <ul v-if="wsRows.length" class="wb-list wb-dash-list wb-dash-ws">
              <li v-for="w in wsRows" :key="w.id">
                <NuxtLink class="wb-grow wb-dash-ws-l" :to="`/velocite/workspaces/${w.id}`">
                  <b class="small">{{ w.name }}</b>
                  <span class="caption wb-mut2">{{ w.teams }}</span>
                  <span class="caption wb-mut wb-num">{{ t('velocityA.lastSync', { date: w.when }) }}<template v-if="w.tickets"> · {{ t('velocityA.tickets', { n: w.tickets }, w.tickets) }}</template></span>
                </NuxtLink>
                <WbBadge :tone="w.status.tone" size="sm">{{ w.status.label }}</WbBadge>
              </li>
            </ul>
            <div v-else class="wb-stack-s">
              <p class="small wb-mut">{{ t('velocityA.emptyText') }}</p>
              <div><WbButton variant="secondary" size="sm" icon="plus" to="/velocite">{{ t('velocityA.connect') }}</WbButton></div>
            </div>
          </WbCard>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wb-dash-bar :deep(.wb-btn) { margin: 0; }
.wb-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; }
.wb-kpi { border: 0; border-radius: 0; box-shadow: none; flex-direction: row; gap: var(--space-3); align-items: flex-start; padding: var(--space-4) var(--space-5); }
.wb-kpi + .wb-kpi { border-left: 1px solid var(--border); }
.wb-kpi-i { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border-radius: var(--radius-md); background: var(--brand-tint); color: var(--brand-text); }
.wb-kpi-v { line-height: 1; margin: 2px 0; }
.wb-dash-list li { padding-block: 6px; }
.wb-dash-ws li + li { border-top: 1px solid var(--border); }
.wb-dash-ws-l { display: flex; flex-direction: column; gap: 2px; min-width: 0; color: inherit; text-decoration: none; }
.wb-dash-ws-l:hover b { color: var(--brand-text); }
/* Chart: clear space under the card subtitle */
.wb-dash-chart { padding-top: var(--space-2); }
@container wbapp (max-width: 1023px) {
  .wb-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .wb-kpi:nth-child(3) { border-left: 0; }
  .wb-kpi:nth-child(n + 3) { border-top: 1px solid var(--border); }
}
@container wbapp (max-width: 767px) {
  .wb-kpi { padding: var(--space-3); }
  .wb-kpi-i { display: none; }
}
</style>
