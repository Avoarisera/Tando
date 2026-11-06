<script setup lang="ts">
// Candidate follow-up (TND-30 lot 2): private link, no account. Coarse progress
// (never internal stage names or reasons), withdraw, erase my data (GDPR).
definePageMeta({ layout: false })
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const route = useRoute()
const token = String(route.params.token)
type Step = 'received' | 'review' | 'interviews' | 'offer' | 'closed' | 'withdrawn' | 'hired'
interface Track { company: string, first_name: string, job: string, slug: string | null, applied_at: string, step: Step }
const { data, error, refresh } = await useFetch<Track>(`/api/careers/track/${token}`)
useHead({ title: () => t('tnd30.track.title'), meta: [{ name: 'robots', content: 'noindex' }] })

const STEPS: Step[] = ['received', 'review', 'interviews', 'offer']
const reached = computed(() => {
  const s = data.value?.step
  if (!s) return -1
  if (s === 'hired') return STEPS.length
  return STEPS.indexOf(s)
})
const ended = computed(() => ['closed', 'withdrawn', 'hired'].includes(data.value?.step ?? ''))
const confirm = ref<'withdraw' | 'erase' | null>(null)
const busy = ref(false)
const erased = ref(false)
const actionError = ref<string | null>(null)
async function act() {
  actionError.value = null
  busy.value = true
  try {
    await $fetch(`/api/careers/track/${token}/${confirm.value}`, { method: 'POST' })
    if (confirm.value === 'erase') erased.value = true
    else await refresh()
    confirm.value = null
  }
  catch (e) {
    actionError.value = (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? t('tnd30.apply.error')
  }
  finally { busy.value = false }
}
</script>

<template>
  <NuxtLayout name="public" :company="data?.company">
    <div v-if="erased" class="wb-card wb-trk-end" role="status">
      <WbIcon name="circle-check" :size="36" />
      <h1 class="h2">{{ t('tnd30.track.erasedTitle') }}</h1>
      <p>{{ t('tnd30.track.erasedText') }}</p>
    </div>
    <div v-else-if="error || !data" class="wb-card">
      <WbEmptyState art="search" :title="t('tnd30.track.invalidTitle')">{{ t('tnd30.track.invalidText') }}</WbEmptyState>
    </div>
    <div v-else class="wb-stack wb-trk">
      <header class="wb-stack-s">
        <p class="small wb-mut2">{{ t('tnd30.track.hello', { name: data.first_name }) }}</p>
        <h1 class="h2">{{ data.job }}</h1>
        <p class="small wb-mut2">{{ t('tnd30.track.applied', { date: fmtDate(data.applied_at.slice(0, 10), tag, { day: 'numeric', month: 'long', year: 'numeric' }) }) }}</p>
      </header>

      <section class="wb-card wb-trk-card">
        <p v-if="ended" class="wb-trk-msg">{{ t(`tnd30.track.end.${data.step}`, { company: data.company }) }}</p>
        <ol v-else class="wb-trk-steps">
          <li v-for="(s, i) in STEPS" :key="s" :class="{ 'is-done': i < reached, 'is-on': i === reached }">
            <span class="wb-trk-dot"><WbIcon v-if="i < reached" name="check" :size="14" /></span>
            <span><b class="small">{{ t(`tnd30.track.step.${s}`) }}</b><br><span class="caption wb-mut2">{{ t(`tnd30.track.stepHint.${s}`) }}</span></span>
          </li>
        </ol>
      </section>

      <section class="wb-card wb-trk-card wb-stack-s">
        <h2 class="h3">{{ t('tnd30.track.myData') }}</h2>
        <p class="small wb-mut2">{{ t('tnd30.track.myDataText') }}</p>
        <WbBanner v-if="actionError" tone="danger">{{ actionError }}</WbBanner>
        <div class="wb-row wb-wrap wb-trk-act">
          <WbButton v-if="!ended" variant="secondary" size="sm" data-action="withdraw" @click="confirm = 'withdraw'">{{ t('tnd30.track.withdraw') }}</WbButton>
          <WbButton v-if="data.step !== 'hired'" variant="ghost" size="sm" icon="circle-x" data-action="erase" @click="confirm = 'erase'">{{ t('tnd30.track.erase') }}</WbButton>
          <WbButton v-if="data.slug" variant="ghost" size="sm" :to="`/carrieres/${data.slug}`">{{ t('tnd30.track.seeJob') }}</WbButton>
        </div>
      </section>
    </div>

    <WbModal v-if="confirm" tone="danger" :title="t(`tnd30.track.confirm.${confirm}`)" :description="t(`tnd30.track.confirmText.${confirm}`)" @close="confirm = null">
      <template #footer>
        <WbButton variant="secondary" @click="confirm = null">{{ t('approvals.cancel') }}</WbButton>
        <WbButton variant="danger" :loading="busy" data-action="confirm-track" @click="act">{{ t(`tnd30.track.${confirm}`) }}</WbButton>
      </template>
    </WbModal>
  </NuxtLayout>
</template>

<style scoped>
.wb-trk { max-width: 640px; }
.wb-trk h1 { margin: 0; }
.wb-trk header p { margin: 0; }
.wb-trk-card { padding: var(--space-5); }
.wb-trk-card h2 { margin: 0; }
.wb-trk-msg { margin: 0; line-height: 1.6; }
.wb-trk-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-4); position: relative; }
.wb-trk-steps li { display: flex; gap: var(--space-3); align-items: flex-start; color: var(--ink-3, var(--ink-2)); }
.wb-trk-steps li.is-done, .wb-trk-steps li.is-on { color: var(--ink); }
.wb-trk-dot { display: grid; place-items: center; width: 24px; height: 24px; flex: none; border-radius: 50%; border: 2px solid var(--border); background: var(--surface); }
.is-done .wb-trk-dot { border-color: var(--brand); background: var(--brand); color: #fff; }
.is-on .wb-trk-dot { border-color: var(--brand); box-shadow: 0 0 0 4px var(--brand-tint); }
.wb-trk-act { gap: var(--space-2); }
.wb-trk-act :deep(.wb-btn) { margin: 0; }
.wb-trk-end { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); padding: var(--space-8) var(--space-5); text-align: center; }
.wb-trk-end h1, .wb-trk-end p { margin: 0; }
</style>
