<script setup lang="ts">
import type { Nomination } from '~/composables/useReviews'

/**
 * TND-29 lot 2 — choosing the colleagues who give feedback.
 * - the employee proposes peersMin…peersMax colleagues (any team), until the list is validated;
 * - the manager (or HR when there is no manager) adjusts and validates it (at least 3, for anonymity).
 * Never shows who answered: that stays with HR (peer_status).
 */
const props = defineProps<{ packetId: string, mode: 'self' | 'manager' | 'hr', peersMin: number, peersMax: number, open: boolean, hasManager: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const toast = useToast()
const { listNominations, peerCandidates, proposePeers, approvePeers, notify } = useReviews()

const list = ref<Nomination[]>([])
const people = ref<{ id: string, name: string, team_name: string | null }[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try {
    const [n, c] = await Promise.all([listNominations(props.packetId), peerCandidates(props.packetId)])
    list.value = n
    people.value = c
    picked.value = n.map(x => x.peer_id)
  }
  catch (e) { error.value = errorMessage(e) }
  finally { loaded.value = true }
}
onMounted(load)

const approved = computed(() => list.value.some(n => n.status === 'approved'))
const proposed = computed(() => list.value.length > 0 && !approved.value)
const decider = computed(() => props.mode !== 'self')
const min = computed(() => (decider.value ? Math.max(3, props.peersMin) : props.peersMin))
const editing = ref(false)
const canEdit = computed(() => props.open && (decider.value || !approved.value))
const showPicker = computed(() => canEdit.value && (editing.value || !list.value.length || (decider.value && proposed.value)))

const picked = ref<string[]>([])
const q = ref('')
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase()
  return people.value.filter(p => !s || p.name.toLowerCase().includes(s) || (p.team_name ?? '').toLowerCase().includes(s)).slice(0, 60)
})
const nameOf = (id: string) => people.value.find(p => p.id === id)?.name ?? list.value.find(n => n.peer_id === id)?.name ?? '—'
function toggle(id: string, on: boolean) {
  if (on && !picked.value.includes(id) && picked.value.length < props.peersMax) picked.value = [...picked.value, id]
  if (!on) picked.value = picked.value.filter(x => x !== id)
}
const valid = computed(() => picked.value.length >= min.value && picked.value.length <= props.peersMax)

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    if (decider.value) await approvePeers(props.packetId, picked.value)
    else await proposePeers(props.packetId, picked.value)
    notify()
    toast.add(decider.value ? t('tnd29.peer.approvedToast') : t('tnd29.peer.proposedToast'))
    editing.value = false
    await load()
    emit('changed')
  }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { saving.value = false }
}
</script>

<template>
  <section class="wb-card wb-pn" data-section="peers">
    <div class="wb-row wb-wrap wb-pn-h">
      <h2 class="h3">{{ t('tnd29.peer.title') }}</h2>
      <WbBadge v-if="approved" tone="success" size="sm">{{ t('tnd29.peer.statusApproved') }}</WbBadge>
      <WbBadge v-else-if="proposed" tone="warning" size="sm">{{ t('tnd29.peer.statusProposed') }}</WbBadge>
      <span class="wb-grow" />
      <WbButton v-if="canEdit && !showPicker" variant="secondary" size="sm" icon="pencil" @click="editing = true">{{ t('tnd29.peer.edit') }}</WbButton>
    </div>
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!loaded" variant="metric" :count="1" />
    <template v-else>
      <p class="small wb-mut2">
        <template v-if="mode === 'self'">{{ approved ? t('tnd29.peer.selfApproved') : proposed ? (hasManager ? t('tnd29.peer.selfWaiting') : t('tnd29.peer.selfWaitingHr')) : t('tnd29.peer.selfHint', { min: peersMin, max: peersMax }) }}</template>
        <template v-else>{{ approved ? t('tnd29.peer.mgrApproved') : proposed ? t('tnd29.peer.mgrHint') : t('tnd29.peer.mgrEmpty') }}</template>
      </p>

      <ul v-if="!showPicker && list.length" class="wb-pn-chips">
        <li v-for="n in list" :key="n.peer_id" class="wb-pn-chip"><WbAvatar :name="n.name" :size="22" /> {{ n.name }}<span v-if="n.team_name" class="caption wb-mut"> · {{ n.team_name }}</span></li>
      </ul>

      <div v-if="showPicker" class="wb-stack-s">
        <ul v-if="picked.length" class="wb-pn-chips" :aria-label="t('tnd29.peer.picked')">
          <li v-for="id in picked" :key="id" class="wb-pn-chip is-on">
            {{ nameOf(id) }}
            <button type="button" class="wb-pn-x" :aria-label="t('tnd29.peer.remove', { who: nameOf(id) })" @click="toggle(id, false)"><WbIcon name="x" :size="12" /></button>
          </li>
        </ul>
        <WbInput v-model="q" icon="search" :aria-label="t('tnd29.peer.search')" :placeholder="t('tnd29.peer.search')" />
        <div class="wb-pn-list" role="group" :aria-label="t('tnd29.peer.title')">
          <div v-for="p in filtered" :key="p.id" class="wb-pn-row" :data-peer="p.name">
            <WbCheckbox :model-value="picked.includes(p.id)" :label="p.name" :disabled="!picked.includes(p.id) && picked.length >= peersMax" @update:model-value="(v: boolean) => toggle(p.id, v)" />
            <span v-if="p.team_name" class="caption wb-mut">{{ p.team_name }}</span>
          </div>
          <p v-if="!filtered.length" class="caption wb-mut">{{ t('tnd29.peer.none') }}</p>
        </div>
        <div class="wb-row wb-wrap wb-pn-foot">
          <span :class="['caption', valid ? 'wb-mut' : 'wb-c-danger']">{{ t('tnd29.peer.count', { n: picked.length, min, max: peersMax }) }}</span>
          <span class="wb-grow" />
          <WbButton v-if="editing" variant="ghost" size="sm" @click="editing = false; picked = list.map(x => x.peer_id)">{{ t('approvals.cancel') }}</WbButton>
          <WbButton size="sm" :icon="decider ? 'circle-check' : 'send'" :disabled="!valid" :loading="saving" data-action="save-peers" @click="save">{{ decider ? t('tnd29.peer.approve') : t('tnd29.peer.propose') }}</WbButton>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.wb-pn { padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
.wb-pn h2, .wb-pn p { margin: 0; }
.wb-pn-h { align-items: center; gap: var(--space-2); }
.wb-pn-h :deep(.wb-btn) { margin: 0; }
.wb-pn-chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.wb-pn-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border: 1px solid var(--border); border-radius: var(--radius-pill); font-size: 13px; }
.wb-pn-chip.is-on { padding: 4px 6px 4px 10px; border-color: var(--brand); background: var(--brand-tint); }
.wb-pn-x { display: inline-flex; padding: 2px; border: 0; border-radius: 50%; background: none; color: inherit; cursor: pointer; }
.wb-pn-x:hover { background: var(--surface-2, rgba(0, 0, 0, .06)); }
.wb-pn-list { max-height: 260px; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 4px; }
.wb-pn-row { display: flex; align-items: center; gap: var(--space-2); padding: 6px 8px; border-radius: var(--radius-sm, 6px); font-size: 14px; }
.wb-pn-row:hover { background: var(--brand-tint); }
.wb-pn-row .caption { margin-left: auto; }
.wb-pn-foot { align-items: center; gap: var(--space-2); }
.wb-pn-foot :deep(.wb-btn) { margin: 0; }
</style>
