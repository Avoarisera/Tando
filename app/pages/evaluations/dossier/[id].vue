<script setup lang="ts">
import type { HrPacket, ReviewCycle } from '~/composables/useReviews'
import type { PeerFeedback, ReviewResponse, TemplateContent } from '~/utils/reviews'

// HR — one review file (TND-29): side-by-side synthesis, HR conclusion, release
// to the employee, acknowledgement; printable (PDF from the browser).
definePageMeta({ titleKey: 'nav.evaluations', layout: 'private', middleware: 'hr-access', key: r => String(r.params.id) })
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const route = useRoute()
const id = String(route.params.id)
const { getPacket, listResponses, conclude, share, peerStatus, peerFeedback } = useReviews()

const packet = ref<(HrPacket & { review_cycles: ReviewCycle }) | null>(null)
const responses = ref<ReviewResponse[]>([])
// lot 2: who answered (names, never the content) and the anonymous aggregate
const peerRows = ref<{ peer_id: string, peer_name: string, status: string, answered: boolean }[]>([])
const peers = ref<PeerFeedback | null>(null)
const error = ref<string | null>(null)
const form = reactive({ rating: null as number | null, strengths: '', improvements: '', objectives: [] as { text: string }[] })
async function load() {
  error.value = null
  try {
    const [p, r] = await Promise.all([getPacket(id), listResponses(id)])
    if (!p) throw new Error(t('tnd29.cycle.notFound'))
    packet.value = p
    responses.value = r
    if (p.review_cycles.peers_enabled) [peerRows.value, peers.value] = await Promise.all([peerStatus(id), peerFeedback(id)])
    Object.assign(form, { rating: p.hr_rating, strengths: p.hr_strengths, improvements: p.hr_improvements, objectives: p.hr_objectives?.length ? [...p.hr_objectives] : [{ text: '' }] })
  }
  catch (e) { error.value = errorMessage(e) }
}
onMounted(load)
const name = computed(() => (packet.value?.employee ? `${packet.value.employee.first_name} ${packet.value.employee.last_name}` : '…'))
usePageHeader(() => ({ crumbs: [{ label: t('nav.evaluations'), to: '/evaluations' }, { label: packet.value?.review_cycles.name ?? '…', to: packet.value ? `/evaluations/campagne/${packet.value.cycle_id}` : undefined }, { label: name.value }] }))

const content = computed(() => (packet.value?.review_cycles.content ?? null) as TemplateContent | null)
const self = computed(() => responses.value.find(r => r.role === 'self' && r.submitted_at) ?? null)
const manager = computed(() => responses.value.find(r => r.role === 'manager' && r.submitted_at) ?? null)
const draftSelf = computed(() => responses.value.some(r => r.role === 'self' && !r.submitted_at))
const shared = computed(() => !!packet.value?.shared_at)
const peersOn = computed(() => !!packet.value?.review_cycles.peers_enabled)
const peersOpen = computed(() => peersOn.value && packet.value?.review_cycles.status === 'active' && !shared.value)
const approvedPeers = computed(() => peerRows.value.filter(p => p.status === 'approved'))
const answered = computed(() => approvedPeers.value.filter(p => p.answered).length)

const saving = ref(false)
const formError = ref<string | null>(null)
async function save() {
  formError.value = null
  saving.value = true
  try {
    await conclude(id, form.rating, form.strengths.trim(), form.improvements.trim(), form.objectives.map(o => ({ text: o.text.trim() })).filter(o => o.text))
    toast.add(t('tnd29.hr.saved'))
    await load()
  }
  catch (e) { formError.value = errorMessage(e) }
  finally { saving.value = false }
}
const confirmShare = ref(false)
async function doShare() {
  saving.value = true
  try {
    if (form.rating === null) throw new Error(t('tnd29.hr.ratingRequired'))
    await conclude(id, form.rating, form.strengths.trim(), form.improvements.trim(), form.objectives.map(o => ({ text: o.text.trim() })).filter(o => o.text))
    await share(id)
    toast.add(t('tnd29.hr.sharedToast', { who: packet.value?.employee?.first_name ?? '' }))
    confirmShare.value = false
    await load()
  }
  catch (e) { formError.value = errorMessage(e); confirmShare.value = false }
  finally { saving.value = false }
}
const fmtTime = (iso: string) => new Intl.DateTimeFormat(tag.value, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const print = () => window.print()
</script>

<template>
  <div class="wb-page wb-stack wb-dos">
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!packet || !content" variant="table" />
    <template v-else>
      <header class="wb-row-b wb-wrap wb-dos-h">
        <div class="wb-cp">
          <WbAvatar :name="name" :size="44" />
          <div>
            <h1 class="h2">{{ name }}</h1>
            <p class="small wb-mut2">{{ packet.review_cycles.name }} · {{ formatPeriod(packet.review_cycles.period_start, packet.review_cycles.period_end, tag) }}<template v-if="packet.manager"> · {{ t('tnd29.syn.manager') }} : {{ packet.manager.first_name }} {{ packet.manager.last_name }}</template></p>
          </div>
        </div>
        <div class="wb-row wb-wrap wb-no-print" style="gap: 8px">
          <WbBadge v-if="packet.acknowledged_at" tone="success" icon="circle-check">{{ t('tnd29.hr.acknowledged', { date: fmtShort(packet.acknowledged_at.slice(0, 10), tag) }) }}</WbBadge>
          <WbBadge v-else-if="shared" tone="info">{{ t('tnd29.hr.sharedOn', { date: fmtShort(packet.shared_at!.slice(0, 10), tag) }) }}</WbBadge>
          <WbButton variant="secondary" size="sm" icon="download" @click="print">{{ t('tnd29.hr.pdf') }}</WbButton>
        </div>
      </header>

      <div class="wb-row wb-wrap wb-dos-st wb-no-print">
        <WbBadge :tone="self ? 'success' : 'warning'" size="sm">{{ self ? t('tnd29.hr.selfDone') : draftSelf ? t('tnd29.hr.selfDraft') : t('tnd29.hr.selfTodo') }}</WbBadge>
        <WbBadge v-if="packet.manager_id" :tone="manager ? 'success' : 'warning'" size="sm">{{ manager ? t('tnd29.hr.managerDone') : t('tnd29.hr.managerTodo') }}</WbBadge>
        <WbBadge v-else size="sm">{{ t('tnd29.cycle.noManager') }}</WbBadge>
        <WbBadge v-if="peersOn" :tone="approvedPeers.length && answered === approvedPeers.length ? 'success' : approvedPeers.length ? 'warning' : 'neutral'" size="sm" data-badge="peers">{{ approvedPeers.length ? t('tnd29.hr.peersAnswered', { n: answered, total: approvedPeers.length }) : t('tnd29.hr.peersNone') }}</WbBadge>
      </div>

      <!-- who answered: names only, to remind — HR never sees who wrote what -->
      <section v-if="peersOn && approvedPeers.length" class="wb-card wb-dos-peers wb-no-print" data-section="peer-status">
        <h2 class="h3">{{ t('tnd29.hr.peersTitle') }}</h2>
        <ul class="wb-dos-pl">
          <li v-for="p in approvedPeers" :key="p.peer_id" class="small" :data-peer="p.peer_name"><WbIcon :name="p.answered ? 'circle-check' : 'clock'" :size="14" :class="p.answered ? 'wb-c-success' : 'wb-mut'" /> {{ p.peer_name }}</li>
        </ul>
        <p class="caption wb-mut">{{ t('tnd29.hr.peersAnon') }}</p>
      </section>
      <PeerNomination v-if="peersOpen && (!packet.manager_id || !approvedPeers.length)" class="wb-no-print" :packet-id="packet.id" mode="hr" :peers-min="packet.review_cycles.peers_min" :peers-max="packet.review_cycles.peers_max" :open="peersOpen" :has-manager="!!packet.manager_id" @changed="load" />

      <ReviewSynthesis :content="content" :self="self" :manager="manager" :has-manager="!!packet.manager_id" :peers="peersOn ? peers : null" />

      <!-- HR conclusion -->
      <section class="wb-card wb-dos-hr">
        <h2 class="h2">{{ t('tnd29.hr.title') }}</h2>
        <WbBanner v-if="formError" tone="danger" class="wb-no-print">{{ formError }}</WbBanner>
        <div class="wb-stack-s">
          <span class="wb-label">{{ t('tnd29.hr.rating') }}</span>
          <div class="wb-dos-rate" role="radiogroup" :aria-label="t('tnd29.hr.rating')">
            <button v-for="n in 4" :key="n" type="button" role="radio" :disabled="shared" :aria-checked="form.rating === n" :class="['wb-dos-r', { 'is-on': form.rating === n }]" :data-rating="n" @click="form.rating = n">
              <b class="small">{{ t(`tnd29.overall.${n}`) }}</b><span class="caption wb-mut2">{{ t(`tnd29.overallHint.${n}`) }}</span>
            </button>
          </div>
        </div>
        <WbTextarea id="hr-strengths" v-model="form.strengths" :label="t('tnd29.hr.strengths')" :max="4000" :rows="4" :disabled="shared" />
        <WbTextarea id="hr-improve" v-model="form.improvements" :label="t('tnd29.hr.improvements')" :max="4000" :rows="4" :disabled="shared" />
        <div class="wb-stack-s">
          <span class="wb-label">{{ t('tnd29.hr.objectives') }}</span>
          <div v-for="(o, i) in form.objectives" :key="i" class="wb-row wb-dos-obj">
            <WbInput v-model="o.text" class="wb-grow" :aria-label="t('tnd29.form.objective', { n: i + 1 })" :placeholder="t('tnd29.hr.objectivePh')" maxlength="300" :disabled="shared" />
            <WbButton v-if="!shared && form.objectives.length > 1" variant="ghost" size="sm" icon="x" icon-only class="wb-no-print" @click="form.objectives.splice(i, 1)">{{ t('tnd30.editor.remove') }}</WbButton>
          </div>
          <div v-if="!shared && form.objectives.length < 8" class="wb-no-print"><WbButton variant="secondary" size="sm" icon="plus" @click="form.objectives.push({ text: '' })">{{ t('tnd29.form.addObjective') }}</WbButton></div>
        </div>
        <div v-if="!shared" class="wb-row wb-wrap wb-dos-act wb-no-print">
          <WbButton variant="secondary" :loading="saving" data-action="save-conclusion" @click="save">{{ t('tnd29.hr.save') }}</WbButton>
          <WbButton icon="send" :disabled="form.rating === null" data-action="share" @click="confirmShare = true">{{ t('tnd29.hr.share') }}</WbButton>
          <span class="caption wb-mut">{{ t('tnd29.hr.shareHint') }}</span>
        </div>
      </section>

      <section v-if="packet.acknowledged_at" class="wb-card wb-dos-ack">
        <h2 class="h3">{{ t('tnd29.ack.title') }}</h2>
        <p class="small">{{ t('tnd29.ack.on', { who: packet.employee?.first_name ?? '', date: fmtTime(packet.acknowledged_at) }) }}</p>
        <p v-if="packet.employee_comment" class="small wb-dos-cm">« {{ packet.employee_comment }} »</p>
        <p v-else class="small wb-mut">{{ t('tnd29.ack.noComment') }}</p>
      </section>
    </template>

    <WbModal v-if="confirmShare" :title="t('tnd29.hr.shareTitle', { who: name })" :description="t('tnd29.hr.shareText')" @close="confirmShare = false">
      <template #footer>
        <WbButton variant="secondary" @click="confirmShare = false">{{ t('approvals.cancel') }}</WbButton>
        <WbButton icon="send" :loading="saving" data-action="confirm-share" @click="doShare">{{ t('tnd29.hr.share') }}</WbButton>
      </template>
    </WbModal>
  </div>
</template>

<style scoped>
.wb-dos h1 { margin: 0; }
.wb-dos-h p { margin: 0; }
.wb-dos-st { gap: var(--space-2); }
.wb-dos-peers { padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); }
.wb-dos-peers h2, .wb-dos-peers p { margin: 0; }
.wb-dos-pl { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); }
.wb-dos-pl li { display: inline-flex; align-items: center; gap: 6px; }
.wb-dos-hr { padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
.wb-dos-hr h2 { margin: 0; }
.wb-dos-rate { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-2); }
.wb-dos-r { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); color: inherit; font: inherit; text-align: left; cursor: pointer; }
.wb-dos-r.is-on { border-color: var(--brand); background: var(--brand-tint); box-shadow: 0 0 0 1px var(--brand); }
.wb-dos-r:disabled { cursor: default; }
.wb-dos-obj { gap: var(--space-2); }
.wb-dos-obj :deep(.wb-field) { flex: 1 1 auto; }
.wb-dos-act { gap: var(--space-2); align-items: center; }
.wb-dos-act :deep(.wb-btn) { margin: 0; }
.wb-dos-ack { padding: var(--space-4) var(--space-5); }
.wb-dos-ack h2, .wb-dos-ack p { margin: 0 0 6px; }
.wb-dos-cm { white-space: pre-wrap; }
@container wbapp (max-width: 767px) {
  .wb-dos-rate { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
