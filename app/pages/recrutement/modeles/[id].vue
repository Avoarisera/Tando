<script setup lang="ts">
import type { JobTemplate } from '~/utils/recruitment'

// HR — edit one job opening template (TND-32): the opening editor in template mode
definePageMeta({ titleKey: 'nav.recruitment', layout: 'private', middleware: 'recruiter-access', key: r => String(r.params.id) })
const { t } = useI18n()
const route = useRoute()
const id = String(route.params.id)
const { getJobTemplate } = useRecruitment()
const tpl = ref<JobTemplate | null>(null)
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try {
    tpl.value = await getJobTemplate(id)
    if (!tpl.value) throw new Error(t('tnd32.job.notFound'))
  }
  catch (e) { error.value = errorMessage(e) }
}
onMounted(load)
usePageHeader(() => ({ crumbs: [{ label: t('nav.recruitment'), to: '/recrutement' }, { label: t('tnd32.job.library'), to: '/recrutement/modeles' }, { label: tpl.value?.name ?? '…' }] }))
</script>

<template>
  <div class="wb-page wb-stack">
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!tpl" variant="table" />
    <template v-else>
      <p class="wb-why small"><WbIcon name="info" :size="14" /> {{ t('tnd32.job.editHint') }}</p>
      <OpeningEditor :key="tpl.updated_at" :opening="null" :template="tpl" @saved="navigateTo('/recrutement/modeles')" />
    </template>
  </div>
</template>
