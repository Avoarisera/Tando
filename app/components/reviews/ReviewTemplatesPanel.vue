<script setup lang="ts">
import type { ReviewTemplate } from '~/composables/useReviews'
import type { TemplateContent } from '~/utils/reviews'

/**
 * TND-29 — edit the review templates: competencies with their 4 behaviours,
 * open questions and who answers them. A running campaign keeps the copy taken
 * at launch: edits apply to the next campaigns. Lot 2: the short form asked to
 * colleagues (which competencies, their own questions).
 */
const props = defineProps<{ templates: ReviewTemplate[] }>()
const emit = defineEmits<{ close: [], saved: [] }>()
const { t } = useI18n()
const toast = useToast()
const { saveTemplate } = useReviews()

const id = ref(props.templates[0]?.id ?? '')
const drafts = reactive<Record<string, { name: string, content: TemplateContent }>>(Object.fromEntries(props.templates.map(x => [x.id, { name: x.name, content: JSON.parse(JSON.stringify(x.content)) as TemplateContent }])))
for (const d of Object.values(drafts)) d.content.peer ??= { competencies: [], questions: [] }
const cur = computed(() => drafts[id.value])
const peer = computed(() => cur.value!.content.peer!)
function togglePeer(cid: string, on: boolean) {
  peer.value.competencies = on ? [...new Set([...peer.value.competencies, cid])] : peer.value.competencies.filter(x => x !== cid)
}
function addPeerQuestion() {
  if (peer.value.questions.length < 4) peer.value.questions.push({ id: `p${Date.now().toString(36)}`, label: '' })
}
const tabs = computed(() => props.templates.map(x => ({ id: x.id, label: x.name })))
const LEVELS = [1, 2, 3, 4] as const
function addCompetency() {
  if (!cur.value || cur.value.content.competencies.length >= 10) return
  cur.value.content.competencies.push({ id: `c${Date.now().toString(36)}`, label: '', levels: ['', '', '', ''] })
}
function addQuestion() {
  if (!cur.value || cur.value.content.questions.length >= 8) return
  cur.value.content.questions.push({ id: `q${Date.now().toString(36)}`, label: '', roles: ['self'] })
}
function toggleRole(q: TemplateContent['questions'][number], role: 'self' | 'manager', on: boolean) {
  q.roles = on ? [...new Set([...q.roles, role])] : q.roles.filter(r => r !== role)
}
const error = ref<string | null>(null)
const saving = ref(false)
async function save() {
  const d = cur.value
  if (!d) return
  error.value = null
  const comps = d.content.competencies.filter(c => c.label.trim())
  if (!comps.length) { error.value = t('tnd29.tpl.needCompetency'); return }
  if (comps.some(c => c.levels.some(l => !l.trim()))) { error.value = t('tnd29.tpl.needLevels'); return }
  saving.value = true
  try {
    const p = d.content.peer ?? { competencies: [], questions: [] }
    const peerPart = { competencies: p.competencies.filter(cid => comps.some(c => c.id === cid)), questions: p.questions.filter(q => q.label.trim()) }
    await saveTemplate({ id: id.value, name: d.name.trim() || 'Modèle', content: { ...d.content, competencies: comps, questions: d.content.questions.filter(q => q.label.trim() && q.roles.length), peer: peerPart } })
    toast.add(t('tnd29.tpl.saved'))
    emit('saved')
  }
  catch (e) { error.value = errorMessage(e) }
  finally { saving.value = false }
}
</script>

<template>
  <WbSidePanel :title="t('tnd29.tpl.title')" :subtitle="t('tnd29.tpl.hint')" :width="760" @close="emit('close')">
    <WbTabs v-model="id" class="wb-tt-tabs" :tabs="tabs" :label="t('tnd29.tpl.title')" />
    <WbBanner v-if="error" tone="danger">{{ error }}</WbBanner>
    <template v-if="cur">
      <WbInput id="tt-name" v-model="cur.name" :label="t('tnd29.tpl.name')" maxlength="120" />
      <WbCheckbox v-model="cur.content.objectives" :label="t('tnd29.tpl.objectives')" />
      <h3 class="h3">{{ t('tnd29.form.competencies') }}</h3>
      <fieldset v-for="(c, i) in cur.content.competencies" :key="c.id" class="wb-tt-comp">
        <div class="wb-row wb-tt-head">
          <WbInput v-model="c.label" class="wb-grow" :aria-label="t('tnd29.tpl.competency', { n: i + 1 })" :placeholder="t('tnd29.tpl.competencyPh')" maxlength="80" />
          <WbButton variant="ghost" size="sm" icon="x" icon-only @click="cur.content.competencies.splice(i, 1)">{{ t('tnd30.editor.remove') }}</WbButton>
        </div>
        <WbCheckbox :model-value="peer.competencies.includes(c.id)" :label="t('tnd29.tpl.askPeers')" @update:model-value="(v: boolean) => togglePeer(c.id, v)" />
        <div class="wb-tt-levels">
          <WbInput v-for="(l, j) in LEVELS" :key="l" v-model="c.levels[j]" :label="`${l} · ${t(`tnd29.level.${l}`)}`" maxlength="200" />
        </div>
      </fieldset>
      <div><WbButton variant="secondary" size="sm" icon="plus" @click="addCompetency">{{ t('tnd29.tpl.addCompetency') }}</WbButton></div>

      <h3 class="h3">{{ t('tnd29.form.questions') }}</h3>
      <div v-for="(q, i) in cur.content.questions" :key="q.id" class="wb-tt-q">
        <WbInput v-model="q.label" class="wb-grow" :aria-label="t('tnd29.tpl.question', { n: i + 1 })" maxlength="300" />
        <WbCheckbox :model-value="q.roles.includes('self')" :label="t('tnd29.syn.self')" @update:model-value="(v: boolean) => toggleRole(q, 'self', v)" />
        <WbCheckbox :model-value="q.roles.includes('manager')" :label="t('tnd29.syn.manager')" @update:model-value="(v: boolean) => toggleRole(q, 'manager', v)" />
        <WbButton variant="ghost" size="sm" icon="x" icon-only @click="cur.content.questions.splice(i, 1)">{{ t('tnd30.editor.remove') }}</WbButton>
      </div>
      <div><WbButton variant="secondary" size="sm" icon="plus" @click="addQuestion">{{ t('tnd29.tpl.addQuestion') }}</WbButton></div>

      <h3 class="h3">{{ t('tnd29.tpl.peerTitle') }}</h3>
      <p class="caption wb-mut">{{ t('tnd29.tpl.peerHint', { n: peer.competencies.length }) }}</p>
      <div v-for="(q, i) in peer.questions" :key="q.id" class="wb-tt-q">
        <WbInput v-model="q.label" class="wb-grow" :aria-label="t('tnd29.tpl.peerQuestion', { n: i + 1 })" maxlength="300" />
        <WbButton variant="ghost" size="sm" icon="x" icon-only @click="peer.questions.splice(i, 1)">{{ t('tnd30.editor.remove') }}</WbButton>
      </div>
      <div v-if="peer.questions.length < 4"><WbButton variant="secondary" size="sm" icon="plus" @click="addPeerQuestion">{{ t('tnd29.tpl.addPeerQuestion') }}</WbButton></div>
      <div class="wb-panel-f"><WbButton block :loading="saving" data-action="save-template" @click="save">{{ t('rules.save') }}</WbButton></div>
    </template>
  </WbSidePanel>
</template>

<style scoped>
.wb-tt-tabs { flex: none; }
.wb-tt-comp { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-3); margin: 0; display: flex; flex-direction: column; gap: var(--space-2); flex: none; }
.wb-tt-head { gap: var(--space-2); }
.wb-tt-levels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.wb-tt-q { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; flex: none; }
.wb-tt-q :deep(.wb-field) { flex: 1 1 280px; }
@container wbapp (max-width: 767px) {
  .wb-tt-levels { grid-template-columns: minmax(0, 1fr); }
}
</style>
