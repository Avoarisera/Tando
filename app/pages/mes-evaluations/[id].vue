<script setup lang="ts">
import type { MyPacket } from '~/composables/useReviews'
import type { PeerFeedback, ReviewResponse } from '~/utils/reviews'

// One review, seen by the employee or their manager (TND-29): the form to fill
// in, then — once shared — the whole file with the HR conclusion and, for the
// employee, the acknowledgement with an optional comment.
definePageMeta({ titleKey: 'nav.reviews', layout: 'private', key: r => String(r.params.id) })
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const route = useRoute()
const id = String(route.params.id)
const { profile } = useCurrentUser()
const { myPackets, listResponses, acknowledge, peerFeedback } = useReviews()

const packet = ref<MyPacket | null>(null)
const responses = ref<ReviewResponse[]>([])
const peers = ref<PeerFeedback | null>(null)
const error = ref<string | null>(null)
const loaded = ref(false)
async function load() {
  error.value = null
  try {
    const [all, r] = await Promise.all([myPackets(), listResponses(id)])
    packet.value = all.find(p => p.id === id) ?? null
    responses.value = r
    if (!packet.value) throw new Error(t('tnd29.cycle.notFound'))
    // the colleagues' anonymous aggregate, once the file is shared
    peers.value = packet.value.peers_enabled && packet.value.shared_at ? await peerFeedback(id) : null
  }
  catch (e) { error.value = errorMessage(e) }
  finally { loaded.value = true }
}
onMounted(load)
usePageHeader(() => ({ crumbs: [{ label: t('nav.reviews'), to: '/mes-evaluations' }, { label: packet.value ? (packet.value.my_role === 'self' ? packet.value.cycle_name : packet.value.employee_name) : '…' }] }))

const role = computed(() => packet.value?.my_role ?? 'self')
const mine = computed(() => responses.value.find(r => r.role === role.value) ?? null)
const self = computed(() => responses.value.find(r => r.role === 'self' && r.submitted_at) ?? null)
const manager = computed(() => responses.value.find(r => r.role === 'manager' && r.submitted_at) ?? null)
const canWrite = computed(() => !!packet.value && packet.value.cycle_status === 'active' && !packet.value.shared_at && !mine.value?.submitted_at)
const subject = computed(() => packet.value?.employee_name ?? '')
const peersOpen = computed(() => !!packet.value && packet.value.peers_enabled && packet.value.cycle_status === 'active' && !packet.value.shared_at)

// acknowledgement (employee, once shared)
const comment = ref('')
const acking = ref(false)
const confirmAck = ref(false)
async function ack() {
  acking.value = true
  try { await acknowledge(id, comment.value); toast.add(t('tnd29.ack.done')); confirmAck.value = false; await load() }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { acking.value = false }
}
const fmtTime = (iso: string) => new Intl.DateTimeFormat(tag.value, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
</script>

<template>
  <div class="wb-page wb-stack wb-my">
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!loaded" variant="table" />
    <template v-else-if="packet && profile">
      <header class="wb-stack-s">
        <h1 class="h2">{{ role === 'self' ? t('tnd29.mine.selfTitle') : t('tnd29.mine.managerTitle', { who: subject }) }}</h1>
        <p class="small wb-mut2">{{ packet.cycle_name }} · {{ formatPeriod(packet.period_start, packet.period_end, tag) }}<template v-if="role === 'self' && packet.manager_name"> · {{ t('tnd29.syn.manager') }} : {{ packet.manager_name }}</template></p>
      </header>

      <PeerNomination v-if="peersOpen" :packet-id="packet.id" :mode="role" :peers-min="packet.peers_min" :peers-max="packet.peers_max" :open="peersOpen" :has-manager="!!packet.manager_id" />

      <!-- to fill in -->
      <ReviewForm v-if="canWrite" :content="packet.content" :role="role" :packet-id="packet.id" :author-id="profile.id" :initial="mine" :subject="subject" @submitted="load" />

      <!-- sent, waiting for the rest -->
      <template v-else-if="!packet.shared_at">
        <p class="wb-why small"><WbIcon name="circle-check" :size="14" /> {{ role === 'self' ? t('tnd29.mine.sentSelf') : t('tnd29.mine.sentManager') }}</p>
        <ReviewSynthesis v-if="role === 'manager'" :content="packet.content" :self="self" :manager="manager" has-manager />
        <p v-if="role === 'manager' && !self" class="small wb-mut">{{ t('tnd29.mine.selfPending') }}</p>
        <ReviewForm v-if="role === 'self' && mine" :content="packet.content" role="self" :packet-id="packet.id" :author-id="profile.id" :initial="mine" :subject="subject" />
      </template>

      <!-- shared: the whole file -->
      <template v-else>
        <ReviewSynthesis :content="packet.content" :self="self" :manager="manager" :has-manager="!!packet.manager_id" :peers="peers" />
        <section class="wb-card wb-my-hr">
          <h2 class="h2">{{ t('tnd29.hr.title') }}</h2>
          <p v-if="packet.hr_rating" class="h3 wb-my-rate">{{ t(`tnd29.overall.${packet.hr_rating}`) }} <span class="small wb-mut2">— {{ t(`tnd29.overallHint.${packet.hr_rating}`) }}</span></p>
          <div v-if="packet.hr_strengths"><p class="small wb-mut2">{{ t('tnd29.hr.strengths') }}</p><p class="wb-my-txt">{{ packet.hr_strengths }}</p></div>
          <div v-if="packet.hr_improvements"><p class="small wb-mut2">{{ t('tnd29.hr.improvements') }}</p><p class="wb-my-txt">{{ packet.hr_improvements }}</p></div>
          <div v-if="packet.hr_objectives.length"><p class="small wb-mut2">{{ t('tnd29.hr.objectives') }}</p><ul><li v-for="(o, i) in packet.hr_objectives" :key="i">{{ o.text }}</li></ul></div>
        </section>

        <section v-if="role === 'self'" class="wb-card wb-my-ack">
          <template v-if="packet.acknowledged_at">
            <p class="small wb-c-success"><WbIcon name="circle-check" :size="14" /> {{ t('tnd29.ack.mine', { date: fmtTime(packet.acknowledged_at) }) }}</p>
            <p v-if="packet.employee_comment" class="small wb-my-txt">« {{ packet.employee_comment }} »</p>
          </template>
          <template v-else>
            <h2 class="h3">{{ t('tnd29.ack.title') }}</h2>
            <p class="small wb-mut2">{{ t('tnd29.ack.hint') }}</p>
            <WbTextarea id="ack-comment" v-model="comment" :label="t('tnd29.ack.comment')" :max="4000" :rows="3" />
            <div><WbButton icon="circle-check" data-action="acknowledge" @click="confirmAck = true">{{ t('tnd29.ack.button') }}</WbButton></div>
          </template>
        </section>
      </template>
    </template>

    <WbModal v-if="confirmAck" :title="t('tnd29.ack.confirmTitle')" :description="t('tnd29.ack.confirmText')" @close="confirmAck = false">
      <template #footer>
        <WbButton variant="secondary" @click="confirmAck = false">{{ t('approvals.cancel') }}</WbButton>
        <WbButton icon="circle-check" :loading="acking" data-action="confirm-ack" @click="ack">{{ t('tnd29.ack.button') }}</WbButton>
      </template>
    </WbModal>
  </div>
</template>

<style scoped>
.wb-my header h1, .wb-my header p { margin: 0; }
.wb-my-hr, .wb-my-ack { padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
.wb-my-hr h2, .wb-my-ack h2, .wb-my-hr p, .wb-my-ack p { margin: 0; }
.wb-my-rate { color: var(--brand-text); }
.wb-my-txt { white-space: pre-wrap; line-height: 1.6; }
.wb-my-ack .wb-c-success { display: flex; align-items: center; gap: 6px; }
.wb-my-hr ul { margin: 4px 0 0; padding-left: 1.2em; }
</style>
