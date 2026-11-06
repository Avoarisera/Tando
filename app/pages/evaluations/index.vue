<script setup lang="ts">
import type { ReviewCycle, ReviewTemplate } from '~/composables/useReviews'

// HR — review campaigns (TND-29): progress of each one, new campaign, templates
definePageMeta({ titleKey: 'nav.evaluations', layout: 'private', middleware: 'hr-access' })
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const { profile } = useCurrentUser()
const { listCycles, listTemplates, createCycle } = useReviews()

const data = ref<Awaited<ReturnType<typeof listCycles>> | null>(null)
const templates = ref<ReviewTemplate[]>([])
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try { [data.value, templates.value] = await Promise.all([listCycles(), listTemplates()]) }
  catch (e) { error.value = errorMessage(e) }
}
onMounted(load)

function progress(c: ReviewCycle) {
  const packets = (data.value?.packets ?? []).filter(p => p.cycle_id === c.id)
  const ids = new Set(packets.map(p => p.id))
  const sub = (data.value?.submitted ?? []).filter(s => ids.has(s.packet_id))
  const withMgr = packets.filter(p => p.manager_id).length
  return {
    n: packets.length,
    self: sub.filter(s => s.role === 'self').length,
    manager: sub.filter(s => s.role === 'manager').length,
    withMgr,
    hr: packets.filter(p => p.hr_done_at).length,
    shared: packets.filter(p => p.shared_at).length,
  }
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const fmt = (d: string | null) => (d ? fmtShort(d, tag.value) : '—')
const tone = (s: ReviewCycle['status']) => (s === 'active' ? 'success' : s === 'draft' ? 'neutral' : 'indigo') as 'success' | 'neutral' | 'indigo'

// New campaign
const creating = ref(false)
const year = new Date().getFullYear()
const form = reactive({ name: `Revue annuelle ${year}`, period_start: `${year}-01-01`, period_end: `${year}-12-31`, template_id: '', self_due: '', manager_due: '', hr_due: '', peers_enabled: true, peer_due: '' })
const formError = ref<string | null>(null)
const saving = ref(false)
const templateOptions = computed(() => templates.value.map(x => ({ value: x.id, label: x.name })))
// the templates may arrive after the panel opened: default to the first one
watch(templates, (list) => { if (!form.template_id && list[0]) form.template_id = list[0].id })
function openNew() {
  form.template_id = templates.value[0]?.id ?? ''
  const d = (n: number) => addDays(todayIso(), n)
  Object.assign(form, { self_due: d(14), manager_due: d(21), hr_due: d(30), peer_due: d(18) })
  formError.value = null
  creating.value = true
}
async function create() {
  formError.value = null
  if (form.name.trim().length < 2) { formError.value = t('tnd29.cycle.nameRequired'); return }
  if (!form.template_id) { formError.value = t('tnd29.cycle.templateRequired'); return }
  if (form.period_end < form.period_start) { formError.value = t('tnd29.cycle.periodOrder'); return }
  saving.value = true
  try {
    const id = await createCycle({ name: form.name.trim(), period_start: form.period_start, period_end: form.period_end, template_id: form.template_id, self_due: form.self_due || null, manager_due: form.manager_due || null, hr_due: form.hr_due || null, peers_enabled: form.peers_enabled, peer_due: form.peers_enabled ? (form.peer_due || null) : null }, profile.value!.id)
    toast.add(t('tnd29.cycle.created'))
    await navigateTo(`/evaluations/campagne/${id}`)
  }
  catch (e) { formError.value = errorMessage(e) }
  finally { saving.value = false }
}
const editingTemplates = ref(false)
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-row-b wb-wrap">
      <p class="wb-mut2 small wb-ev-intro">{{ t('tnd29.list.intro') }}</p>
      <div class="wb-row wb-wrap" style="gap: 8px">
        <WbButton variant="secondary" size="sm" icon="file-text" data-action="templates" @click="editingTemplates = true">{{ t('tnd29.tpl.title') }}</WbButton>
        <WbButton size="sm" icon="plus" data-action="new-cycle" @click="openNew">{{ t('tnd29.list.new') }}</WbButton>
      </div>
    </div>

    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!data" variant="metric" :count="2" />
    <div v-else-if="!data.cycles.length" class="wb-card">
      <WbEmptyState art="inbox" :title="t('tnd29.list.emptyTitle')">
        {{ t('tnd29.list.emptyText') }}
        <template #action><WbButton icon="plus" @click="openNew">{{ t('tnd29.list.new') }}</WbButton></template>
      </WbEmptyState>
    </div>
    <ul v-else class="wb-ev-list">
      <li v-for="c in data.cycles" :key="c.id">
        <NuxtLink :to="`/evaluations/campagne/${c.id}`" class="wb-card wb-ev-c" :data-cycle="c.name">
          <div class="wb-row-b wb-wrap">
            <div>
              <h2 class="h3">{{ c.name }}</h2>
              <p class="caption wb-mut2">{{ formatPeriod(c.period_start, c.period_end, tag) }}<template v-if="c.self_due"> · {{ t('tnd29.list.due', { date: fmt(c.self_due) }) }}</template></p>
            </div>
            <WbBadge :tone="tone(c.status)" size="sm">{{ t(`tnd29.status.${c.status}`) }}</WbBadge>
          </div>
          <template v-if="c.status !== 'draft'">
            <ol class="wb-ev-prog">
              <li><span class="caption">{{ t('tnd29.step.self') }}</span><span class="wb-ev-bar"><i :style="{ width: `${pct(progress(c).self, progress(c).n)}%` }" /></span><b class="caption wb-num">{{ progress(c).self }}/{{ progress(c).n }}</b></li>
              <li><span class="caption">{{ t('tnd29.step.manager') }}</span><span class="wb-ev-bar"><i :style="{ width: `${pct(progress(c).manager, progress(c).withMgr)}%` }" /></span><b class="caption wb-num">{{ progress(c).manager }}/{{ progress(c).withMgr }}</b></li>
              <li><span class="caption">{{ t('tnd29.step.hr') }}</span><span class="wb-ev-bar"><i :style="{ width: `${pct(progress(c).hr, progress(c).n)}%` }" /></span><b class="caption wb-num">{{ progress(c).hr }}/{{ progress(c).n }}</b></li>
              <li><span class="caption">{{ t('tnd29.step.shared') }}</span><span class="wb-ev-bar"><i :style="{ width: `${pct(progress(c).shared, progress(c).n)}%` }" /></span><b class="caption wb-num">{{ progress(c).shared }}/{{ progress(c).n }}</b></li>
            </ol>
          </template>
          <p v-else class="caption wb-mut">{{ t('tnd29.list.draftHint') }}</p>
        </NuxtLink>
      </li>
    </ul>

    <WbSidePanel v-if="creating" :title="t('tnd29.list.new')" :subtitle="t('tnd29.cycle.hint')" @close="creating = false">
      <form class="wb-stack" novalidate @submit.prevent="create">
        <WbBanner v-if="formError" tone="danger">{{ formError }}</WbBanner>
        <WbInput id="cy-name" v-model="form.name" :label="t('tnd29.cycle.name')" maxlength="120" required />
        <WbSelect id="cy-tpl" v-model="form.template_id" :label="t('tnd29.cycle.template')" :options="templateOptions" />
        <div class="wb-grid wb-cols-2" style="gap: 16px">
          <WbInput id="cy-start" v-model="form.period_start" type="date" :label="t('tnd29.cycle.periodStart')" />
          <WbInput id="cy-end" v-model="form.period_end" type="date" :label="t('tnd29.cycle.periodEnd')" />
        </div>
        <p class="small wb-mut2">{{ t('tnd29.cycle.duesHint') }}</p>
        <div class="wb-grid wb-cols-2" style="gap: 16px">
          <WbInput id="cy-self" v-model="form.self_due" type="date" :label="t('tnd29.cycle.selfDue')" />
          <WbInput id="cy-mgr" v-model="form.manager_due" type="date" :label="t('tnd29.cycle.managerDue')" />
          <WbInput id="cy-hr" v-model="form.hr_due" type="date" :label="t('tnd29.cycle.hrDue')" />
          <WbInput v-if="form.peers_enabled" id="cy-peer" v-model="form.peer_due" type="date" :label="t('tnd29.cycle.peerDue')" />
        </div>
        <div class="wb-stack-s">
          <WbCheckbox v-model="form.peers_enabled" :label="t('tnd29.cycle.peers')" />
          <p class="caption wb-mut">{{ t('tnd29.cycle.peersHint') }}</p>
        </div>
        <div class="wb-panel-f"><WbButton type="submit" block :loading="saving" data-action="create-cycle">{{ t('tnd29.cycle.create') }}</WbButton></div>
      </form>
    </WbSidePanel>

    <ReviewTemplatesPanel v-if="editingTemplates" :templates="templates" @close="editingTemplates = false" @saved="load" />
  </div>
</template>

<style scoped>
.wb-ev-intro { max-width: 640px; margin: 0; }
.wb-ev-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: var(--space-3); }
.wb-ev-c { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); color: inherit; text-decoration: none; height: 100%; transition: border-color .15s, box-shadow .15s; }
.wb-ev-c:hover { border-color: var(--brand); box-shadow: var(--shadow-2); }
.wb-ev-c h2, .wb-ev-c p { margin: 0; }
.wb-ev-prog { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.wb-ev-prog li { display: grid; grid-template-columns: 110px minmax(0, 1fr) 48px; gap: var(--space-2); align-items: center; }
.wb-ev-bar { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.wb-ev-bar i { display: block; height: 100%; border-radius: 4px; background: var(--chart-1); }
.wb-ev-prog b { text-align: right; }
</style>
