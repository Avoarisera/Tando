<script setup lang="ts">
import type { LeaveRequestWithRelations } from '~/types/index'

// Approval cards with their decisions: approve, refuse (confirmation modal),
// and for the admin a bulk approval of the selected requests.
const props = defineProps<{ items: LeaveRequestWithRelations[], isAdmin: boolean, bulk?: boolean, /** "Voir dans le planning" on each card (TND-25) */ planLink?: boolean, /** cards side by side, rendered as you scroll */ grid?: boolean }>()

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { balanceAfter, decide, approveException } = useApprovals()
const { events } = useCalendar()
const { members } = useTeamMembers()
const toast = useToast()
/** A decision was made on this request (the calendar closes its panel and reloads) */
const emit = defineEmits<{ decided: [id: string] }>()

/** Managers of the requester's team (not the requester): who should validate at step 1 */
function managersOf(r: LeaveRequestWithRelations) {
  return members.value
    .filter(m => m.role === 'manager' && m.team_id && m.team_id === r.profiles.team_id && m.id !== r.profiles.id)
    .map(m => m.first_name)
}
function teamSize(r: LeaveRequestWithRelations) {
  return members.value.filter(m => m.role !== 'admin' && m.team_id && m.team_id === r.profiles.team_id).length
}

// Decisions
const busy = ref<string | null>(null)
const refusing = ref<LeaveRequestWithRelations | null>(null)
const reason = ref('')
const reasonError = ref<string | null>(null)
const refusingCancellation = computed(() => refusing.value?.status === 'cancel_requested')
watch(refusing, () => { reason.value = ''; reasonError.value = null })

async function approve(r: LeaveRequestWithRelations) {
  busy.value = r.id
  try {
    const wasCancellation = r.status === 'cancel_requested'
    await decide(r.id, 'approve')
    toast.add(wasCancellation ? t('approvals.cancelAccepted', { who: r.profiles.first_name }) : t('approvals.approved', { who: r.profiles.first_name }))
    selected.value = selected.value.filter(id => id !== r.id)
    emit('decided', r.id)
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('approvals.error'), 'error')
  }
  finally {
    busy.value = null
  }
}

async function confirmRefuse() {
  const r = refusing.value
  if (!r) return
  // A reason is mandatory to refuse a leave request (not to keep a leave after a cancellation request)
  if (!refusingCancellation.value && !reason.value.trim()) {
    reasonError.value = t('approvals.reasonRequired')
    return
  }
  busy.value = r.id
  try {
    await decide(r.id, 'reject', refusingCancellation.value ? undefined : reason.value.trim())
    toast.add(refusingCancellation.value ? t('approvals.cancelRefused', { who: r.profiles.first_name }) : t('approvals.refused', { who: r.profiles.first_name }))
    selected.value = selected.value.filter(id => id !== r.id)
    emit('decided', r.id)
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('approvals.error'), 'error')
  }
  finally {
    busy.value = null
    refusing.value = null
  }
}

// Exceptional approval beyond the balance (admin, reason mandatory — TND-23)
const excepting = ref<LeaveRequestWithRelations | null>(null)
const exReason = ref('')
const exError = ref<string | null>(null)
watch(excepting, () => { exReason.value = ''; exError.value = null })
watch(exReason, () => { exError.value = null })
async function confirmException() {
  const r = excepting.value
  if (!r) return
  if (!exReason.value.trim()) {
    exError.value = t('tnd23.reasonRequired')
    return
  }
  busy.value = r.id
  try {
    await approveException(r.id, exReason.value.trim())
    toast.add(t('tnd23.approved', { who: r.profiles.first_name }))
    selected.value = selected.value.filter(id => id !== r.id)
    excepting.value = null
    emit('decided', r.id)
  }
  catch (e) {
    exError.value = e instanceof Error ? e.message : t('approvals.error')
  }
  finally {
    busy.value = null
  }
}
const overOf = (r: LeaveRequestWithRelations) => { const b = balanceAfter(r); return b !== null && b < 0 ? -b : 0 }

// Grid mode: render a first batch, add more when the end of the list comes into view
const STEP = 24
const limit = ref(STEP)
watch(() => props.items.length, () => { limit.value = STEP })
const rendered = computed(() => (props.grid ? props.items.slice(0, limit.value) : props.items))
const sentinel = ref<HTMLElement | null>(null)
let io: IntersectionObserver | undefined
watch(sentinel, (el) => {
  io?.disconnect()
  if (!el || typeof IntersectionObserver === 'undefined') return
  io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting) && limit.value < props.items.length) limit.value += STEP
  }, { rootMargin: '400px' })
  io.observe(el)
})
onBeforeUnmount(() => io?.disconnect())

// Bulk approval (admin)
const selected = ref<string[]>([])
const allSelected = computed({
  get: () => props.items.length > 0 && props.items.every(r => selected.value.includes(r.id)),
  set: (v: boolean) => { selected.value = v ? props.items.map(r => r.id) : [] },
})
const someSelected = computed(() => selected.value.length > 0 && !allSelected.value)
function toggle(id: string, on: boolean) {
  selected.value = on ? [...new Set([...selected.value, id])] : selected.value.filter(x => x !== id)
}
const bulkBusy = ref(false)
async function approveSelected() {
  bulkBusy.value = true
  let ok = 0
  for (const id of [...selected.value]) {
    const req = props.items.find(x => x.id === id)
    if (req && overOf(req)) {
      toast.add(t('tnd23.bulkSkipped', { who: req.profiles.first_name }), 'error')
      continue
    }
    try {
      await decide(id, 'approve')
      ok++
    }
    catch (e) {
      toast.add(e instanceof Error ? e.message : t('approvals.error'), 'error')
    }
  }
  selected.value = []
  bulkBusy.value = false
  if (ok) toast.add(t('approvals.bulkApproved', { n: ok }, ok))
}
</script>

<template>
  <div class="wb-stack wb-aq">
    <div v-if="bulk && isAdmin" class="wb-row-b wb-card wb-wrap wb-aq-bar" :class="{ 'is-on': selected.length }">
      <WbCheckbox
        v-model="allSelected"
        :indeterminate="someSelected"
        :label="selected.length ? t('approvals.selected', { n: selected.length }, selected.length) : t('approvals.selectAll')"
      />
      <WbButton icon="check" size="sm" :disabled="!selected.length" :loading="bulkBusy" @click="approveSelected">{{ t('approvals.approveSelection') }}</WbButton>
    </div>
    <div :class="{ 'wb-aq-grid': grid }">
    <ApprovalCard
      v-for="r in rendered"
      :key="r.id"
      :request="r"
      :events="events"
      :team-size="teamSize(r)"
      :managers="managersOf(r)"
      :balance-after="balanceAfter(r)"
      :is-admin="isAdmin"
      :selectable="bulk && isAdmin"
      :selected="selected.includes(r.id)"
      :busy="busy === r.id"
      :plan-link="planLink"
      @update:selected="toggle(r.id, $event)"
      @approve="approve(r)"
      @refuse="refusing = r"
      @exception="excepting = r"
      :compact="grid"
    />
    </div>
    <div v-if="grid && limit < items.length" ref="sentinel" class="wb-aq-more caption wb-mut2">{{ t('tnd23.loadingMore', { n: items.length - limit }, items.length - limit) }}</div>

    <WbModal
      v-if="excepting"

      :title="t('tnd23.modalTitle', { who: fullName(excepting.profiles) })"
      :description="t('tnd23.modalText', { who: excepting.profiles.first_name, n: fmtDays(overOf(excepting), tag) }, overOf(excepting))"
      @close="excepting = null"
    >
      <p class="small">{{ excepting.leave_types?.name }} · {{ formatPeriod(excepting.start_date, excepting.end_date, tag) }}</p>
      <WbTextarea id="exception-reason" v-model="exReason" :label="t('tnd23.reason')" :hint="t('tnd23.reasonHint')" :max="500" :error="exError" required />
      <template #footer>
        <WbButton variant="secondary" @click="excepting = null">{{ t('approvals.cancel') }}</WbButton>
        <WbButton :loading="busy === excepting.id" data-action="confirm-exception" @click="confirmException">{{ t('tnd23.confirm') }}</WbButton>
      </template>
    </WbModal>

    <WbModal
      v-if="refusing"
      tone="danger"
      :title="refusingCancellation ? t('approvals.keepTitle', { who: fullName(refusing.profiles) }) : t('approvals.refuseTitle', { who: fullName(refusing.profiles) })"
      :description="refusingCancellation ? t('approvals.keepText', { who: refusing.profiles.first_name }) : t('approvals.refuseText', { who: refusing.profiles.first_name })"
      @close="refusing = null"
    >
      <p class="small">{{ refusing.leave_types?.name }} · {{ formatPeriod(refusing.start_date, refusing.end_date, tag) }}</p>
      <WbTextarea v-if="!refusingCancellation" id="refuse-reason" v-model="reason" :label="t('approvals.reason')" :max="500" :error="reasonError" required />
      <template #footer>
        <WbButton variant="secondary" @click="refusing = null">{{ t('approvals.cancel') }}</WbButton>
        <WbButton variant="danger" :loading="busy === refusing.id" @click="confirmRefuse">{{ refusingCancellation ? t('approvals.keepLeave') : t('approvals.refuseConfirm') }}</WbButton>
      </template>
    </WbModal>
  </div>
</template>

<style scoped>
.wb-aq { gap: var(--space-2); }
/* Grid of short cards that adapts to the width */
.wb-aq-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); gap: var(--space-3); align-items: stretch; }
.wb-aq-more { text-align: center; padding: var(--space-3); }
/* Bulk bar stays under the header while scrolling a long queue */
.wb-aq-bar { position: sticky; top: 64px; z-index: 4; padding: var(--space-2) var(--space-4); }
.wb-aq-bar.is-on { border-color: var(--brand); background: var(--brand-tint); }
.wb-aq-bar :deep(.wb-btn) { margin: 0; }
</style>
