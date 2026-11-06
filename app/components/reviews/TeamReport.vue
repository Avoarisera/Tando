<script setup lang="ts">
import type { TeamReportRow } from '~/composables/useReviews'
import type { TemplateContent } from '~/utils/reviews'

/**
 * TND-35 — report by team: participation at each step, then (teams of 3 people
 * or more only, for anonymity) the managers' average per competency and the
 * spread of HR ratings. Printable.
 */
const props = defineProps<{ cycleId: string, content: TemplateContent | null, peers: boolean }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { teamReport } = useReviews()
const rows = ref<TeamReportRow[] | null>(null)
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try { rows.value = await teamReport(props.cycleId) }
  catch (e) { error.value = errorMessage(e) }
}
onMounted(load)
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString(tag.value, { maximumFractionDigits: 1 }))
const comps = computed(() => props.content?.competencies ?? [])
const noRating = computed(() => !!props.content?.no_rating)
const print = () => window.print()
const steps = (r: TeamReportRow) => [
  { key: 'self', label: t('tnd29.step.self'), a: r.self_done, b: r.n },
  { key: 'manager', label: t('tnd29.step.manager'), a: r.manager_done, b: r.with_manager },
  ...(props.peers ? [{ key: 'peers', label: t('tnd29.syn.peersShort'), a: r.peers_answered, b: r.peers_chosen }] : []),
  { key: 'hr', label: t('tnd29.step.hr'), a: r.hr_done, b: r.n },
  { key: 'shared', label: t('tnd29.step.shared'), a: r.shared, b: r.n },
  { key: 'ack', label: t('tnd35.rep.ack'), a: r.acknowledged, b: r.n },
]
</script>

<template>
  <div class="wb-stack wb-rep">
    <div class="wb-row-b wb-wrap wb-no-print">
      <p class="small wb-mut2">{{ t('tnd35.rep.intro') }}</p>
      <WbButton variant="secondary" size="sm" icon="download" @click="print">{{ t('tnd29.hr.pdf') }}</WbButton>
    </div>
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!rows" variant="cards" :count="2" />
    <div v-else-if="!rows.length" class="wb-card"><WbEmptyState art="inbox" :title="t('tnd35.rep.empty')" /></div>
    <section v-for="r in rows" v-else :key="r.team" class="wb-card wb-rep-team" :data-team="r.team">
      <header class="wb-row-b wb-wrap">
        <h3 class="h3">{{ r.team }} <span class="caption wb-mut2">· {{ t('tnd35.rep.people', { n: r.n }, r.n) }}</span></h3>
        <span v-if="!noRating && !r.small" class="small">{{ t('tnd35.rep.hrAvg') }} <b class="wb-num">{{ fmt(r.hr_avg) }}</b> / 4</span>
      </header>
      <ul class="wb-rep-steps">
        <li v-for="s in steps(r)" :key="s.key">
          <span class="caption">{{ s.label }}</span>
          <span class="wb-rep-bar"><i :style="{ width: `${pct(s.a, s.b)}%` }" /></span>
          <b class="caption wb-num">{{ s.a }}/{{ s.b }}</b>
        </li>
      </ul>
      <p v-if="r.small" class="wb-why small" data-small><WbIcon name="eye-off" :size="14" /> {{ t('tnd35.rep.small') }}</p>
      <template v-else-if="!noRating">
        <div v-if="comps.length" class="wb-rep-comps">
          <div v-for="c in comps" :key="c.id" class="wb-rep-c">
            <span class="caption">{{ c.label }}</span>
            <span class="wb-rep-scale"><i :style="{ width: `${r.competencies?.[c.id] ? ((r.competencies[c.id]! - 1) / 3) * 100 : 0}%` }" /></span>
            <b class="caption wb-num">{{ fmt(r.competencies?.[c.id]) }}</b>
          </div>
        </div>
        <p v-if="r.hr_dist" class="caption wb-mut2">{{ t('tnd35.rep.dist') }} : <template v-for="(n, i) in r.hr_dist" :key="i">{{ t(`tnd29.overall.${i + 1}`) }} {{ n }}<template v-if="i < 3"> · </template></template></p>
      </template>
    </section>
    <p class="caption wb-mut">{{ t('tnd35.rep.legend') }}</p>
  </div>
</template>

<style scoped>
.wb-rep-team { padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); break-inside: avoid; }
.wb-rep-team h3, .wb-rep-team p { margin: 0; }
.wb-rep-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px var(--space-4); }
.wb-rep-steps li, .wb-rep-c { display: grid; grid-template-columns: 110px minmax(0, 1fr) 44px; gap: var(--space-2); align-items: center; }
.wb-rep-bar, .wb-rep-scale { height: 8px; border-radius: 6px; background: var(--surface-2, #eef1f6); overflow: hidden; }
.wb-rep-bar i { display: block; height: 100%; background: var(--brand); }
.wb-rep-scale i { display: block; height: 100%; background: var(--chart-3); }
.wb-rep-comps { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px var(--space-4); }
.wb-rep-c { grid-template-columns: 160px minmax(0, 1fr) 36px; }
</style>
