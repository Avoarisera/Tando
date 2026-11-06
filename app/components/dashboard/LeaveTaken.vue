<script setup lang="ts">
import { leaveStats, littleLeave, type StatRequest } from '~/utils/leave-stats'

/**
 * TND-27 — who took how much leave this year. Admin: everyone (team filter);
 * manager: their team (RLS). Sick leave is shown to managers as « Autre absence ».
 * Ranking = horizontal stacked bars (one segment per leave type, planned days
 * hatched); seasonality = stacked columns per month.
 */
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const supabase = useSupabaseClient()
const { isAdmin, profile } = useCurrentUser()
const { requests, fetchAll } = useApprovals()
const { members, fetchMembers } = useTeamMembers()
const { teams, fetchTeams } = useTeams()
const { fetchCountry, holidaysOf } = useHolidays()

const today = todayIso()
const thisYear = Number(today.slice(0, 4))
const year = ref(String(thisYear))
const yearOptions = [thisYear - 1, thisYear].map(y => ({ value: String(y), label: String(y) }))
const teamFilter = ref('all')
const teamOptions = computed(() => [{ value: 'all', label: t('calendar.allTeams') }, ...teams.value.map(x => ({ value: x.id, label: x.name }))])

interface Bal { user_id: string, year: number, allocated_days: number, leave_types: { name: string, tracks_balance: boolean | null } | null }
const balances = ref<Bal[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
async function load() {
  isLoading.value = true
  error.value = null
  try {
    const [, , , , bals] = await Promise.all([
      fetchAll(), fetchMembers(), isAdmin.value ? fetchTeams() : Promise.resolve(), fetchCountry('FR'),
      supabase.from('leave_balances').select('user_id, year, allocated_days, leave_types (name, tracks_balance)').in('year', [thisYear - 1, thisYear]),
    ])
    if (bals.error) throw bals.error
    balances.value = (bals.data ?? []) as unknown as Bal[]
  }
  catch (e) { error.value = errorMessage(e) }
  finally { isLoading.value = false }
}
onMounted(load)

// sensitive: a manager sees sick leave as a generic absence
const OTHER = '#5a6475'
const isSick = (name: string, tracks: boolean | null | undefined) => tracks === false && /maladie|sick/i.test(name)
const asStat = computed<StatRequest[]>(() => requests.value.map((r) => {
  const name = r.leave_types?.name ?? ''
  const hide = !isAdmin.value && isSick(name, r.leave_types?.tracks_balance)
  return { user_id: r.user_id, start_date: r.start_date, end_date: r.end_date, start_half: r.start_half, end_half: r.end_half, status: r.status,
    type: hide ? t('tnd27.otherAbsence') : name, color: hide ? OTHER : (r.leave_types?.color ?? OTHER) }
}))
const stats = computed(() => leaveStats(asStat.value, Number(year.value), today, holidaysOf('FR')))

const people = computed(() => members.value
  .filter(m => m.role !== 'admin')
  .filter(m => isAdmin.value ? (teamFilter.value === 'all' || m.team_id === teamFilter.value) : m.team_id === profile.value?.team_id))

/** paid-leave allowance: the tracked type with the largest allocation that year */
function allowanceOf(id: string): number | null {
  const own = balances.value.filter(b => b.user_id === id && b.year === Number(year.value) && b.leave_types?.tracks_balance !== false)
  return own.length ? Math.max(...own.map(b => Number(b.allocated_days))) : null
}
const rows = computed(() => people.value.map((m) => {
  const s = stats.value.people.get(m.id)
  return { m, s, taken: s?.taken ?? 0, planned: s?.planned ?? 0, allowance: allowanceOf(m.id), little: littleLeave(s, allowanceOf(m.id), today, Number(year.value)) }
}).sort((a, b) => b.taken - a.taken || b.planned - a.planned || fullName(a.m).localeCompare(fullName(b.m))))
const max = computed(() => Math.max(1, ...rows.value.map(r => r.taken + r.planned)))
// top 10, the rest on demand
const TOP = 10
const showAll = ref(false)
const shown = computed(() => (showAll.value ? rows.value : rows.value.slice(0, TOP)))
const types = computed(() => stats.value.types)

// headline numbers
const avg = computed(() => (rows.value.length ? rows.value.reduce((n, r) => n + r.taken, 0) / rows.value.length : 0))
const usage = computed(() => {
  const withA = rows.value.filter(r => r.allowance)
  const a = withA.reduce((n, r) => n + (r.allowance ?? 0), 0)
  return a ? Math.round((withA.reduce((n, r) => n + r.taken, 0) / a) * 100) : null
})
const littleCount = computed(() => rows.value.filter(r => r.little).length)
const fmt = (n: number) => fmtDays(n, tag.value)

// per month, stacked by type
const monthLabels = computed(() => Array.from({ length: 12 }, (_, i) => new Date(2026, i, 1).toLocaleDateString(tag.value, { month: 'short' })))
const monthSeries = computed(() => {
  const ids = new Set(people.value.map(p => p.id))
  // recompute on the shown people only (team filter)
  const s = leaveStats(asStat.value.filter(r => ids.has(r.user_id)), Number(year.value), today, holidaysOf('FR'))
  return s.types.map(ty => ({ label: ty.name, color: ty.color, data: s.months.map(m => m[ty.name] ?? 0) }))
})

const segTitle = (name: string, ty: string, n: number, planned: boolean) => `${name} · ${ty} · ${t('leave.workingDays', { n: fmt(n) }, n)}${planned ? ` · ${t('tnd27.planned')}` : ''}`
</script>

<template>
  <div class="wb-stack wb-lt">
    <div class="wb-row wb-wrap wb-lt-f">
      <WbSelect v-model="year" :options="yearOptions" :aria-label="t('calendar.pickYear')" />
      <WbSelect v-if="isAdmin" v-model="teamFilter" :options="teamOptions" :aria-label="t('calendar.team')" />
    </div>

    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="isLoading && !rows.length" variant="metric" :count="3" />
    <template v-else>
      <section class="wb-card wb-lt-kpis" :aria-label="t('tnd27.title')">
        <div><span class="small wb-mut2">{{ t('tnd27.avg') }}</span><b class="display wb-num">{{ fmt(avg) }}</b><span class="caption wb-mut">{{ t('tnd27.avgSub') }}</span></div>
        <div><span class="small wb-mut2">{{ t('tnd27.usage') }}</span><b class="display wb-num">{{ usage === null ? '—' : `${usage} %` }}</b><span class="caption wb-mut">{{ t('tnd27.usageSub') }}</span></div>
        <div><span class="small wb-mut2">{{ t('tnd27.little') }}</span><b :class="['display', 'wb-num', { 'wb-c-warning': littleCount }]">{{ littleCount }}</b><span class="caption wb-mut">{{ t('tnd27.littleSub') }}</span></div>
      </section>

      <div class="wb-lt-grid">
        <WbCard :title="t('tnd27.byPerson')" :subtitle="t('tnd27.byPersonSub', { year })">
          <ul class="wb-leg caption wb-lt-leg">
            <li v-for="ty in types" :key="ty.name"><i class="wb-lt-sw" :style="{ background: ty.color }" />{{ ty.name }}</li>
            <li><i class="wb-lt-sw is-plan" />{{ t('tnd27.planned') }}</li>
          </ul>
          <p v-if="!rows.length" class="wb-mut">{{ t('tnd26.noMember') }}</p>
          <ol v-else class="wb-lt-rows">
            <li v-for="r in shown" :key="r.m.id" :data-id="r.m.id">
              <span class="wb-lt-who"><WbAvatar :name="fullName(r.m)" :size="24" /><span class="small">{{ fullName(r.m) }}</span></span>
              <span class="wb-lt-track" role="img" :aria-label="`${fullName(r.m)} : ${t('leave.workingDays', { n: fmt(r.taken) }, r.taken)}${r.planned ? `, +${fmt(r.planned)} ${t('tnd27.planned')}` : ''}`">
                <template v-for="ty in types" :key="ty.name">
                  <i v-if="r.s?.byType[ty.name]?.taken" class="wb-lt-seg" :style="{ width: `${(r.s.byType[ty.name]!.taken / max) * 100}%`, background: ty.color }" :title="segTitle(fullName(r.m), ty.name, r.s.byType[ty.name]!.taken, false)" />
                </template>
                <template v-for="ty in types" :key="`p-${ty.name}`">
                  <i v-if="r.s?.byType[ty.name]?.planned" class="wb-lt-seg is-plan" :style="{ width: `${(r.s.byType[ty.name]!.planned / max) * 100}%`, '--c': ty.color }" :title="segTitle(fullName(r.m), ty.name, r.s.byType[ty.name]!.planned, true)" />
                </template>
              </span>
              <span class="wb-lt-n small wb-num"><b>{{ fmt(r.taken) }}</b><span v-if="r.planned" class="wb-mut2"> +{{ fmt(r.planned) }}</span><span v-if="r.allowance" class="caption wb-mut"> / {{ fmt(r.allowance) }}</span></span>
              <WbBadge v-if="r.little" tone="warning" size="sm" icon="triangle-alert" :title="t('tnd27.littleHint')">{{ t('tnd27.littleBadge') }}</WbBadge>
            </li>
          </ol>
          <div v-if="rows.length > TOP" class="wb-lt-more">
            <WbButton variant="ghost" size="sm" :icon="showAll ? 'chevron-right' : 'chevron-down'" :aria-expanded="showAll" data-action="more" @click="showAll = !showAll">
              {{ showAll ? t('tnd27.showLess') : t('tnd27.showMore', { n: rows.length - TOP }, rows.length - TOP) }}
            </WbButton>
          </div>
          <!-- the numbers, for screen readers -->
          <div class="wb-sr"><table>
            <caption>{{ t('tnd27.byPerson') }}</caption>
            <thead><tr><th>{{ t('tnd26.person') }}</th><th v-for="ty in types" :key="ty.name">{{ ty.name }}</th><th>{{ t('tnd27.planned') }}</th></tr></thead>
            <tbody><tr v-for="r in rows" :key="r.m.id"><td>{{ fullName(r.m) }}</td><td v-for="ty in types" :key="ty.name">{{ fmt(r.s?.byType[ty.name]?.taken ?? 0) }}</td><td>{{ fmt(r.planned) }}</td></tr></tbody>
          </table></div>
        </WbCard>

        <WbCard :title="t('tnd27.byMonth')" :subtitle="t('tnd27.byMonthSub')">
          <WbBarChart :title="t('tnd27.byMonth')" :labels="monthLabels" :series="monthSeries" stacked :height="260" />
        </WbCard>
      </div>
      <p class="caption wb-mut">{{ isAdmin ? t('tnd27.hintAdmin') : t('tnd27.hintManager') }}</p>
    </template>
  </div>
</template>

<style scoped>
.wb-lt-f :deep(.wb-field) { flex: 0 0 auto; }
.wb-lt-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; }
.wb-lt-kpis > div { display: flex; flex-direction: column; gap: 2px; padding: var(--space-4) var(--space-5); }
.wb-lt-kpis > div + div { border-left: 1px solid var(--border); }
.wb-lt-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: var(--space-4); align-items: start; }
.wb-lt-leg { margin: 0 0 var(--space-3); display: flex; flex-wrap: wrap; gap: 6px var(--space-3); list-style: none; padding: 0; }
.wb-lt-leg li { display: inline-flex; align-items: center; gap: 6px; }
.wb-lt-sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.wb-lt-sw.is-plan, .wb-lt-seg.is-plan { background: repeating-linear-gradient(135deg, var(--c, var(--ink-3)) 0 3px, transparent 3px 6px); box-shadow: inset 0 0 0 1px var(--c, var(--ink-3)); }
.wb-lt-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.wb-lt-rows li { display: grid; grid-template-columns: 170px minmax(0, 1fr) 96px auto; align-items: center; gap: var(--space-3); min-height: 32px; }
.wb-lt-who { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.wb-lt-who span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 2 px surface gap between segments, rounded data end */
.wb-lt-track { display: flex; gap: 2px; height: 14px; align-items: stretch; }
.wb-lt-seg { display: block; min-width: 3px; border-radius: 2px; }
.wb-lt-seg:last-child { border-radius: 2px 4px 4px 2px; }
.wb-lt-n { text-align: right; white-space: nowrap; }
.wb-lt-more { display: flex; justify-content: center; margin-top: var(--space-3); padding-top: var(--space-2); border-top: 1px solid var(--border); }
@container wbapp (max-width: 1023px) {
  .wb-lt-grid { grid-template-columns: minmax(0, 1fr); }
}
@container wbapp (max-width: 767px) {
  .wb-lt-kpis { grid-template-columns: minmax(0, 1fr); }
  .wb-lt-kpis > div + div { border-left: 0; border-top: 1px solid var(--border); }
  .wb-lt-rows li { grid-template-columns: minmax(0, 1fr) auto; }
  .wb-lt-track { grid-column: 1 / -1; order: 3; }
}
</style>
