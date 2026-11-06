<script setup lang="ts">
import type { ObjectiveReview, ReviewResponse, TemplateContent } from '~/utils/reviews'
import { missingInResponse, type ReviewRole } from '~/utils/reviews'

/**
 * TND-29 — the review form (self or manager): each competency on 4 levels
 * described by observable behaviours (+ « je ne peux pas me prononcer »), a
 * comment asking for examples, the open questions of this role, the review of
 * the period's objectives. Autosaves as a draft; once submitted it is locked.
 */
const props = defineProps<{ content: TemplateContent, role: ReviewRole, packetId: string, authorId: string, initial: ReviewResponse | null, subject: string }>()
const emit = defineEmits<{ submitted: [] }>()
const { t } = useI18n()
const toast = useToast()
const { saveResponse } = useReviews()

const r = reactive<ReviewResponse>(props.initial
  ? JSON.parse(JSON.stringify(props.initial)) as ReviewResponse
  : { packet_id: props.packetId, author_id: props.authorId, role: props.role, ratings: {}, comments: {}, answers: {}, objectives: [], submitted_at: null })
const locked = computed(() => !!props.initial?.submitted_at)
const questions = computed(() => props.content.questions.filter(q => q.roles.includes(props.role)))
if (props.content.objectives && !r.objectives.length) r.objectives.push({ text: '', status: '', comment: '' })

// draft autosave (debounced) — the first save creates the row
const savedAt = ref<Date | null>(null)
const saving = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let hasRow = !!props.initial?.id
async function persist(submit = false) {
  saving.value = true
  try {
    await saveResponse({ ...r, objectives: r.objectives.filter(o => o.text.trim()), submitted_at: submit ? new Date().toISOString() : null, id: hasRow ? (r.id ?? props.initial?.id) : undefined })
    if (!hasRow) {
      hasRow = true
      // reload the id so later saves update the same row
      const rows = await useReviews().listResponses(props.packetId)
      r.id = rows.find(x => x.role === props.role)?.id
    }
    savedAt.value = new Date()
  }
  finally { saving.value = false }
}
watch(() => JSON.stringify([r.ratings, r.comments, r.answers, r.objectives]), () => {
  if (locked.value) return
  clearTimeout(timer)
  timer = setTimeout(() => { persist().catch(e => toast.add(errorMessage(e), 'error')) }, 1200)
})
onBeforeUnmount(() => clearTimeout(timer))

const missing = computed(() => missingInResponse(props.content, props.role, r))
const confirm = ref(false)
const error = ref<string | null>(null)
function askSubmit() {
  error.value = null
  const n = missing.value.competencies.length + missing.value.questions.length
  if (n) {
    error.value = t('tnd29.form.missing', { n }, n)
    document.querySelector<HTMLElement>(`[data-comp="${missing.value.competencies[0]}"], [data-q="${missing.value.questions[0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  confirm.value = true
}
async function submit() {
  clearTimeout(timer)
  try {
    await persist(true)
    confirm.value = false
    toast.add(t('tnd29.form.sent'))
    emit('submitted')
  }
  catch (e) { error.value = errorMessage(e) }
}
const STATUSES: ObjectiveReview['status'][] = ['met', 'partial', 'missed']
const isMissing = (kind: 'c' | 'q', id: string) => !!error.value && (kind === 'c' ? missing.value.competencies : missing.value.questions).includes(id)
</script>

<template>
  <div class="wb-stack wb-rf">
    <p v-if="locked" class="wb-why small"><WbIcon name="circle-check" :size="14" /> {{ t('tnd29.form.locked') }}</p>
    <p v-else-if="role === 'peer'" class="wb-why small"><WbIcon name="eye" :size="14" /> {{ t('tnd29.peer.intro', { who: subject }) }}</p>
    <p v-else class="small wb-mut2">{{ role === 'self' ? t('tnd29.form.introSelf') : t('tnd29.form.introManager', { who: subject }) }}</p>

    <section class="wb-stack">
      <h2 class="h2">{{ t('tnd29.form.competencies') }}</h2>
      <fieldset v-for="c in content.competencies" :key="c.id" :data-comp="c.id" :class="['wb-card wb-rf-comp', { 'is-miss': isMissing('c', c.id) }]" :disabled="locked">
        <legend class="h3">{{ c.label }}</legend>
        <div class="wb-rf-levels" role="radiogroup" :aria-label="c.label">
          <button v-for="(desc, i) in c.levels" :key="i" type="button" role="radio" :aria-checked="r.ratings[c.id] === i + 1" :class="['wb-rf-l', { 'is-on': r.ratings[c.id] === i + 1 }]" :data-level="i + 1" @click="r.ratings[c.id] = i + 1">
            <b class="small">{{ i + 1 }} · {{ t(`tnd29.level.${i + 1}`) }}</b>
            <span class="caption">{{ desc }}</span>
          </button>
        </div>
        <div class="wb-row wb-wrap wb-rf-na">
          <WbCheckbox :model-value="r.ratings[c.id] === 0" :label="t('tnd29.form.cantSay')" @update:model-value="(v: boolean) => (r.ratings[c.id] = v ? 0 : (undefined as unknown as number))" />
        </div>
        <WbTextarea v-model="r.comments[c.id]" :label="t('tnd29.form.example')" :placeholder="t('tnd29.form.examplePh')" :max="1500" :rows="2" />
      </fieldset>
    </section>

    <section v-if="content.objectives" class="wb-stack">
      <h2 class="h2">{{ t('tnd29.form.objectives') }}</h2>
      <p class="small wb-mut2">{{ t('tnd29.form.objectivesHint') }}</p>
      <fieldset v-for="(o, i) in r.objectives" :key="i" class="wb-card wb-rf-obj" :disabled="locked">
        <WbInput v-model="o.text" :aria-label="t('tnd29.form.objective', { n: i + 1 })" :placeholder="t('tnd29.form.objectivePh')" maxlength="300" />
        <div class="wb-rf-status" role="radiogroup" :aria-label="t('tnd29.form.status')">
          <button v-for="s in STATUSES" :key="s" type="button" role="radio" :aria-checked="o.status === s" :class="['wb-rf-st', `is-${s}`, { 'is-on': o.status === s }]" @click="o.status = s">{{ t(`tnd29.obj.${s}`) }}</button>
        </div>
        <WbInput v-model="o.comment" :aria-label="t('tnd29.form.objComment')" :placeholder="t('tnd29.form.objComment')" maxlength="500" />
        <div v-if="!locked && r.objectives.length > 1"><WbButton variant="ghost" size="sm" icon="x" @click="r.objectives.splice(i, 1)">{{ t('tnd30.editor.remove') }}</WbButton></div>
      </fieldset>
      <div v-if="!locked && r.objectives.length < 8"><WbButton variant="secondary" size="sm" icon="plus" @click="r.objectives.push({ text: '', status: '', comment: '' })">{{ t('tnd29.form.addObjective') }}</WbButton></div>
    </section>

    <section v-if="questions.length" class="wb-stack">
      <h2 class="h2">{{ t('tnd29.form.questions') }}</h2>
      <div v-for="q in questions" :key="q.id" :data-q="q.id" :class="{ 'is-miss': isMissing('q', q.id) }">
        <WbTextarea v-model="r.answers[q.id]" :label="q.label" :max="3000" :rows="4" :disabled="locked" required />
      </div>
    </section>

    <div v-if="!locked" class="wb-rf-bar">
      <span class="caption wb-mut">{{ saving ? t('tnd29.form.saving') : savedAt ? t('tnd29.form.savedAt', { time: savedAt.toLocaleTimeString().slice(0, 5) }) : t('tnd29.form.autosave') }}</span>
      <WbBanner v-if="error" tone="danger" class="wb-rf-err">{{ error }}</WbBanner>
      <span class="wb-grow" />
      <WbButton icon="send" data-action="submit-review" @click="askSubmit">{{ t('tnd29.form.submit') }}</WbButton>
    </div>

    <WbModal v-if="confirm" :title="t('tnd29.form.confirmTitle')" :description="role === 'self' ? t('tnd29.form.confirmSelf') : role === 'peer' ? t('tnd29.peer.confirm') : t('tnd29.form.confirmManager')" @close="confirm = false">
      <template #footer>
        <WbButton variant="secondary" @click="confirm = false">{{ t('approvals.cancel') }}</WbButton>
        <WbButton icon="send" :loading="saving" data-action="confirm-submit" @click="submit">{{ t('tnd29.form.submit') }}</WbButton>
      </template>
    </WbModal>
  </div>
</template>

<style scoped>
.wb-rf { gap: var(--space-5); }
.wb-rf h2 { margin: 0; }
.wb-rf-comp, .wb-rf-obj { padding: var(--space-4); margin: 0; border: 1px solid var(--border); display: flex; flex-direction: column; gap: var(--space-3); }
.wb-rf-comp legend { padding: 0; float: left; width: 100%; margin: 0; }
.wb-rf-comp.is-miss { border-color: var(--danger-solid); box-shadow: 0 0 0 1px var(--danger-solid); }
.wb-rf-levels { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-2); clear: both; }
.wb-rf-l { display: flex; flex-direction: column; gap: 4px; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); color: inherit; font: inherit; text-align: left; cursor: pointer; }
.wb-rf-l:hover { border-color: var(--brand); }
.wb-rf-l.is-on { border-color: var(--brand); background: var(--brand-tint); box-shadow: 0 0 0 1px var(--brand); }
.wb-rf-l:disabled, .wb-rf-st:disabled { cursor: default; }
.wb-rf-l .caption { color: var(--ink-2); }
.wb-rf-status { display: flex; gap: 6px; flex-wrap: wrap; }
.wb-rf-st { padding: 6px 12px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface); color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.wb-rf-st.is-on.is-met { border-color: var(--success-solid); background: var(--success-tint); }
.wb-rf-st.is-on.is-partial { border-color: var(--warning-solid); background: var(--warning-tint); }
.wb-rf-st.is-on.is-missed { border-color: var(--danger-solid); background: var(--danger-tint); }
.is-miss :deep(textarea) { border-color: var(--danger-solid); }
.wb-rf-bar { position: sticky; bottom: 0; z-index: 3; display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-2); }
.wb-rf-bar :deep(.wb-btn) { margin: 0; }
.wb-rf-err { flex: 1 1 260px; }
@container wbapp (max-width: 1023px) {
  .wb-rf-levels { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container wbapp (max-width: 520px) {
  .wb-rf-levels { grid-template-columns: minmax(0, 1fr); }
}
</style>
