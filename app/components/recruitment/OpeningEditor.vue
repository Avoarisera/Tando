<script setup lang="ts">
import type { Criterion, Opening, OpeningQuestion, OpeningStatus } from '~/utils/recruitment'
import { DEFAULT_STAGES } from '~/utils/recruitment'

/**
 * TND-30 — create / edit a job opening: what candidates read (title, missions,
 * salary range, process) and what the form asks (cover letter, up to 3 questions).
 */
const props = defineProps<{ opening: Opening | null }>()
const emit = defineEmits<{ saved: [id: string] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const { saveOpening } = useRecruitment()
const { teams, fetchTeams } = useTeams()
const { members, fetchMembers } = useTeamMembers()
const { profile } = useCurrentUser()
onMounted(() => { fetchTeams(); fetchMembers() })

const o = props.opening
const form = reactive({
  title: o?.title ?? '',
  slug: o?.slug ?? '',
  team_id: o?.team_id ?? '',
  hiring_manager_id: o?.hiring_manager_id ?? '',
  location: o?.location ?? '',
  contract_type: o?.contract_type ?? 'cdi',
  remote: o?.remote ?? 'hybrid',
  salary_min: o?.salary_min != null ? String(o.salary_min) : '',
  salary_max: o?.salary_max != null ? String(o.salary_max) : '',
  salary_period: o?.salary_period ?? 'year',
  summary: o?.summary ?? '',
  missions: o?.missions ?? '',
  profile: o?.profile ?? '',
  benefits: o?.benefits ?? '',
  process: (o?.process_steps ?? ['Échange RH', 'Entretien technique', 'Rencontre équipe']).join('\n'),
  cover_letter: o?.cover_letter ?? 'optional',
})
const questions = ref<OpeningQuestion[]>([...(o?.questions ?? [])])
// scorecard criteria (TND-30 lot 2): what interviewers rate from 1 to 4
const criteria = ref<Criterion[]>(o?.criteria?.length ? [...o.criteria] : [
  { id: 'c1', label: 'Compétences techniques' }, { id: 'c2', label: 'Communication' }, { id: 'c3', label: 'Motivation pour le poste' },
])
function addCriterion() {
  if (criteria.value.length >= 6) return
  criteria.value.push({ id: `c${Date.now().toString(36)}`, label: '' })
}
const slugTouched = ref(!!o?.slug)
watch(() => form.title, (v) => { if (!slugTouched.value) form.slug = slugify(v) })

const contractOptions = computed(() => (['cdi', 'cdd', 'internship', 'apprenticeship', 'freelance'] as const).map(v => ({ value: v, label: t(`tnd30.contract.${v}`) })))
const remoteOptions = computed(() => (['on_site', 'hybrid', 'remote'] as const).map(v => ({ value: v, label: t(`tnd30.remote.${v}`) })))
const periodOptions = computed(() => [{ value: 'year', label: t('tnd30.perYearShort') }, { value: 'month', label: t('tnd30.perMonthShort') }])
const letterOptions = computed(() => (['none', 'optional', 'required'] as const).map(v => ({ value: v, label: t(`tnd30.letter.${v}`) })))
const teamOptions = computed(() => [{ value: '', label: t('r8a.people.noTeam') }, ...teams.value.map(x => ({ value: x.id, label: x.name }))])
const managerOptions = computed(() => [{ value: '', label: t('tnd30.editor.noManager') },
  ...members.value.filter(m => m.role !== 'employee').map(m => ({ value: m.id, label: fullName(m) }))])

function addQuestion() {
  if (questions.value.length >= 3) return
  questions.value.push({ id: `q${Date.now().toString(36)}`, label: '', required: false })
}

const error = ref<string | null>(null)
const saving = ref<OpeningStatus | 'save' | null>(null)
const preview = computed(() => salaryLabel({ salary_min: num(form.salary_min), salary_max: num(form.salary_max), salary_currency: 'EUR', salary_period: form.salary_period }, tag.value, t('tnd30.perYear'), t('tnd30.perMonth')))
function num(v: string): number | null {
  const n = Number(String(v).replace(/\s/g, ''))
  return v.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

async function save(status?: OpeningStatus) {
  error.value = null
  if (form.title.trim().length < 3) { error.value = t('tnd30.editor.titleRequired'); return }
  const slug = slugify(form.slug || form.title)
  const min = num(form.salary_min)
  const max = num(form.salary_max)
  if (min != null && max != null && min > max) { error.value = t('tnd30.editor.salaryOrder'); return }
  if (status === 'published' && min == null && max == null) { error.value = t('tnd30.editor.salaryRequired'); return }
  const qs = questions.value.map(q => ({ ...q, label: q.label.trim() })).filter(q => q.label)
  saving.value = status ?? 'save'
  try {
    const patch: Partial<Opening> = {
      title: form.title.trim(), slug, team_id: form.team_id || null, hiring_manager_id: form.hiring_manager_id || null,
      location: form.location.trim(), contract_type: form.contract_type, remote: form.remote,
      salary_min: min, salary_max: max, salary_period: form.salary_period, salary_currency: 'EUR',
      summary: form.summary.trim(), missions: form.missions.trim(), profile: form.profile.trim(), benefits: form.benefits.trim(),
      process_steps: form.process.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8),
      questions: qs, cover_letter: form.cover_letter,
      criteria: criteria.value.map(c => ({ ...c, label: c.label.trim() })).filter(c => c.label).slice(0, 6),
      ...(status ? { status } : {}),
      ...(status === 'published' && !o?.published_at ? { published_at: new Date().toISOString() } : {}),
      ...(!o ? { stages: DEFAULT_STAGES, created_by: profile.value?.id ?? null } : {}),
    }
    const id = await saveOpening(o?.id ?? null, patch)
    toast.add(status === 'published' ? t('tnd30.editor.published') : t('tnd30.editor.saved'))
    emit('saved', id)
  }
  catch (e) { error.value = errorMessage(e) }
  finally { saving.value = null }
}
</script>

<template>
  <form class="wb-stack wb-oe" novalidate @submit.prevent="save()">
    <WbBanner v-if="error" tone="danger">{{ error }}</WbBanner>

    <section class="wb-card wb-oe-s">
      <header><h2 class="h3">{{ t('tnd30.editor.post') }}</h2><p class="small wb-mut">{{ t('tnd30.editor.postHint') }}</p></header>
      <div class="wb-oe-f">
        <div class="wb-oe-wide"><WbInput id="op-title" v-model="form.title" :label="t('tnd30.fields.title')" required maxlength="120" :placeholder="t('tnd30.editor.titlePh')" /></div>
        <div class="wb-oe-wide"><WbInput id="op-slug" v-model="form.slug" :label="t('tnd30.fields.slug')" prefix="/carrieres/" maxlength="80" :hint="t('tnd30.editor.slugHint')" @update:model-value="slugTouched = true" /></div>
        <WbSelect id="op-team" v-model="form.team_id" :label="t('calendar.team')" :options="teamOptions" />
        <WbSelect id="op-manager" v-model="form.hiring_manager_id" :label="t('tnd30.fields.manager')" :options="managerOptions" :hint="t('tnd30.editor.managerHint')" />
        <WbInput id="op-loc" v-model="form.location" :label="t('tnd30.fields.location')" maxlength="120" :placeholder="t('tnd30.editor.locationPh')" />
        <WbSelect id="op-contract" v-model="form.contract_type" :label="t('tnd30.fields.contract')" :options="contractOptions" />
        <WbSelect id="op-remote" v-model="form.remote" :label="t('tnd30.fields.remote')" :options="remoteOptions" />
      </div>
    </section>

    <section class="wb-card wb-oe-s">
      <header><h2 class="h3">{{ t('tnd30.editor.salary') }}</h2><p class="small wb-mut">{{ t('tnd30.editor.salaryHint') }}</p></header>
      <div class="wb-oe-f">
        <WbInput id="op-min" v-model="form.salary_min" inputmode="numeric" :label="t('tnd30.fields.salaryMin')" prefix="€" />
        <WbInput id="op-max" v-model="form.salary_max" inputmode="numeric" :label="t('tnd30.fields.salaryMax')" prefix="€" />
        <WbSelect id="op-period" v-model="form.salary_period" :label="t('tnd30.fields.period')" :options="periodOptions" />
        <p class="small wb-oe-prev wb-num">{{ preview ?? t('tnd30.editor.noSalary') }}</p>
      </div>
    </section>

    <section class="wb-card wb-oe-s">
      <header><h2 class="h3">{{ t('tnd30.editor.content') }}</h2><p class="small wb-mut">{{ t('tnd30.editor.contentHint') }}</p></header>
      <div class="wb-oe-f">
        <div class="wb-oe-wide"><WbTextarea id="op-summary" v-model="form.summary" :label="t('tnd30.fields.summary')" :max="400" :rows="2" /></div>
        <div class="wb-oe-wide"><WbTextarea id="op-missions" v-model="form.missions" :label="t('tnd30.fields.missions')" :max="6000" :rows="7" /></div>
        <div class="wb-oe-wide"><WbTextarea id="op-profile" v-model="form.profile" :label="t('tnd30.fields.profile')" :max="6000" :rows="6" /></div>
        <div class="wb-oe-wide"><WbTextarea id="op-benefits" v-model="form.benefits" :label="t('tnd30.fields.benefits')" :max="4000" :rows="4" /></div>
        <div class="wb-oe-wide"><WbTextarea id="op-process" v-model="form.process" :label="t('tnd30.fields.process')" :rows="4" :hint="t('tnd30.editor.processHint')" /></div>
      </div>
    </section>

    <section class="wb-card wb-oe-s">
      <header><h2 class="h3">{{ t('tnd30.editor.form') }}</h2><p class="small wb-mut">{{ t('tnd30.editor.formHint') }}</p></header>
      <div class="wb-oe-f">
        <WbSelect id="op-letter" v-model="form.cover_letter" :label="t('tnd30.apply.letter')" :options="letterOptions" />
        <div class="wb-oe-wide wb-stack-s">
          <span class="wb-label">{{ t('tnd30.editor.questions') }}</span>
          <div v-for="(q, i) in questions" :key="q.id" class="wb-row wb-oe-q">
            <WbInput :id="`op-q-${i}`" v-model="q.label" class="wb-grow" :aria-label="t('tnd30.editor.question', { n: i + 1 })" maxlength="200" :placeholder="t('tnd30.editor.questionPh')" />
            <WbCheckbox :model-value="!!q.required" :label="t('tnd30.editor.required')" @update:model-value="(v: boolean) => (q.required = v)" />
            <WbButton variant="ghost" size="sm" icon="x" icon-only @click="questions.splice(i, 1)">{{ t('tnd30.editor.remove') }}</WbButton>
          </div>
          <div><WbButton v-if="questions.length < 3" variant="secondary" size="sm" icon="plus" @click="addQuestion">{{ t('tnd30.editor.addQuestion') }}</WbButton></div>
        </div>
      </div>
    </section>

    <section class="wb-card wb-oe-s">
      <header><h2 class="h3">{{ t('tnd30.editor.criteria') }}</h2><p class="small wb-mut">{{ t('tnd30.editor.criteriaHint') }}</p></header>
      <div class="wb-oe-f">
        <div class="wb-oe-wide wb-stack-s">
          <div v-for="(c, i) in criteria" :key="c.id" class="wb-row wb-oe-q">
            <WbInput :id="`op-c-${i}`" v-model="c.label" class="wb-grow" :aria-label="t('tnd30.editor.criterion', { n: i + 1 })" maxlength="80" />
            <WbButton variant="ghost" size="sm" icon="x" icon-only @click="criteria.splice(i, 1)">{{ t('tnd30.editor.remove') }}</WbButton>
          </div>
          <div><WbButton v-if="criteria.length < 6" variant="secondary" size="sm" icon="plus" @click="addCriterion">{{ t('tnd30.editor.addCriterion') }}</WbButton></div>
        </div>
      </div>
    </section>

    <div class="wb-oe-bar">
      <span class="small wb-mut">{{ opening?.status ? t(`tnd30.status.${opening.status}`) : t('tnd30.status.draft') }}</span>
      <span class="wb-grow" />
      <WbButton v-if="opening?.status === 'published'" variant="ghost" :loading="saving === 'paused'" @click="save('paused')">{{ t('tnd30.editor.pause') }}</WbButton>
      <WbButton v-if="opening && opening.status !== 'closed'" variant="ghost" :loading="saving === 'closed'" @click="save('closed')">{{ t('tnd30.editor.close') }}</WbButton>
      <WbButton type="submit" variant="secondary" :loading="saving === 'save'">{{ t('tnd30.editor.save') }}</WbButton>
      <WbButton v-if="opening?.status !== 'published'" icon="send" :loading="saving === 'published'" data-action="publish" @click="save('published')">{{ t('tnd30.editor.publish') }}</WbButton>
    </div>
  </form>
</template>

<style scoped>
.wb-oe { gap: var(--space-4); }
.wb-oe-s { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--space-5); padding: var(--space-5); }
.wb-oe-s header h2 { margin: 0 0 4px; }
.wb-oe-f { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: start; }
.wb-oe-wide { grid-column: 1 / -1; }
.wb-oe-prev { align-self: end; margin: 0 0 10px; color: var(--brand-text); }
.wb-oe-q { gap: var(--space-2); align-items: center; }
.wb-oe-bar { position: sticky; bottom: 0; z-index: 3; display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-2); }
.wb-oe-bar :deep(.wb-btn) { margin: 0; }
@container wbapp (max-width: 1023px) {
  .wb-oe-s { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
}
@container wbapp (max-width: 767px) {
  .wb-oe-f { grid-template-columns: minmax(0, 1fr); }
  .wb-oe-bar { flex-wrap: wrap; }
}
</style>
