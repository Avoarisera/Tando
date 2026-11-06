<script setup lang="ts">
import type { ApplicationRow, Recommendation, Scorecard } from '~/composables/useRecruitment'
import type { Opening } from '~/utils/recruitment'

/**
 * TND-30 lot 2 — structured interview feedback. Each person fills their own
 * scorecard for a stage (criteria 1–4, comment, recommendation) and only sees the
 * others' once theirs is submitted (RLS) — the Greenhouse "independent" rule.
 */
const props = defineProps<{ app: ApplicationRow, opening: Opening }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const { profile } = useCurrentUser()
const { listScorecards, saveScorecard } = useRecruitment()

const cards = ref<Scorecard[]>([])
const loading = ref(true)
async function load() {
  loading.value = true
  try { cards.value = await listScorecards(props.app.id) }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { loading.value = false }
}
watch(() => props.app.id, load, { immediate: true })

const criteria = computed(() => props.opening.criteria ?? [])
const stageOptions = computed(() => props.opening.stages.filter(s => !['new', 'hired'].includes(s.key)).map(s => ({ value: s.key, label: s.label })))
const stage = ref(stageOptions.value.some(s => s.value === props.app.stage) ? props.app.stage : (stageOptions.value[0]?.value ?? 'screen'))

const mine = computed(() => cards.value.find(c => c.author_id === profile.value?.id && c.stage_key === stage.value) ?? null)
const others = computed(() => cards.value.filter(c => c.submitted_at && c.author_id !== profile.value?.id))
const draft = reactive<{ ratings: Record<string, number>, comments: Record<string, string>, summary: string, recommendation: Recommendation | null }>({ ratings: {}, comments: {}, summary: '', recommendation: null })
watch(mine, (m) => {
  draft.ratings = { ...(m?.ratings ?? {}) }
  draft.comments = { ...(m?.comments ?? {}) }
  draft.summary = m?.summary ?? ''
  draft.recommendation = m?.recommendation ?? null
}, { immediate: true })
const locked = computed(() => !!mine.value?.submitted_at)

const LEVELS = [1, 2, 3, 4] as const
const RECS: Recommendation[] = ['strong_no', 'no', 'yes', 'strong_yes']
const saving = ref<'draft' | 'submit' | null>(null)
const error = ref<string | null>(null)
async function save(submit: boolean) {
  error.value = null
  if (submit) {
    const missing = criteria.value.filter(c => !draft.ratings[c.id])
    if (missing.length) { error.value = t('tnd30.score.missing', { n: missing.length }, missing.length); return }
    if (!draft.recommendation) { error.value = t('tnd30.score.needRec'); return }
  }
  saving.value = submit ? 'submit' : 'draft'
  try {
    await saveScorecard({ id: mine.value?.id, application_id: props.app.id, author_id: profile.value!.id, stage_key: stage.value,
      ratings: draft.ratings, comments: draft.comments, summary: draft.summary.trim(), recommendation: draft.recommendation,
      submitted_at: submit ? new Date().toISOString() : null })
    toast.add(submit ? t('tnd30.score.submitted') : t('tnd30.score.saved'))
    await load()
  }
  catch (e) { error.value = errorMessage(e) }
  finally { saving.value = null }
}

// synthesis of the submitted scorecards (mine included once submitted)
const submitted = computed(() => cards.value.filter(c => c.submitted_at))
const avg = (id: string) => {
  const vals = submitted.value.map(c => c.ratings[id]).filter((v): v is number => typeof v === 'number')
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}
const recCount = (r: Recommendation) => submitted.value.filter(c => c.recommendation === r).length
const recTone = (r: Recommendation) => (r === 'strong_yes' || r === 'yes' ? 'success' : 'danger') as 'success' | 'danger'
const stageName = (k: string) => stageLabel(props.opening.stages, k)
</script>

<template>
  <div class="wb-stack wb-sc">
    <p v-if="!criteria.length" class="wb-why small">{{ t('tnd30.score.noCriteria') }}</p>

    <!-- synthesis -->
    <section v-if="submitted.length" class="wb-sc-syn">
      <h3 class="caption wb-mut2 wb-sc-h">{{ t('tnd30.score.synthesis', { n: submitted.length }, submitted.length) }}</h3>
      <div class="wb-row wb-wrap wb-sc-recs">
        <WbBadge v-for="r in RECS.slice().reverse()" v-show="recCount(r)" :key="r" :tone="recTone(r)" size="sm">{{ t(`tnd30.rec.${r}`) }} · {{ recCount(r) }}</WbBadge>
      </div>
      <ul class="wb-sc-avg">
        <li v-for="c in criteria" :key="c.id">
          <span class="small">{{ c.label }}</span>
          <span class="wb-sc-bar" :aria-label="avg(c.id) === null ? '—' : `${avg(c.id)!.toFixed(1)} / 4`"><i :style="{ width: `${((avg(c.id) ?? 0) / 4) * 100}%` }" /></span>
          <b class="small wb-num">{{ avg(c.id) === null ? '—' : avg(c.id)!.toLocaleString(tag, { maximumFractionDigits: 1 }) }}</b>
        </li>
      </ul>
    </section>

    <!-- my scorecard -->
    <section class="wb-card wb-sc-mine">
      <div class="wb-row-b wb-wrap">
        <h3 class="h3">{{ t('tnd30.score.mine') }}</h3>
        <WbSelect v-model="stage" :options="stageOptions" :aria-label="t('tnd30.panel.stage')" />
      </div>
      <p v-if="locked" class="small wb-c-success">{{ t('tnd30.score.lockedOn', { date: fmtShort(mine!.submitted_at!.slice(0, 10), tag) }) }}</p>
      <WbBanner v-if="error" tone="danger">{{ error }}</WbBanner>
      <fieldset v-for="c in criteria" :key="c.id" class="wb-sc-crit" :disabled="locked">
        <legend class="small"><b>{{ c.label }}</b></legend>
        <div class="wb-sc-levels" role="radiogroup" :aria-label="c.label">
          <button v-for="l in LEVELS" :key="l" type="button" role="radio" :aria-checked="draft.ratings[c.id] === l" :class="['wb-sc-l', { 'is-on': draft.ratings[c.id] === l }]" :data-level="l" @click="draft.ratings[c.id] = l">
            <b class="wb-num">{{ l }}</b><span class="caption2">{{ t(`tnd30.score.level.${l}`) }}</span>
          </button>
        </div>
        <WbInput v-model="draft.comments[c.id]" :aria-label="t('tnd30.score.comment', { c: c.label })" :placeholder="t('tnd30.score.commentPh')" maxlength="500" />
      </fieldset>
      <WbTextarea id="sc-summary" v-model="draft.summary" :label="t('tnd30.score.summary')" :hint="t('tnd30.score.summaryHint')" :max="3000" :rows="3" :disabled="locked" />
      <div class="wb-stack-s">
        <span class="wb-label">{{ t('tnd30.score.recommendation') }}</span>
        <div class="wb-sc-recpick" role="radiogroup" :aria-label="t('tnd30.score.recommendation')">
          <button v-for="r in RECS" :key="r" type="button" role="radio" :disabled="locked" :aria-checked="draft.recommendation === r" :class="['wb-sc-rec', `is-${r}`, { 'is-on': draft.recommendation === r }]" @click="draft.recommendation = r">{{ t(`tnd30.rec.${r}`) }}</button>
        </div>
      </div>
      <div v-if="!locked" class="wb-row wb-sc-act">
        <WbButton variant="secondary" size="sm" :loading="saving === 'draft'" @click="save(false)">{{ t('tnd30.score.saveDraft') }}</WbButton>
        <WbButton size="sm" icon="send" :loading="saving === 'submit'" data-action="submit-scorecard" @click="save(true)">{{ t('tnd30.score.submit') }}</WbButton>
        <span class="caption wb-mut">{{ t('tnd30.score.submitHint') }}</span>
      </div>
    </section>

    <!-- the others' scorecards -->
    <section class="wb-stack-s">
      <h3 class="caption wb-mut2 wb-sc-h">{{ t('tnd30.score.others') }}</h3>
      <WbSkeleton v-if="loading" variant="table" />
      <p v-else-if="!others.length" class="small wb-mut">{{ locked ? t('tnd30.score.noOthers') : t('tnd30.score.hiddenUntil') }}</p>
      <article v-for="c in others" :key="c.id" class="wb-sc-card">
        <div class="wb-row-b wb-wrap">
          <span class="small"><b>{{ c.profiles?.first_name }} {{ c.profiles?.last_name }}</b> · {{ stageName(c.stage_key) }}</span>
          <WbBadge v-if="c.recommendation" :tone="recTone(c.recommendation)" size="sm">{{ t(`tnd30.rec.${c.recommendation}`) }}</WbBadge>
        </div>
        <ul class="wb-sc-lines caption">
          <li v-for="cr in criteria" :key="cr.id"><span>{{ cr.label }}</span><b class="wb-num">{{ c.ratings[cr.id] ?? '—' }}</b><span v-if="c.comments[cr.id]" class="wb-mut2">« {{ c.comments[cr.id] }} »</span></li>
        </ul>
        <p v-if="c.summary" class="small wb-sc-sum">{{ c.summary }}</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.wb-sc { gap: var(--space-4); }
.wb-sc-h { margin: 0; text-transform: uppercase; letter-spacing: .04em; font-weight: 650; }
.wb-sc-syn { display: flex; flex-direction: column; gap: var(--space-2); }
.wb-sc-avg { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.wb-sc-avg li { display: grid; grid-template-columns: minmax(0, 1fr) 140px 32px; gap: var(--space-2); align-items: center; }
.wb-sc-bar { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.wb-sc-bar i { display: block; height: 100%; border-radius: 4px; background: var(--chart-1); }
.wb-sc-mine { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.wb-sc-mine h3 { margin: 0; }
.wb-sc-mine :deep(.wb-field) { flex: 0 0 auto; }
.wb-sc-crit { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.wb-sc-crit legend { padding: 0; margin-bottom: 4px; }
.wb-sc-levels { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.wb-sc-l { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); color: inherit; font: inherit; cursor: pointer; }
.wb-sc-l:hover { border-color: var(--brand); }
.wb-sc-l.is-on { border-color: var(--brand); background: var(--brand-tint); color: var(--brand-text); }
.wb-sc-l:disabled { cursor: default; }
.wb-sc-recpick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.wb-sc-rec { padding: 8px 6px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.wb-sc-rec.is-on.is-strong_yes, .wb-sc-rec.is-on.is-yes { border-color: var(--success-solid); background: var(--success-tint); }
.wb-sc-rec.is-on.is-no, .wb-sc-rec.is-on.is-strong_no { border-color: var(--danger-solid); background: var(--danger-tint); }
.wb-sc-act { gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.wb-sc-act :deep(.wb-btn) { margin: 0; }
.wb-sc-card { padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 6px; }
.wb-sc-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.wb-sc-lines li { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.wb-sc-lines b { min-width: 14px; }
.wb-sc-sum { margin: 0; white-space: pre-wrap; }
@container wbapp (max-width: 767px) {
  .wb-sc-recpick { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .wb-sc-avg li { grid-template-columns: minmax(0, 1fr) 80px 32px; }
}
</style>
