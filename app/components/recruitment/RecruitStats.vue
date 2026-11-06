<script setup lang="ts">
import type { PoolRow } from '~/composables/useRecruitment'
import { countBy, funnel, medianDaysToHire, perMonth } from '~/utils/recruit-stats'
import { DEFAULT_STAGES, sourceLabel } from '~/utils/recruitment'

/**
 * TND-30 lot 3 — recruitment statistics: volume, conversion through the stages
 * (funnel: share of candidates reaching each stage), sources, time to hire,
 * decline reasons. All openings or one.
 */
const props = defineProps<{
  apps: readonly PoolRow[]
  events: readonly { application_id: string, kind: string, data: { from?: string, to?: string }, created_at: string }[]
  openings: readonly { id: string, title: string, status: string, stages: { key: string, label: string }[] }[]
}>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const today = todayIso()

const opening = ref('all')
const openingOptions = computed(() => [{ value: 'all', label: t('tnd30.stats.allOpenings') }, ...props.openings.map(o => ({ value: o.id, label: o.title }))])
const apps = computed(() => props.apps.filter(a => opening.value === 'all' || a.opening_id === opening.value))
const stages = computed(() => props.openings.find(o => o.id === opening.value)?.stages ?? DEFAULT_STAGES)

const since90 = Date.now() - 90 * 86_400_000
const kpis = computed(() => ({
  received: apps.value.filter(a => Date.parse(a.created_at) > since90).length,
  active: apps.value.filter(a => a.status === 'active').length,
  hired: apps.value.filter(a => a.status === 'hired').length,
  median: medianDaysToHire(apps.value, props.events),
}))
const steps = computed(() => funnel(apps.value, props.events, stages.value))
const top = computed(() => Math.max(1, steps.value[0]?.n ?? 0))
const pct = (n: number) => Math.round((n / top.value) * 100)
const sources = computed(() => countBy(apps.value, a => a.source).map(s => ({ ...s, label: sourceLabel(s.label) })))
const sourceMax = computed(() => Math.max(1, ...sources.value.map(s => s.n)))
const reasons = computed(() => countBy(apps.value.filter(a => a.status === 'rejected'), a => a.rejection_reason?.toLowerCase(), 5))
const months = computed(() => perMonth(apps.value, today, 6))
const monthLabels = computed(() => months.value.map(m => new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString(tag.value, { month: 'short' })))
</script>

<template>
  <div class="wb-stack wb-rs">
    <div class="wb-row wb-wrap wb-rs-f">
      <WbSelect v-model="opening" :options="openingOptions" :aria-label="t('tnd30.stats.opening')" />
    </div>

    <section class="wb-card wb-rs-kpis" :aria-label="t('tnd30.stats.title')">
      <div><span class="small wb-mut2">{{ t('tnd30.stats.received') }}</span><b class="display wb-num">{{ kpis.received }}</b><span class="caption wb-mut">{{ t('tnd30.stats.last90') }}</span></div>
      <div><span class="small wb-mut2">{{ t('tnd30.stats.active') }}</span><b class="display wb-num">{{ kpis.active }}</b><span class="caption wb-mut">{{ t('tnd30.stats.activeSub') }}</span></div>
      <div><span class="small wb-mut2">{{ t('tnd30.stats.hired') }}</span><b class="display wb-num">{{ kpis.hired }}</b><span class="caption wb-mut">{{ t('tnd30.stats.hiredSub') }}</span></div>
      <div><span class="small wb-mut2">{{ t('tnd30.stats.timeToHire') }}</span><b class="display wb-num">{{ kpis.median === null ? '—' : t('tnd30.stats.days', { n: kpis.median }, kpis.median) }}</b><span class="caption wb-mut">{{ t('tnd30.stats.median') }}</span></div>
    </section>

    <div class="wb-rs-grid">
      <WbCard :title="t('tnd30.stats.funnel')" :subtitle="t('tnd30.stats.funnelSub')">
        <p v-if="!apps.length" class="small wb-mut">{{ t('tnd30.stats.empty') }}</p>
        <ol v-else class="wb-rs-funnel">
          <li v-for="(s, i) in steps" :key="s.key">
            <span class="small wb-rs-l">{{ s.label }}</span>
            <span class="wb-rs-track"><i :style="{ width: `${pct(s.n)}%` }" /></span>
            <b class="small wb-num">{{ s.n }}</b>
            <span class="caption wb-mut2 wb-num wb-rs-p">{{ i === 0 ? '' : `${pct(s.n)} %` }}</span>
          </li>
        </ol>
      </WbCard>

      <div class="wb-stack">
        <WbCard :title="t('tnd30.stats.perMonth')">
          <WbBarChart :title="t('tnd30.stats.perMonth')" :labels="monthLabels" :series="[{ label: t('tnd30.stats.received'), data: months.map(m => m.n) }]" :height="160" />
        </WbCard>
        <WbCard :title="t('tnd30.stats.sources')" :subtitle="t('tnd30.stats.sourcesSub')">
          <p v-if="!sources.length" class="small wb-mut">{{ t('tnd30.stats.empty') }}</p>
          <ul v-else class="wb-rs-src">
            <li v-for="s in sources" :key="s.label">
              <span class="small">{{ s.label }}</span>
              <span class="wb-rs-track"><i :style="{ width: `${(s.n / sourceMax) * 100}%` }" /></span>
              <b class="small wb-num">{{ s.n }}</b>
            </li>
          </ul>
        </WbCard>
        <WbCard :title="t('tnd30.stats.reasons')">
          <p v-if="!reasons.length" class="small wb-mut">{{ t('tnd30.stats.noReasons') }}</p>
          <ul v-else class="wb-list">
            <li v-for="r in reasons" :key="r.label" class="small"><span class="wb-grow">{{ r.label.charAt(0).toUpperCase() + r.label.slice(1) }}</span><b class="wb-num">{{ r.n }}</b></li>
          </ul>
        </WbCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wb-rs-f :deep(.wb-field) { flex: 0 0 auto; min-width: 260px; }
.wb-rs-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; }
.wb-rs-kpis > div { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3) var(--space-5); }
.wb-rs-kpis > div + div { border-left: 1px solid var(--border); }
.wb-rs-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: var(--space-4); align-items: start; }
.wb-rs-funnel, .wb-rs-src { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.wb-rs-funnel li { display: grid; grid-template-columns: 150px minmax(0, 1fr) 36px 44px; gap: var(--space-2); align-items: center; }
.wb-rs-src li { display: grid; grid-template-columns: 150px minmax(0, 1fr) 36px; gap: var(--space-2); align-items: center; }
.wb-rs-l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-rs-track { height: 14px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.wb-rs-track i { display: block; height: 100%; border-radius: 0 4px 4px 0; background: var(--chart-1); min-width: 2px; }
.wb-rs-p { text-align: right; }
@container wbapp (max-width: 1023px) {
  .wb-rs-grid { grid-template-columns: minmax(0, 1fr); }
  .wb-rs-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .wb-rs-kpis > div:nth-child(3) { border-left: 0; }
  .wb-rs-kpis > div:nth-child(n + 3) { border-top: 1px solid var(--border); }
}
@container wbapp (max-width: 767px) {
  .wb-rs-funnel li { grid-template-columns: 100px minmax(0, 1fr) 30px 40px; }
  .wb-rs-src li { grid-template-columns: 100px minmax(0, 1fr) 30px; }
}
</style>
