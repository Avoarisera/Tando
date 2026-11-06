<script setup lang="ts">
import type { Opening, OpeningStatus } from '~/utils/recruitment'

// Recruitment home (TND-30): openings with their pipeline at a glance
definePageMeta({ titleKey: 'nav.recruitment', layout: 'private', middleware: 'recruiter-access' })
const { t } = useI18n()
const { isRecruiter } = useCurrentUser()
const { listOpenings } = useRecruitment()

const openings = ref<(Opening & { teams: { name: string } | null })[]>([])
const apps = ref<{ opening_id: string, stage: string, status: string, created_at: string }[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
async function load() {
  isLoading.value = true
  error.value = null
  try { ({ openings: openings.value, apps: apps.value } = await listOpenings()) }
  catch (e) { error.value = errorMessage(e) }
  finally { isLoading.value = false }
}
onMounted(load)

const filter = ref<'open' | 'draft' | 'closed'>('open')
const groupOf = (s: OpeningStatus) => (s === 'published' || s === 'paused' ? 'open' : s === 'draft' ? 'draft' : 'closed')
const tabs = computed(() => (['open', 'draft', 'closed'] as const).map(id => ({ id, label: t(`tnd30.list.${id}`), count: openings.value.filter(o => groupOf(o.status) === id).length })))
const shown = computed(() => openings.value.filter(o => groupOf(o.status) === filter.value))

const weekAgo = Date.now() - 7 * 86_400_000
function statsOf(o: Opening) {
  const mine = apps.value.filter(a => a.opening_id === o.id)
  const active = mine.filter(a => a.status === 'active' || a.status === 'hired')
  const byStage = o.stages.filter(s => s.key !== 'hired').map(s => ({ ...s, n: active.filter(a => a.stage === s.key).length }))
  return { total: mine.length, active: active.length, fresh: mine.filter(a => Date.parse(a.created_at) > weekAgo).length, byStage, hired: mine.filter(a => a.status === 'hired').length }
}
const kpis = computed(() => ({
  published: openings.value.filter(o => o.status === 'published').length,
  active: apps.value.filter(a => a.status === 'active').length,
  fresh: apps.value.filter(a => Date.parse(a.created_at) > weekAgo).length,
}))
const tone = (s: OpeningStatus) => (s === 'published' ? 'success' : s === 'paused' ? 'warning' : 'neutral') as 'success' | 'warning' | 'neutral'
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-row-b wb-wrap">
      <WbTabs v-model="filter" :tabs="tabs" :label="t('nav.recruitment')" />
      <div class="wb-row wb-wrap" style="gap: 8px">
        <WbButton variant="secondary" size="sm" icon="external-link" to="/carrieres" target="_blank">{{ t('tnd30.list.careersPage') }}</WbButton>
        <WbButton v-if="isRecruiter" size="sm" icon="plus" to="/recrutement/nouvelle" data-action="new-opening">{{ t('tnd30.list.new') }}</WbButton>
      </div>
    </div>

    <section class="wb-card wb-rc-kpis" :aria-label="t('tnd30.list.kpis')">
      <div><span class="small wb-mut2">{{ t('tnd30.list.kPublished') }}</span><b class="display wb-num">{{ kpis.published }}</b></div>
      <div><span class="small wb-mut2">{{ t('tnd30.list.kActive') }}</span><b class="display wb-num">{{ kpis.active }}</b></div>
      <div><span class="small wb-mut2">{{ t('tnd30.list.kFresh') }}</span><b :class="['display', 'wb-num', { 'wb-c-info': kpis.fresh }]">{{ kpis.fresh }}</b></div>
    </section>

    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="isLoading" variant="metric" :count="3" />
    <div v-else-if="!openings.length" class="wb-card">
      <WbEmptyState art="search" :title="t('tnd30.list.emptyTitle')">
        {{ isRecruiter ? t('tnd30.list.emptyText') : t('tnd30.list.emptyManager') }}
        <template v-if="isRecruiter" #action><WbButton icon="plus" to="/recrutement/nouvelle">{{ t('tnd30.list.new') }}</WbButton></template>
      </WbEmptyState>
    </div>
    <p v-else-if="!shown.length" class="wb-card wb-card-b wb-mut">{{ t('tnd30.list.none') }}</p>
    <ul v-else class="wb-rc-list">
      <li v-for="o in shown" :key="o.id">
        <NuxtLink :to="`/recrutement/${o.id}`" class="wb-card wb-rc-o" :data-opening="o.title">
          <div class="wb-rc-h">
            <div class="wb-grow">
              <h2 class="h3">{{ o.title }}</h2>
              <p class="caption wb-mut2">{{ [o.teams?.name, o.location, t(`tnd30.contract.${o.contract_type}`)].filter(Boolean).join(' · ') }}</p>
            </div>
            <WbBadge v-if="statsOf(o).fresh" tone="info" size="sm">{{ t('tnd30.list.fresh', { n: statsOf(o).fresh }, statsOf(o).fresh) }}</WbBadge>
            <WbBadge :tone="tone(o.status)" size="sm">{{ t(`tnd30.status.${o.status}`) }}</WbBadge>
          </div>
          <ol class="wb-rc-pipe" :aria-label="t('tnd30.list.pipeline')">
            <li v-for="s in statsOf(o).byStage" :key="s.key" :class="{ 'is-on': s.n }"><b class="wb-num">{{ s.n }}</b><span class="caption2">{{ s.label }}</span></li>
          </ol>
          <p class="caption wb-mut">{{ t('tnd30.list.summary', { n: statsOf(o).total, hired: statsOf(o).hired }, statsOf(o).total) }}</p>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.wb-rc-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; }
.wb-rc-kpis > div { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3) var(--space-5); }
.wb-rc-kpis > div + div { border-left: 1px solid var(--border); }
.wb-rc-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: var(--space-3); }
.wb-rc-o { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); color: inherit; text-decoration: none; height: 100%; transition: border-color .15s, box-shadow .15s; }
.wb-rc-o:hover { border-color: var(--brand); box-shadow: var(--shadow-2); }
.wb-rc-h { display: flex; gap: var(--space-2); align-items: flex-start; }
.wb-rc-h h2, .wb-rc-h p, .wb-rc-o > p { margin: 0; }
.wb-rc-pipe { list-style: none; margin: 0; padding: 0; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; }
.wb-rc-pipe li { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px; border-radius: var(--radius-sm, 6px); background: var(--surface-2); color: var(--ink-3, var(--ink-2)); text-align: center; min-width: 0; }
.wb-rc-pipe li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.wb-rc-pipe li.is-on { background: var(--brand-tint); color: var(--brand-text); }
@container wbapp (max-width: 767px) {
  .wb-rc-kpis > div { padding: var(--space-3); }
}
</style>
