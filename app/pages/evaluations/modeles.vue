<script setup lang="ts">
import type { ReviewTemplate } from '~/composables/useReviews'
import type { TemplateContent } from '~/utils/reviews'

// HR — library of review templates (TND-32): use one for a new campaign, edit,
// duplicate, archive, start a blank one.
definePageMeta({ titleKey: 'nav.evaluations', layout: 'private', middleware: 'hr-access' })
const { t } = useI18n()
const toast = useToast()
const { listTemplates, createTemplate, duplicateTemplate, archiveTemplate } = useReviews()
usePageHeader(() => ({ crumbs: [{ label: t('nav.evaluations'), to: '/evaluations' }, { label: t('tnd29.tpl.title') }] }))

const templates = ref<ReviewTemplate[] | null>(null)
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try { templates.value = await listTemplates() }
  catch (e) { error.value = errorMessage(e) }
}
onMounted(load)

const editing = ref<string | null>(null)
const busy = ref(false)
async function run(fn: () => Promise<unknown>, msg: string) {
  busy.value = true
  try { await fn(); toast.add(msg); await load() }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { busy.value = false }
}
const BLANK: TemplateContent = {
  objectives: true,
  competencies: [{ id: 'c1', label: 'Qualité du travail', levels: ['En dessous des attentes.', 'À consolider.', 'Conforme aux attentes.', 'Au-delà des attentes.'] }],
  questions: [{ id: 'q1', label: 'Quelle réalisation de la période retenez-vous ? (un exemple)', roles: ['self', 'manager'] }],
  peer: { competencies: [], questions: [] },
}
async function blank() {
  busy.value = true
  try { const id = await createTemplate(t('tnd32.tpl.newName'), BLANK); await load(); editing.value = id }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { busy.value = false }
}
async function copy(x: ReviewTemplate) {
  busy.value = true
  try { const id = await duplicateTemplate(x); await load(); editing.value = id; toast.add(t('tnd32.tpl.duplicated')) }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { busy.value = false }
}
const archiving = ref<ReviewTemplate | null>(null)
const kindLabel = (k: ReviewTemplate['kind']) => t(`tnd32.tpl.kind.${k}`)
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-row-b wb-wrap">
      <p class="wb-mut2 small">{{ t('tnd32.tpl.libraryIntro') }}</p>
      <WbButton size="sm" icon="plus" :loading="busy" data-action="new-template" @click="blank">{{ t('tnd32.tpl.new') }}</WbButton>
    </div>
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!templates" variant="cards" :count="3" />
    <ul v-else class="wb-tl">
      <li v-for="x in templates" :key="x.id" class="wb-card wb-tl-c" :data-template="x.name">
        <div class="wb-row-b">
          <h2 class="h3">{{ x.name }}</h2>
          <WbBadge size="sm" :tone="x.kind === 'custom' ? 'neutral' : 'info'">{{ kindLabel(x.kind) }}</WbBadge>
        </div>
        <p class="caption wb-mut2">{{ t('tnd32.tpl.summary', { c: x.content.competencies.length, q: x.content.questions.length }) }}<template v-if="x.content.objectives"> · {{ t('tnd32.tpl.withObjectives') }}</template><template v-if="x.content.peer?.competencies.length"> · {{ t('tnd32.tpl.withPeers') }}</template></p>
        <p class="caption wb-mut wb-tl-comps">{{ x.content.competencies.map(c => c.label).join(' · ') }}</p>
        <div class="wb-row wb-wrap wb-tl-a">
          <WbButton size="sm" icon="send" :to="{ path: '/evaluations', query: { modele: x.id } }" data-action="use-template">{{ t('tnd32.tpl.use') }}</WbButton>
          <WbButton variant="secondary" size="sm" icon="pencil" data-action="edit-template" @click="editing = x.id">{{ t('tnd32.tpl.edit') }}</WbButton>
          <WbButton variant="ghost" size="sm" icon="copy" :disabled="busy" data-action="duplicate-template" @click="copy(x)">{{ t('tnd32.tpl.duplicate') }}</WbButton>
          <WbButton variant="ghost" size="sm" icon="trash-2" :disabled="busy" data-action="archive-template" @click="archiving = x">{{ t('tnd32.tpl.archive') }}</WbButton>
        </div>
      </li>
    </ul>

    <ReviewTemplatesPanel v-if="editing && templates" :key="editing" :templates="templates" :initial-id="editing" @close="editing = null" @saved="editing = null; load()" />

    <WbModal v-if="archiving" :title="t('tnd32.tpl.archiveTitle', { name: archiving.name })" :description="t('tnd32.tpl.archiveText')" @close="archiving = null">
      <template #footer>
        <WbButton variant="secondary" @click="archiving = null">{{ t('approvals.cancel') }}</WbButton>
        <WbButton variant="danger" icon="trash-2" :loading="busy" data-action="confirm-archive" @click="run(() => archiveTemplate(archiving!.id), t('tnd32.tpl.archived')); archiving = null">{{ t('tnd32.tpl.archive') }}</WbButton>
      </template>
    </WbModal>
  </div>
</template>

<style scoped>
.wb-tl { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: var(--space-3); }
.wb-tl-c { padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); }
.wb-tl-c h2, .wb-tl-c p { margin: 0; }
.wb-tl-comps { flex: 1; }
.wb-tl-a { gap: 6px; margin-top: var(--space-2); }
.wb-tl-a :deep(.wb-btn) { margin: 0; }
</style>
