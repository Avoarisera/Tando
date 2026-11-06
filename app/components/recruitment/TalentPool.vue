<script setup lang="ts">
import type { PoolRow } from '~/composables/useRecruitment'

/**
 * TND-30 lot 3 — talent pool: candidates who agreed to be kept (2 years at most),
 * one line per person (their latest application). « Proposer pour une offre »
 * creates an application on another opening with a copy of their files.
 */
const props = defineProps<{
  apps: readonly PoolRow[]
  openings: readonly { id: string, title: string, status: string }[]
}>()
const emit = defineEmits<{ changed: [] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const { propose, purge } = useRecruitment()

// GDPR purge (daily, automatic) — last run, and run it now
const lastPurge = ref<{ last_run_at: string, result: { applications?: number } } | null>(null)
const purging = ref(false)
onMounted(async () => { try { lastPurge.value = (await purge(true)).last } catch { /* read-only info */ } })
async function purgeNow() {
  purging.value = true
  try {
    lastPurge.value = (await purge(false)).last
    toast.add(t('tnd30.purge.done', { n: lastPurge.value?.result.applications ?? 0 }, lastPurge.value?.result.applications ?? 0))
    emit('changed')
  }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { purging.value = false }
}
const fmtTime = (iso: string) => new Intl.DateTimeFormat(tag.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

const search = ref('')
const people = computed(() => {
  const latest = new Map<string, PoolRow>()
  for (const a of props.apps) {
    if (!a.consent_pool || !a.candidates || a.status === 'hired') continue
    const cur = latest.get(a.candidates.id)
    if (!cur || a.created_at > cur.created_at) latest.set(a.candidates.id, a)
  }
  return [...latest.values()]
    .filter(a => textMatch(`${a.candidates!.first_name} ${a.candidates!.last_name} ${a.candidates!.email}`, search.value))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
})
const titleOf = (id: string) => props.openings.find(o => o.id === id)?.title ?? '—'
const openTargets = computed(() => props.openings.filter(o => o.status === 'published' || o.status === 'paused' || o.status === 'draft'))

const proposing = ref<PoolRow | null>(null)
const target = ref('')
const targetOptions = computed(() => openTargets.value.filter(o => o.id !== proposing.value?.opening_id).map(o => ({ value: o.id, label: o.title })))
const busy = ref(false)
function start(a: PoolRow) {
  proposing.value = a
  target.value = targetOptions.value[0]?.value ?? ''
}
async function confirm() {
  if (!proposing.value || !target.value) return
  busy.value = true
  try {
    const r = await propose(proposing.value.id, target.value)
    toast.add(t('tnd30.pool.proposed', { who: proposing.value.candidates?.first_name ?? '', job: titleOf(r.opening_id) }))
    proposing.value = null
    emit('changed')
  }
  catch (e) {
    toast.add((e as { data?: { statusMessage?: string } }).data?.statusMessage ?? errorMessage(e), 'error')
  }
  finally { busy.value = false }
}
</script>

<template>
  <section class="wb-card wb-tp">
    <header class="wb-card-h wb-row-b wb-wrap">
      <div>
        <h2 class="h2">{{ t('tnd30.pool.title') }}</h2>
        <p class="small wb-mut2">{{ t('tnd30.pool.sub', { n: people.length }, people.length) }}</p>
      </div>
      <WbInput v-model="search" class="wb-tp-search" icon="search" type="search" :aria-label="t('tnd30.detail.search')" :placeholder="t('tnd30.detail.search')" />
    </header>
    <div class="wb-card-b">
      <p v-if="!people.length" class="wb-mut">{{ t('tnd30.pool.empty') }}</p>
      <div v-else class="wb-scroll wb-dt">
        <table>
          <caption class="wb-sr">{{ t('tnd30.pool.title') }}</caption>
          <thead><tr><th>{{ t('tnd26.person') }}</th><th>{{ t('tnd30.pool.lastJob') }}</th><th>{{ t('tnd30.pool.outcome') }}</th><th>{{ t('tnd30.pool.date') }}</th><th class="is-r" /></tr></thead>
          <tbody>
            <tr v-for="a in people" :key="a.id" :data-id="a.id">
              <td><span class="wb-cp"><WbAvatar :name="`${a.candidates!.first_name} ${a.candidates!.last_name}`" :size="26" /><span><b class="small">{{ a.candidates!.first_name }} {{ a.candidates!.last_name }}</b><br><span class="caption wb-mut2">{{ a.candidates!.email }}</span></span></span></td>
              <td class="small"><NuxtLink :to="{ path: `/recrutement/${a.opening_id}`, query: { a: a.id } }">{{ titleOf(a.opening_id) }}</NuxtLink></td>
              <td><WbBadge size="sm" :tone="a.status === 'active' ? 'info' : 'neutral'">{{ t(`tnd30.appStatus.${a.status}`) }}</WbBadge></td>
              <td class="small wb-num">{{ fmtShort(a.created_at.slice(0, 10), tag) }}</td>
              <td class="is-r"><WbButton variant="ghost" size="sm" icon="send" :disabled="!openTargets.length" data-action="propose" @click="start(a)">{{ t('tnd30.pool.propose') }}</WbButton></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="caption wb-mut wb-tp-hint">{{ t('tnd30.pool.hint') }}</p>
      <div class="wb-row wb-wrap wb-tp-purge">
        <span class="caption wb-mut2">{{ lastPurge ? t('tnd30.purge.last', { date: fmtTime(lastPurge.last_run_at), n: lastPurge.result.applications ?? 0 }, lastPurge.result.applications ?? 0) : t('tnd30.purge.never') }}</span>
        <WbButton variant="ghost" size="sm" icon="rotate-ccw" :loading="purging" data-action="purge" @click="purgeNow">{{ t('tnd30.purge.run') }}</WbButton>
      </div>
    </div>

    <WbModal v-if="proposing" :title="t('tnd30.pool.proposeTitle', { who: `${proposing.candidates?.first_name} ${proposing.candidates?.last_name}` })" :description="t('tnd30.pool.proposeText')" @close="proposing = null">
      <WbSelect id="pool-target" v-model="target" :label="t('tnd30.stats.opening')" :options="targetOptions" />
      <template #footer>
        <WbButton variant="secondary" @click="proposing = null">{{ t('approvals.cancel') }}</WbButton>
        <WbButton icon="send" :loading="busy" :disabled="!target" data-action="confirm-propose" @click="confirm">{{ t('tnd30.pool.propose') }}</WbButton>
      </template>
    </WbModal>
  </section>
</template>

<style scoped>
.wb-tp-search { max-width: 300px; }
.wb-tp-hint { margin-top: var(--space-3); }
.wb-tp-purge { gap: var(--space-2); align-items: center; margin-top: var(--space-2); }
.wb-tp-purge :deep(.wb-btn) { margin: 0; }
</style>
