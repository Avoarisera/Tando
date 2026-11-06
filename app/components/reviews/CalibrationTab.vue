<script setup lang="ts">
import type { CalibrationRow } from '~/composables/useReviews'

/**
 * TND-35 — harmonisation: per file the averages (self, manager, colleagues from
 * 3 answers) next to the HR rating, the spread of ratings overall and by
 * manager; adjusting a rating before release requires a written reason (kept).
 */
const props = defineProps<{ cycleId: string, editable: boolean }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const { cycleCalibration, calibrate, calibrationLog } = useReviews()

const rows = ref<CalibrationRow[] | null>(null)
const log = ref<Awaited<ReturnType<typeof calibrationLog>>>([])
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try {
    rows.value = await cycleCalibration(props.cycleId)
    log.value = await calibrationLog(rows.value.filter(r => r.adjustments).map(r => r.packet_id))
  }
  catch (e) { error.value = errorMessage(e) }
}
onMounted(load)

const fmt = (n: number | null) => (n === null ? '—' : Number(n).toLocaleString(tag.value, { maximumFractionDigits: 1 }))
const gap = (r: CalibrationRow) => r.hr_rating !== null && r.manager_avg !== null && Math.abs(r.hr_rating - Number(r.manager_avg)) >= 1
const dist = (list: CalibrationRow[]) => [1, 2, 3, 4].map(n => list.filter(r => r.hr_rating === n).length)
const overall = computed(() => dist(rows.value ?? []))
const rated = computed(() => (rows.value ?? []).filter(r => r.hr_rating !== null).length)
const byManager = computed(() => {
  const map = new Map<string, CalibrationRow[]>()
  for (const r of rows.value ?? []) map.set(r.manager_name ?? t('tnd29.cycle.noManager'), [...(map.get(r.manager_name ?? t('tnd29.cycle.noManager')) ?? []), r])
  return [...map].map(([name, list]) => ({ name, n: list.length, d: dist(list), avg: list.filter(r => r.hr_rating).length ? Math.round(list.reduce((a, r) => a + (r.hr_rating ?? 0), 0) / list.filter(r => r.hr_rating).length * 10) / 10 : null }))
})
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)

// adjust
const editing = ref<CalibrationRow | null>(null)
const form = reactive({ rating: 0, reason: '' })
const formError = ref<string | null>(null)
const saving = ref(false)
function open(r: CalibrationRow) { editing.value = r; form.rating = r.hr_rating ?? 0; form.reason = ''; formError.value = null }
async function save() {
  if (!editing.value) return
  formError.value = null
  if (!form.rating) { formError.value = t('tnd35.cal.pick'); return }
  if (form.reason.trim().length < 10) { formError.value = t('tnd35.cal.reasonRequired'); return }
  saving.value = true
  try { await calibrate(editing.value.packet_id, form.rating, form.reason.trim()); toast.add(t('tnd35.cal.saved')); editing.value = null; await load() }
  catch (e) { formError.value = errorMessage(e) }
  finally { saving.value = false }
}
const historyOf = (pid: string) => log.value.filter(l => l.packet_id === pid)
const fmtDate = (iso: string) => new Intl.DateTimeFormat(tag.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
</script>

<template>
  <div class="wb-stack wb-cal">
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!rows" variant="table" />
    <template v-else>
      <p class="small wb-mut2">{{ t('tnd35.cal.intro') }}</p>
      <div class="wb-cal-top">
        <section class="wb-card wb-cal-card" :aria-label="t('tnd35.cal.spread')">
          <h3 class="h3">{{ t('tnd35.cal.spread') }} <span class="caption wb-mut2">· {{ t('tnd35.cal.rated', { n: rated, total: rows.length }) }}</span></h3>
          <ul class="wb-cal-dist">
            <li v-for="(n, i) in overall" :key="i">
              <span class="caption">{{ t(`tnd29.overall.${i + 1}`) }}</span>
              <span class="wb-cal-bar"><i :class="`is-${i + 1}`" :style="{ width: `${pct(n, rated)}%` }" /></span>
              <b class="caption wb-num">{{ n }}</b>
            </li>
          </ul>
        </section>
        <section class="wb-card wb-cal-card">
          <h3 class="h3">{{ t('tnd35.cal.byManager') }}</h3>
          <table class="wb-cal-mgr">
            <thead><tr><th>{{ t('tnd29.syn.manager') }}</th><th v-for="i in 4" :key="i" class="is-r caption">{{ i }}</th><th class="is-r caption">{{ t('tnd35.cal.avg') }}</th></tr></thead>
            <tbody><tr v-for="m in byManager" :key="m.name"><td class="small">{{ m.name }} <span class="caption wb-mut">({{ m.n }})</span></td><td v-for="(n, i) in m.d" :key="i" class="is-r caption wb-num">{{ n || '·' }}</td><td class="is-r small wb-num"><b>{{ fmt(m.avg) }}</b></td></tr></tbody>
          </table>
        </section>
      </div>

      <div class="wb-card wb-scroll wb-dt">
        <table>
          <caption class="wb-sr">{{ t('tnd35.tabs.calibration') }}</caption>
          <thead><tr><th>{{ t('tnd26.person') }}</th><th>{{ t('tnd29.syn.manager') }}</th><th class="is-r">{{ t('tnd29.syn.self') }}</th><th class="is-r">{{ t('tnd29.syn.manager') }}</th><th class="is-r">{{ t('tnd29.syn.peersShort') }}</th><th>{{ t('tnd35.cal.hr') }}</th><th class="is-r" /></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.packet_id" :class="{ 'is-gap': gap(r) }" :data-cal="r.employee_name">
              <td><b class="small">{{ r.employee_name }}</b><div class="caption wb-mut2">{{ r.team_name ?? '—' }}</div></td>
              <td class="small">{{ r.manager_name ?? '—' }}</td>
              <td class="is-r small wb-num">{{ fmt(r.self_avg) }}</td>
              <td class="is-r small wb-num">{{ fmt(r.manager_avg) }}</td>
              <td class="is-r small wb-num" :title="r.peer_count < 3 ? t('tnd35.cal.peersHidden', { n: r.peer_count }) : ''">{{ fmt(r.peer_avg) }}</td>
              <td>
                <WbBadge v-if="r.hr_rating" size="sm" :tone="r.hr_rating >= 3 ? 'success' : r.hr_rating === 2 ? 'warning' : 'danger'">{{ t(`tnd29.overall.${r.hr_rating}`) }}</WbBadge>
                <span v-else class="caption wb-mut">{{ t('tnd35.cal.none') }}</span>
                <WbIcon v-if="gap(r)" name="triangle-alert" :size="14" class="wb-c-warning" :title="t('tnd35.cal.gapHint')" />
                <div v-if="r.adjustments" class="caption wb-mut2">{{ t('tnd35.cal.adjusted', { n: r.adjustments }, r.adjustments) }}</div>
              </td>
              <td class="is-r"><WbButton v-if="editable && !r.shared" variant="ghost" size="sm" icon="sliders-horizontal" data-action="calibrate" @click="open(r)">{{ t('tnd35.cal.adjust') }}</WbButton></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="caption wb-mut">{{ t('tnd35.cal.legend') }}</p>
    </template>

    <WbModal v-if="editing" :title="t('tnd35.cal.modalTitle', { who: editing.employee_name })" :description="t('tnd35.cal.modalHint')" @close="editing = null">
      <div class="wb-stack-s">
        <WbBanner v-if="formError" tone="danger">{{ formError }}</WbBanner>
        <p class="caption wb-mut2">{{ t('tnd29.syn.self') }} {{ fmt(editing.self_avg) }} · {{ t('tnd29.syn.manager') }} {{ fmt(editing.manager_avg) }} · {{ t('tnd29.syn.peersShort') }} {{ fmt(editing.peer_avg) }}</p>
        <div class="wb-cal-rate" role="radiogroup" :aria-label="t('tnd35.cal.hr')">
          <button v-for="n in 4" :key="n" type="button" role="radio" :aria-checked="form.rating === n" :class="['wb-cal-r', { 'is-on': form.rating === n }]" :data-rating="n" @click="form.rating = n">{{ t(`tnd29.overall.${n}`) }}</button>
        </div>
        <WbTextarea id="cal-reason" v-model="form.reason" :label="t('tnd35.cal.reason')" :placeholder="t('tnd35.cal.reasonPh')" :max="1000" :rows="3" required />
        <div v-if="historyOf(editing.packet_id).length" class="wb-stack-s">
          <span class="caption wb-mut2">{{ t('tnd35.cal.history') }}</span>
          <ul class="wb-cal-log">
            <li v-for="(l, i) in historyOf(editing.packet_id)" :key="i" class="caption"><b>{{ l.from_rating ? t(`tnd29.overall.${l.from_rating}`) : '—' }} → {{ t(`tnd29.overall.${l.to_rating}`) }}</b> · {{ fmtDate(l.created_at) }}<template v-if="l.author"> · {{ l.author.first_name }} {{ l.author.last_name }}</template><br>« {{ l.reason }} »</li>
          </ul>
        </div>
      </div>
      <template #footer>
        <WbButton variant="secondary" @click="editing = null">{{ t('approvals.cancel') }}</WbButton>
        <WbButton icon="check" :loading="saving" data-action="confirm-calibrate" @click="save">{{ t('tnd35.cal.save') }}</WbButton>
      </template>
    </WbModal>
  </div>
</template>

<style scoped>
.wb-cal h3 { margin: 0 0 var(--space-3); }
.wb-cal-top { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: var(--space-3); }
.wb-cal-card { padding: var(--space-4) var(--space-5); }
.wb-cal-dist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.wb-cal-dist li { display: grid; grid-template-columns: 170px minmax(0, 1fr) 28px; gap: var(--space-2); align-items: center; }
.wb-cal-bar { height: 10px; border-radius: 6px; background: var(--surface-2, #eef1f6); overflow: hidden; }
.wb-cal-bar i { display: block; height: 100%; border-radius: 6px; }
.wb-cal-bar i.is-1 { background: var(--danger-solid); }
.wb-cal-bar i.is-2 { background: var(--warning-solid); }
.wb-cal-bar i.is-3 { background: var(--chart-1); }
.wb-cal-bar i.is-4 { background: var(--success-solid); }
.wb-cal-mgr { width: 100%; border-collapse: collapse; }
.wb-cal-mgr th, .wb-cal-mgr td { padding: 4px 6px; border-bottom: 1px solid var(--border); text-align: left; }
.wb-cal-mgr .is-r { text-align: right; }
tr.is-gap td { background: var(--warning-tint); }
.wb-cal-rate { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.wb-cal-r { padding: 10px 8px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.wb-cal-r.is-on { border-color: var(--brand); background: var(--brand-tint); box-shadow: 0 0 0 1px var(--brand); font-weight: 600; }
.wb-cal-log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
@container wbapp (max-width: 767px) {
  .wb-cal-dist li { grid-template-columns: 110px minmax(0, 1fr) 24px; }
  .wb-cal-rate { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
