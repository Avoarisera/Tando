<script setup lang="ts">
import type { JobTemplate } from '~/utils/recruitment'

// HR — library of job opening templates (TND-32): use, edit, duplicate, archive, new
definePageMeta({ titleKey: 'nav.recruitment', layout: 'private', middleware: 'recruiter-access' })
const { t } = useI18n()
const toast = useToast()
const { listJobTemplates, saveJobTemplate, archiveJobTemplate } = useRecruitment()
usePageHeader(() => ({ crumbs: [{ label: t('nav.recruitment'), to: '/recrutement' }, { label: t('tnd32.job.library') }] }))

const items = ref<JobTemplate[] | null>(null)
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try { items.value = await listJobTemplates() }
  catch (e) { error.value = errorMessage(e) }
}
onMounted(load)

const busy = ref(false)
async function create(from?: JobTemplate) {
  busy.value = true
  try {
    const id = await saveJobTemplate(null, from ? `${from.name} (copie)` : t('tnd32.tpl.newName'), from ? JSON.parse(JSON.stringify(from.content)) : {})
    if (from) toast.add(t('tnd32.tpl.duplicated'))
    await navigateTo(`/recrutement/modeles/${id}`)
  }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { busy.value = false }
}
const archiving = ref<JobTemplate | null>(null)
async function archive() {
  if (!archiving.value) return
  busy.value = true
  try { await archiveJobTemplate(archiving.value.id); toast.add(t('tnd32.tpl.archived')); archiving.value = null; await load() }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { busy.value = false }
}
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-row-b wb-wrap">
      <p class="wb-mut2 small">{{ t('tnd32.job.libraryIntro') }}</p>
      <WbButton size="sm" icon="plus" :loading="busy" data-action="new-job-template" @click="create()">{{ t('tnd32.tpl.new') }}</WbButton>
    </div>
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!items" variant="cards" :count="3" />
    <div v-else-if="!items.length" class="wb-card"><WbEmptyState art="inbox" :title="t('tnd32.job.emptyTitle')">{{ t('tnd32.job.emptyText') }}</WbEmptyState></div>
    <ul v-else class="wb-tl">
      <li v-for="x in items" :key="x.id" class="wb-card wb-tl-c" :data-job-template="x.name">
        <h2 class="h3">{{ x.name }}</h2>
        <p class="caption wb-mut2">
          <template v-if="x.content.contract_type">{{ t(`tnd30.contract.${x.content.contract_type}`) }}</template>
          <template v-if="x.content.remote"> · {{ t(`tnd30.remote.${x.content.remote}`) }}</template>
          <template v-if="x.content.process_steps?.length"> · {{ t('tnd32.job.steps', { n: x.content.process_steps.length }, x.content.process_steps.length) }}</template>
        </p>
        <p class="small wb-tl-sum">{{ x.content.summary || t('tnd32.job.noSummary') }}</p>
        <div class="wb-row wb-wrap wb-tl-a">
          <WbButton size="sm" icon="send" :to="{ path: '/recrutement/nouvelle', query: { modele: x.id } }" data-action="use-job-template">{{ t('tnd32.tpl.use') }}</WbButton>
          <WbButton variant="secondary" size="sm" icon="pencil" :to="`/recrutement/modeles/${x.id}`" data-action="edit-job-template">{{ t('tnd32.tpl.edit') }}</WbButton>
          <WbButton variant="ghost" size="sm" icon="copy" :disabled="busy" @click="create(x)">{{ t('tnd32.tpl.duplicate') }}</WbButton>
          <WbButton variant="ghost" size="sm" icon="trash-2" :disabled="busy" @click="archiving = x">{{ t('tnd32.tpl.archive') }}</WbButton>
        </div>
      </li>
    </ul>

    <WbModal v-if="archiving" :title="t('tnd32.tpl.archiveTitle', { name: archiving.name })" :description="t('tnd32.job.archiveText')" @close="archiving = null">
      <template #footer>
        <WbButton variant="secondary" @click="archiving = null">{{ t('approvals.cancel') }}</WbButton>
        <WbButton variant="danger" icon="trash-2" :loading="busy" @click="archive">{{ t('tnd32.tpl.archive') }}</WbButton>
      </template>
    </WbModal>
  </div>
</template>

<style scoped>
.wb-tl { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: var(--space-3); }
.wb-tl-c { padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); }
.wb-tl-c h2, .wb-tl-c p { margin: 0; }
.wb-tl-sum { flex: 1; color: var(--ink-2); }
.wb-tl-a { gap: 6px; margin-top: var(--space-2); }
.wb-tl-a :deep(.wb-btn) { margin: 0; }
</style>
