<script setup lang="ts">
definePageMeta({ titleKey: 'nav.dashboard', middleware: 'manager-or-admin', layout: 'private' })

/**
 * Dashboard (admin: everyone; manager: « Mon équipe », their team — TND-26).
 * TND-28: digest layout — 3 numbers, « À décider » (requests with their own
 * signals) and « Absences » (today, next departures, 10 working days), a banner
 * only when something is wrong. Tabs: Members (manager), Congés pris (TND-27).
 */
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { snapshot, isLoading, error, fetchSnapshot } = useDashboard()
const { toReview, requests, fetchAll, balanceAfter } = useApprovals()
const { events, fetchEvents } = useCalendar()
const { members, fetchMembers } = useTeamMembers()
const { workspaces, fetchWorkspaces } = useLinearWorkspace()
const { isAdmin, profile } = useCurrentUser()
const myTeam = computed(() => profile.value?.team_id ?? null)
type Tab = 'overview' | 'members' | 'taken'
const tab = ref<Tab>('overview')
const tabs = computed(() => [
  { id: 'overview', label: t('tnd26.overview') },
  ...(isAdmin.value ? [] : [{ id: 'members', label: t('tnd26.members') }]),
  { id: 'taken', label: t('tnd27.tab') },
])
// header title: « Mon équipe » for a manager
usePageHeader(() => (isAdmin.value ? {} : { title: t('nav.myteam') }))

const today = todayIso()

async function load() {
  // Linear is optional: an error there must not break the dashboard
  await Promise.all([fetchSnapshot(), fetchAll(), fetchEvents(), fetchMembers(),
    isAdmin.value ? fetchWorkspaces().catch(() => undefined) : Promise.resolve()])
}
onMounted(load)
// colleagues' leave: everyone for an admin, the own team for a manager
const scoped = computed(() => (isAdmin.value ? events.value : events.value.filter(e => e.teamId === myTeam.value)))
const approved = computed(() => scoped.value.filter(e => e.status === 'approved'))

const todayLabel = computed(() => {
  const x = fmtDate(today, tag.value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return x.charAt(0).toUpperCase() + x.slice(1)
})

// ── 3 numbers ────────────────────────────────────────────────────────────────
const awayToday = computed(() => (snapshot.value?.employees ?? []).filter(e => e.on_leave))
const rate = computed(() => {
  const s = snapshot.value
  return s?.total_employees ? Math.round((s.present / s.total_employees) * 100) : 100
})
const waitingDays = (createdAt: string) => calendarDays(createdAt.slice(0, 10), today) - 1
const lateCount = computed(() => toReview.value.filter(r => waitingDays(r.created_at) > 3).length)

// ── À décider: each request carries its own signals ──────────────────────────
const decide = computed(() => toReview.value.map((r) => {
  const after = balanceAfter(r)
  return { r, waited: waitingDays(r.created_at), short: after !== null && after < 0 }
}).sort((a, b) => Number(b.short) - Number(a.short) || b.waited - a.waited))

// Team alerts only (no repeat of the requests): understaffed teams, Linear sync error
const banners = computed(() => {
  const out: { icon: string, text: string, to: string }[] = []
  const teams = new Map<string, { name: string, size: number }>()
  for (const m of members.value) {
    if (m.role === 'admin' || !m.team_id) continue
    const e = scoped.value.find(x => x.teamId === m.team_id && x.teamName)
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
      const away = new Set(scoped.value.filter(x => x.teamId === id && x.status === 'approved' && x.startDate <= day && x.endDate >= day).map(x => x.userId)).size
      const n = tm.size - away
      if (n / tm.size < 0.5 && (!worst || n < worst.n)) worst = { day, n }
    }
    if (worst) out.push({ icon: 'users', to: `/calendar?view=plan&date=${worst.day}`, text: t('dashboard.alertUnderstaffed', { team: tm.name, n: worst.n, of: tm.size, day: fmtDate(worst.day, tag.value, { weekday: 'short', day: 'numeric', month: 'short' }) }) })
  }
  for (const ws of workspaces.value) if (ws.sync_status === 'error') out.push({ icon: 'triangle-alert', to: '/velocite?all=1', text: t('tnd28.syncError', { name: ws.name }) })
  return out
})

// ── Absences: today, next departures, the next 10 working days ──────────────
const backOn = (end: string) => {
  let d = addDays(end, 1)
  while (isWeekend(d)) d = addDays(d, 1)
  return fmtDate(d, tag.value, { weekday: 'short', day: 'numeric', month: 'short' })
}
const horizon = addDays(today, 14)
const departures = computed(() => approved.value
  .filter(e => e.startDate > today && e.startDate <= horizon)
  .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.employeeName.localeCompare(b.employeeName)))
const workDays = computed(() => {
  const out: string[] = []
  for (let d = today; out.length < 10; d = addDays(d, 1)) if (!isWeekend(d)) out.push(d)
  return out
})
const awayOn = (d: string) => approved.value.filter(e => e.startDate <= d && e.endDate >= d)
const strip = computed(() => workDays.value.map(d => ({ d, who: awayOn(d).map(e => e.employeeName) })))
const stripMax = computed(() => Math.max(1, ...strip.value.map(x => x.who.length)))
const peak = computed(() => strip.value.reduce((a, b) => (b.who.length > a.who.length ? b : a), strip.value[0]!))

// ── Team planning, 2 weeks (fills the free space under « À décider ») ───────
const planDays = computed(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)))
const teamNameOf = (id: string | null) => (id ? scoped.value.find(e => e.teamId === id)?.teamName ?? '' : '') || t('r8a.people.noTeam')
const reviewIds = computed(() => new Set(toReview.value.map(r => r.id)))
const planPeople = computed(() => members.value
  .filter(m => m.role !== 'admin' && (isAdmin.value || m.team_id === myTeam.value))
  .map(m => ({
    id: m.id,
    name: fullName(m),
    group: isAdmin.value ? teamNameOf(m.team_id) : undefined,
    spans: [
      ...approved.value.filter(e => e.userId === m.id).map(e => ({ id: e.id, from: e.startDate, to: e.endDate, label: e.leaveTypeName, color: e.leaveTypeColor })),
      ...toReview.value.filter(r => r.user_id === m.id && r.status !== 'cancel_requested').map(r => ({ id: r.id, from: r.start_date, to: r.end_date, label: `${r.leave_types?.name ?? ''} · ${t('tnd25.toReview')}`, shortLabel: r.leave_types?.name ?? '', color: r.leave_types?.color ?? 'gray', pending: true, review: true })),
    ],
  }))
  .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.name.localeCompare(b.name)))
function openPlan(id: string) {
  const e = approved.value.find(x => x.id === id)
  const r = toReview.value.find(x => x.id === id)
  const date = e?.startDate ?? r?.start_date ?? today
  navigateTo({ path: '/calendar', query: { view: 'plan', date, focus: id } })
}

// ── Actions menu ─────────────────────────────────────────────────────────────
const actionsOpen = ref(false)
function exportMonth() {
  actionsOpen.value = false
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
function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.wb-dash-act')) actionsOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div :class="['wb-page', 'wb-stack', 'wb-dash', { 'is-board': tab === 'overview' }]">
    <div class="wb-row-b wb-wrap wb-dash-bar">
      <p class="h3">{{ todayLabel }}</p>
      <div class="wb-row wb-wrap" style="gap: 12px">
        <WbTabs v-model="tab" class="wb-dash-tabs" :tabs="tabs" :label="isAdmin ? t('nav.dashboard') : t('nav.myteam')" />
        <div class="wb-dash-act">
          <WbButton variant="secondary" size="sm" icon="ellipsis" :aria-expanded="actionsOpen" aria-haspopup="menu" data-action="actions" @click="actionsOpen = !actionsOpen">{{ t('tnd28.actions') }}</WbButton>
          <div v-if="actionsOpen" class="wb-card wb-dash-menu" role="menu">
            <button type="button" role="menuitem" @click="exportMonth"><WbIcon name="download" :size="16" />{{ t('dashboard.export') }}</button>
            <NuxtLink v-if="isAdmin" role="menuitem" to="/invoices?new=1"><WbIcon name="receipt-text" :size="16" />{{ t('dashboard.newInvoice') }}</NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <TeamMembers v-if="tab === 'members'" />
    <LeaveTaken v-else-if="tab === 'taken'" />

    <template v-else>
      <WbErrorState v-if="error" :message="error" @retry="load" />
      <WbSkeleton v-else-if="isLoading && !snapshot" variant="metric" :count="3" />

      <template v-else-if="snapshot">
        <!-- 3 numbers -->
        <section class="wb-card wb-kpis" :aria-label="t('v2.kpis')">
          <div class="wb-kpi">
            <span class="small wb-mut2">{{ t('dashboard.presentToday') }}</span>
            <span class="wb-kpi-v"><b class="display wb-num">{{ snapshot.present }}</b><span class="wb-mut2 wb-num"> / {{ snapshot.total_employees }}</span></span>
            <span class="caption wb-mut">{{ t('v2.presenceRate', { n: rate }) }}</span>
          </div>
          <NuxtLink class="wb-kpi wb-kpi-l" to="/calendar">
            <span class="small wb-mut2">{{ t('dashboard.awayToday') }}</span>
            <span class="wb-kpi-v"><b :class="['display', 'wb-num', { 'wb-c-warning': awayToday.length }]">{{ awayToday.length }}</b>
              <span class="wb-avg wb-kpi-avs"><WbAvatar v-for="e in awayToday.slice(0, 5)" :key="e.id" :name="`${e.first_name} ${e.last_name}`" :size="24" /></span>
            </span>
            <span class="caption wb-mut">{{ t('tnd28.seeCalendar') }}</span>
          </NuxtLink>
          <NuxtLink class="wb-kpi wb-kpi-l" to="/approvals">
            <span class="small wb-mut2">{{ t('nav.approvals') }}</span>
            <span class="wb-kpi-v"><b class="display wb-num">{{ toReview.length }}</b></span>
            <span :class="['caption', lateCount ? 'wb-c-warning' : 'wb-mut']">{{ lateCount ? t('tnd28.late', { n: lateCount }, lateCount) : t('tnd28.noLate') }}</span>
          </NuxtLink>
        </section>

        <div class="wb-dash-grid">
          <div class="wb-dash-col">
          <!-- À décider -->
          <WbCard class="wb-dash-c wb-dash-queue" :title="t('tnd28.decide')" :link-label="toReview.length ? t('dashboard.seeAll', { n: toReview.length }) : undefined" link-to="/approvals">
            <ul v-if="decide.length" class="wb-dash-rows">
              <li v-for="x in decide" :key="x.r.id">
                <NuxtLink :to="{ path: '/calendar', query: { view: 'plan', date: x.r.start_date, focus: x.r.id } }" class="wb-dash-row">
                  <WbAvatar :name="fullName(x.r.profiles)" :size="28" />
                  <span class="wb-grow wb-dash-row-t">
                    <b class="small">{{ fullName(x.r.profiles) }}</b>
                    <span class="caption wb-mut2">{{ x.r.leave_types?.name }} · {{ formatPeriod(x.r.start_date, x.r.end_date, tag) }} · {{ t('leave.workingDays', { n: fmtDays(Number(x.r.days_count), tag) }, Number(x.r.days_count)) }}</span>
                  </span>
                  <WbBadge v-if="x.short" tone="danger" size="sm" icon="wallet">{{ t('tnd23.overFilter') }}</WbBadge>
                  <WbBadge v-if="x.waited > 3" tone="warning" size="sm" icon="clock">{{ t('tnd28.since', { n: x.waited }) }}</WbBadge>
                  <WbBadge v-if="isAdmin && x.r.status === 'manager_approved'" tone="success" size="sm">{{ t('approvals.stepManagerOk') }}</WbBadge>
                  <WbBadge v-else-if="x.r.status === 'cancel_requested'" tone="indigo" size="sm">{{ t('leave.status.cancel_requested') }}</WbBadge>
                </NuxtLink>
              </li>
            </ul>
            <p v-else class="wb-mut">{{ t('home.nothingToApprove') }}</p>
            <ul v-if="banners.length" class="wb-dash-ban">
              <li v-for="(b, i) in banners" :key="i" class="small wb-c-danger"><WbIcon :name="b.icon" :size="16" /><NuxtLink :to="b.to">{{ b.text }}</NuxtLink></li>
            </ul>
          </WbCard>

          <!-- Team planning, 2 weeks -->
          <WbCard class="wb-dash-c wb-dash-plan" :title="t('tnd28.planning')" :subtitle="t('tnd28.planningSub')" link-to="/calendar?view=plan" :link-label="t('nav.calendar')">
            <WbPlanningGrid v-if="planPeople.length" dense interactive :days="planDays" :people="planPeople" :today="today" :presence-label="t('calendar.present')" @open="openPlan" />
            <p v-else class="small wb-mut">{{ t('tnd26.noMember') }}</p>
          </WbCard>
          </div>

          <!-- Absences -->
          <WbCard class="wb-dash-c" :title="t('tnd28.absences')" link-to="/calendar" :link-label="t('nav.calendar')">
            <div class="wb-dash-abs">
              <section>
                <h3 class="caption wb-mut2 wb-dash-h">{{ t('calendar.today') }}</h3>
                <ul v-if="awayToday.length" class="wb-dash-chips">
                  <li v-for="e in awayToday" :key="e.id" :title="e.leave_end_date ? t('dashboard.backOn', { date: backOn(e.leave_end_date) }) : undefined">
                    <WbAvatar :name="`${e.first_name} ${e.last_name}`" :size="22" />
                    <span class="small"><b>{{ e.first_name }}</b><span v-if="e.leave_end_date" class="wb-mut2"> · {{ t('tnd28.back', { date: backOn(e.leave_end_date) }) }}</span></span>
                  </li>
                </ul>
                <p v-else class="small wb-mut">{{ t('dashboard.allHere') }}</p>
              </section>

              <section>
                <h3 class="caption wb-mut2 wb-dash-h">{{ t('tnd28.nextDepartures') }}</h3>
                <ul v-if="departures.length" class="wb-dash-dep">
                  <li v-for="e in departures.slice(0, 5)" :key="e.id">
                    <span class="wb-dash-date caption"><b class="wb-num">{{ fmtDate(e.startDate, tag, { day: 'numeric' }) }}</b> {{ fmtDate(e.startDate, tag, { month: 'short' }) }}</span>
                    <span class="wb-grow small wb-dash-dep-w"><b>{{ e.employeeName }}</b><span class="wb-mut2"> · {{ t('tnd28.back', { date: backOn(e.endDate) }) }}</span></span>
                    <WbTypeBadge :name="e.leaveTypeName" :color="e.leaveTypeColor" />
                  </li>
                  <li v-if="departures.length > 5" class="caption wb-mut2">{{ t('dashboard.andMore', { n: departures.length - 5 }) }}</li>
                </ul>
                <p v-else class="small wb-mut">{{ t('dashboard.noDepartures') }}</p>
              </section>

              <section class="wb-dash-s10">
                <h3 class="caption wb-mut2 wb-dash-h">{{ t('tnd28.next10') }}<span v-if="peak.who.length" class="wb-mut"> · {{ t('tnd28.peak', { n: peak.who.length, day: fmtDate(peak.d, tag, { weekday: 'short', day: 'numeric' }) }) }}</span></h3>
                <ol class="wb-dash-strip" :aria-label="t('tnd28.next10')">
                  <li v-for="x in strip" :key="x.d" :title="x.who.length ? `${fmtDay(x.d, tag)} : ${x.who.join(', ')}` : fmtDay(x.d, tag)">
                    <span class="wb-dash-bar-w"><i :style="{ height: `${(x.who.length / stripMax) * 100}%` }" /></span>
                    <b class="caption2 wb-num">{{ x.who.length || '' }}</b>
                    <span class="caption2 wb-mut2">{{ fmtWeekday(x.d, tag).slice(0, 2) }} {{ +x.d.slice(8) }}</span>
                  </li>
                </ol>
              </section>
            </div>
          </WbCard>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.wb-dash-bar :deep(.wb-btn) { margin: 0; }
.wb-dash-tabs :deep(.wb-tabs) { border-bottom: 0; }
/* Actions menu */
.wb-dash-act { position: relative; }
.wb-dash-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 240px; padding: 6px; display: flex; flex-direction: column; box-shadow: var(--shadow-2); }
.wb-dash-menu > * { display: flex; align-items: center; gap: var(--space-2); padding: 8px 10px; border: 0; border-radius: var(--radius-md); background: none; color: var(--ink); font: inherit; font-size: 14px; text-align: left; text-decoration: none; cursor: pointer; }
.wb-dash-menu > *:hover { background: var(--surface-2); }

/* 3 numbers */
.wb-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; }
.wb-kpi { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3) var(--space-5); color: inherit; text-decoration: none; }
.wb-kpi + .wb-kpi { border-left: 1px solid var(--border); }
.wb-kpi-l:hover { background: var(--surface-2); }
.wb-kpi-v { display: flex; align-items: baseline; gap: var(--space-2); line-height: 1.1; }
.wb-kpi-avs { align-self: center; }

/* 2 columns */
.wb-dash-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: var(--space-4); }
.wb-dash-c { display: flex; flex-direction: column; min-height: 0; }
.wb-dash-col { display: flex; flex-direction: column; gap: var(--space-4); min-height: 0; min-width: 0; }
.wb-dash-c :deep(> div) { min-height: 0; }
.wb-dash-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.wb-dash-rows li + li { border-top: 1px solid var(--border); }
.wb-dash-row { display: flex; align-items: center; gap: var(--space-2); padding: 9px 0; color: inherit; text-decoration: none; }
.wb-dash-row:hover b { color: var(--brand-text); }
.wb-dash-row-t { display: flex; flex-direction: column; min-width: 0; }
.wb-dash-row-t > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-dash-ban { list-style: none; margin: var(--space-3) 0 0; padding: var(--space-3); border-radius: var(--radius-md); background: var(--danger-tint); display: flex; flex-direction: column; gap: 6px; }
.wb-dash-ban li { display: flex; align-items: center; gap: var(--space-2); }
.wb-dash-ban a { color: inherit; }

.wb-dash-abs { display: flex; flex-direction: column; gap: var(--space-4); min-height: 100%; }
/* the 10-day strip takes the free height of the card */
.wb-dash-s10 { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 140px; }
.wb-dash-h { margin: 0 0 var(--space-2); text-transform: uppercase; letter-spacing: .04em; font-weight: 650; }
.wb-dash-chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.wb-dash-chips li { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border-radius: var(--radius-pill); background: var(--surface-2); }
.wb-dash-dep { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.wb-dash-dep li { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.wb-dash-dep-w { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.wb-dash-date { flex: none; width: 54px; padding: 2px 0; border-radius: var(--radius-sm, 6px); background: var(--brand-tint); color: var(--brand-text); text-align: center; }
/* 10 working days: thin bars, rounded tops, count above */
.wb-dash-strip { flex: 1 1 auto; list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 8px; }
.wb-dash-strip li { display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 0; }
.wb-dash-bar-w { flex: 1 1 auto; display: flex; align-items: flex-end; width: 100%; max-width: 34px; min-height: 56px; border-bottom: 1px solid var(--border); }
.wb-dash-bar-w i { display: block; width: 100%; border-radius: 4px 4px 0 0; background: var(--chart-1); }

@container wbapp (min-width: 1024px) {
  /* the board fits one screen; long lists scroll inside their card */
  .wb-dash.is-board { height: calc(100dvh - 56px - var(--space-5) - var(--space-8) - 8px); min-height: 560px; }
  .wb-dash.is-board .wb-dash-grid { flex: 1 1 0; min-height: 0; }
  .wb-dash.is-board .wb-dash-c :deep(> div:last-child) { flex: 1 1 auto; overflow-y: auto; display: flex; flex-direction: column; }
  .wb-dash.is-board .wb-dash-abs { flex: 1 1 auto; }
  /* left column: the queue takes what it needs (half at most), the planning the rest */
  .wb-dash.is-board .wb-dash-queue { flex: 0 1 auto; max-height: 50%; }
  .wb-dash.is-board .wb-dash-plan { flex: 1 1 0; min-height: 200px; }
}
@container wbapp (max-width: 1023px) {
  .wb-dash-grid { grid-template-columns: minmax(0, 1fr); }
}
@container wbapp (max-width: 767px) {
  .wb-kpis { grid-template-columns: minmax(0, 1fr); }
  .wb-kpi + .wb-kpi { border-left: 0; border-top: 1px solid var(--border); }
  .wb-kpi { padding: var(--space-3); }
}
</style>
