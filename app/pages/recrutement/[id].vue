<script setup lang="ts">
import type { ApplicationRow } from '~/composables/useRecruitment'
import type { JobTemplateContent, Opening } from '~/utils/recruitment'
import { isAnonymous, sourceLabel } from '~/utils/recruitment'
import { pseudonym } from '~/utils/recruit-stats'

// One opening (TND-30): candidates by stage (drag & drop) and the opening editor.
// `/recrutement/nouvelle` opens the editor for a new opening.
definePageMeta({ titleKey: 'nav.recruitment', layout: 'private', middleware: 'recruiter-access', key: r => String(r.params.id) })
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { isRecruiter, profile } = useCurrentUser()
const { getOpening, listApplications, moveStage, getJobTemplate } = useRecruitment()

const id = String(route.params.id)
const isNew = id === 'nouvelle'
const opening = ref<Opening | null>(null)
const apps = ref<ApplicationRow[]>([])
const isLoading = ref(!isNew)
const error = ref<string | null>(null)
// « Nouvelle offre » from a template (TND-32): /recrutement/nouvelle?modele=<id>
const prefill = ref<JobTemplateContent | null>(null)
const prefillReady = ref(!(isNew && typeof route.query.modele === 'string'))
async function load() {
  if (isNew) {
    if (!prefillReady.value) {
      try { prefill.value = (await getJobTemplate(String(route.query.modele)))?.content ?? null }
      catch (e) { toast.add(errorMessage(e), 'error') }
      finally { prefillReady.value = true }
    }
    return
  }
  isLoading.value = true
  error.value = null
  try {
    const [o, a] = await Promise.all([getOpening(id), listApplications(id)])
    if (!o) throw new Error(t('tnd30.detail.notFound'))
    opening.value = o
    apps.value = a
  }
  catch (e) { error.value = errorMessage(e) }
  finally { isLoading.value = false }
}
onMounted(load)

usePageHeader(() => ({ crumbs: [{ label: t('nav.recruitment'), to: '/recrutement' }, { label: isNew ? t('tnd30.list.new') : opening.value?.title ?? '…' }] }))

type Tab = 'pipeline' | 'opening'
const tab = ref<Tab>(isNew ? 'opening' : (route.query.tab === 'offre' ? 'opening' : 'pipeline'))
const tabs = computed(() => [
  { id: 'pipeline', label: t('tnd30.detail.pipeline'), count: apps.value.filter(a => a.status === 'active').length },
  ...(isRecruiter.value ? [{ id: 'opening', label: t('tnd30.detail.opening') }] : []),
])

// HR or the hiring manager manage the pipeline; an invited interviewer only reads and scores
const canManage = computed(() => isRecruiter.value || (!!opening.value && opening.value.hiring_manager_id === profile.value?.id))

// ── Pipeline ────────────────────────────────────────────────────────────────
const search = ref('')
const showDeclined = ref(false)
const visible = computed(() => apps.value.filter(a =>
  (showDeclined.value ? true : a.status === 'active' || a.status === 'hired')
  && textMatch(`${a.candidates?.first_name ?? ''} ${a.candidates?.last_name ?? ''} ${a.candidates?.email ?? ''}`, search.value)))
const columns = computed(() => (opening.value?.stages ?? []).map(s => ({ ...s, items: visible.value.filter(a => a.stage === s.key) })))
const declinedCount = computed(() => apps.value.filter(a => a.status === 'rejected').length)

const openId = ref<string | null>(typeof route.query.a === 'string' ? route.query.a : null)
const openApp = computed(() => apps.value.find(a => a.id === openId.value) ?? null)
watch(openId, (v) => { router.replace({ query: { ...route.query, a: v ?? undefined } }) })

const dragId = ref<string | null>(null)
const overCol = ref<string | null>(null)
async function drop(stage: string) {
  const a = apps.value.find(x => x.id === dragId.value)
  overCol.value = null
  dragId.value = null
  if (!a || a.stage === stage || a.status === 'rejected' || !canManage.value) return
  if (stage === 'hired' && !isRecruiter.value) { toast.add(t('tnd30.detail.hiredRecruiterOnly'), 'error'); return }
  const prev = a.stage
  a.stage = stage // optimistic
  try { await moveStage(a.id, stage) }
  catch (e) { a.stage = prev; toast.add(errorMessage(e), 'error') }
}
const displayName = (a: ApplicationRow) => (isAnonymous(opening.value, a) ? t('tnd30.anon.name', { id: pseudonym(a.id) }) : `${a.candidates?.first_name ?? ''} ${a.candidates?.last_name ?? ''}`)

// share links per source (counted in the statistics)
const sharing = ref(false)
const SOURCES = ['linkedin', 'indeed', 'welcome', 'referral'] as const
const shareUrl = (src: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/carrieres/${opening.value?.slug}?source=${src}`
async function copy(src: string) {
  try { await navigator.clipboard.writeText(shareUrl(src)); toast.add(t('tnd30.share.copied')) }
  catch { toast.add(shareUrl(src)) }
}
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return d <= 0 ? t('tnd30.detail.today') : t('tnd30.detail.daysAgo', { n: d }, d)
}
async function onSaved(newId: string) {
  if (isNew) await navigateTo(`/recrutement/${newId}?tab=offre`, { replace: true })
  else await load()
}
</script>

<template>
  <div class="wb-page wb-stack">
    <template v-if="!isNew">
      <WbErrorState v-if="error" :message="error" @retry="load" />
      <WbSkeleton v-else-if="isLoading" variant="table" />
    </template>

    <template v-if="isNew || opening">
      <div v-if="!isNew" class="wb-row-b wb-wrap">
        <WbTabs v-model="tab" :tabs="tabs" :label="opening?.title ?? ''" />
        <div class="wb-row wb-wrap" style="gap: 8px">
          <WbBadge :tone="opening?.status === 'published' ? 'success' : opening?.status === 'paused' ? 'warning' : 'neutral'">{{ t(`tnd30.status.${opening?.status}`) }}</WbBadge>
          <WbButton v-if="opening?.status === 'published'" variant="secondary" size="sm" icon="external-link" :to="`/carrieres/${opening.slug}`" target="_blank">{{ t('tnd30.detail.seePublic') }}</WbButton>
          <WbButton v-if="opening?.status === 'published' && canManage" variant="secondary" size="sm" icon="send" data-action="share" @click="sharing = true">{{ t('tnd30.share.button') }}</WbButton>
        </div>
      </div>

      <OpeningEditor v-if="tab === 'opening' && prefillReady" :key="opening?.updated_at ?? 'new'" :opening="opening" :prefill="prefill" @saved="onSaved" />

      <template v-else-if="opening">
        <div class="wb-row wb-wrap wb-pp-f">
          <WbInput v-model="search" class="wb-pp-search" icon="search" type="search" :aria-label="t('tnd26.search')" :placeholder="t('tnd30.detail.search')" />
          <WbFilterChip v-if="declinedCount" v-model="showDeclined">{{ t('tnd30.detail.showDeclined', { n: declinedCount }) }}</WbFilterChip>
          <span class="caption wb-mut wb-grow wb-pp-hint">{{ canManage ? t('tnd30.detail.dragHint') : t('tnd30.detail.interviewerHint') }}</span>
        </div>
        <div v-if="!apps.length" class="wb-card">
          <WbEmptyState art="inbox" :title="t('tnd30.detail.emptyTitle')">
            {{ opening.status === 'published' ? t('tnd30.detail.emptyPublished') : t('tnd30.detail.emptyDraft') }}
          </WbEmptyState>
        </div>
        <div v-else class="wb-scroll wb-pp">
          <section
            v-for="col in columns"
            :key="col.key"
            :class="['wb-pp-col', { 'is-over': overCol === col.key }]"
            :data-stage="col.key"
            @dragover.prevent="overCol = col.key"
            @dragleave="overCol = overCol === col.key ? null : overCol"
            @drop.prevent="drop(col.key)"
          >
            <header class="wb-pp-ch"><span class="small"><b>{{ col.label }}</b></span><span class="caption wb-mut2 wb-num">{{ col.items.length }}</span></header>
            <ul class="wb-pp-cards">
              <li v-for="a in col.items" :key="a.id">
                <button
                  type="button"
                  :class="['wb-pp-card', { 'is-rej': a.status === 'rejected', 'is-open': openId === a.id }]"
                  :draggable="canManage && a.status !== 'rejected'"
                  :data-id="a.id"
                  @dragstart="dragId = a.id"
                  @click="openId = a.id"
                >
                  <WbAvatar :name="displayName(a)" :size="28" />
                  <span class="wb-grow wb-pp-t">
                    <b class="small">{{ displayName(a) }}</b>
                    <span class="caption wb-mut2">{{ ago(a.created_at) }}<template v-if="a.source !== 'careers'"> · {{ sourceLabel(a.source) }}</template></span>
                  </span>
                  <WbBadge v-if="a.status === 'rejected'" tone="danger" size="sm">{{ t('tnd30.appStatus.rejected') }}</WbBadge>
                  <WbIcon v-else-if="a.application_files.some(f => f.kind === 'cover_letter') || a.cover_letter_text" name="file-text" :size="14" class="wb-mut2" :title="t('tnd30.panel.letter')" />
                </button>
              </li>
            </ul>
          </section>
        </div>
      </template>
    </template>

    <WbModal v-if="sharing && opening" :title="t('tnd30.share.title')" :description="t('tnd30.share.text')" @close="sharing = false">
      <ul class="wb-list wb-share">
        <li v-for="s in SOURCES" :key="s">
          <span class="wb-grow"><b class="small">{{ t(`tnd30.share.src.${s}`) }}</b><br><code class="caption wb-mut2">{{ shareUrl(s) }}</code></span>
          <WbButton variant="secondary" size="sm" @click="copy(s)">{{ t('tnd30.share.copy') }}</WbButton>
        </li>
      </ul>
    </WbModal>

    <CandidatePanel v-if="openApp && opening" :app="openApp" :opening="opening" :can-manage="canManage" @close="openId = null" @changed="load" />
  </div>
</template>

<style scoped>
.wb-pp-f { gap: var(--space-3); align-items: center; }
.wb-pp-search { max-width: 320px; }
.wb-pp-hint { text-align: right; }
/* Kanban: one column per stage, scrolls sideways inside the page */
.wb-pp { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(210px, 1fr); gap: var(--space-3); padding-bottom: var(--space-2); align-items: start; }
.wb-pp-col { display: flex; flex-direction: column; gap: var(--space-2); min-height: 200px; padding: var(--space-2); border-radius: var(--radius-lg); background: var(--surface-2); border: 1.5px dashed transparent; }
.wb-pp-col.is-over { border-color: var(--brand); background: var(--brand-tint); }
.wb-pp-ch { display: flex; justify-content: space-between; align-items: center; padding: 4px var(--space-2); }
.wb-pp-cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.wb-pp-card { width: 100%; display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); color: inherit; font: inherit; text-align: left; cursor: grab; }
.wb-pp-card:hover, .wb-pp-card.is-open { border-color: var(--brand); }
.wb-pp-card:focus-visible { outline: 2px solid var(--focus); }
.wb-pp-card.is-rej { opacity: .6; cursor: pointer; }
.wb-pp-t { display: flex; flex-direction: column; min-width: 0; }
.wb-pp-t > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@container wbapp (max-width: 767px) {
  .wb-pp-hint { display: none; }
}
</style>
