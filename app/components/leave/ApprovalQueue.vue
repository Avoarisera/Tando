<script setup lang="ts">
import type { LeaveRequestWithRelations } from '~/types/index'
import type { PlanPerson } from '~/components/wb/WbPlanningGrid.vue'

// Approval cards with their decisions: approve, refuse (confirmation modal),
// and for the admin a bulk approval of the selected requests.
const props = defineProps<{ items: LeaveRequestWithRelations[], isAdmin: boolean, bulk?: boolean, withPlanning?: boolean }>()

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { requests, balanceAfter, decide } = useApprovals()
const { events } = useCalendar()
const { members } = useTeamMembers()
const toast = useToast()

/** Managers of the requester's team (not the requester): who should validate at step 1 */
function managersOf(r: LeaveRequestWithRelations) {
  return members.value
    .filter(m => m.role === 'manager' && m.team_id && m.team_id === r.profiles.team_id && m.id !== r.profiles.id)
    .map(m => m.first_name)
}
function teamSize(r: LeaveRequestWithRelations) {
  return members.value.filter(m => m.role !== 'admin' && m.team_id && m.team_id === r.profiles.team_id).length
}
/** Dense planning for managers: approved leave plain, pending hatched */
const planning = computed<PlanPerson[]>(() => members.value
  .filter(m => m.role !== 'admin')
  .map(m => ({
    id: m.id,
    name: fullName(m),
    spans: requests.value
      .filter(r => r.user_id === m.id && r.status !== 'rejected')
      .map(r => ({ id: r.id, from: r.start_date, to: r.end_date, label: r.leave_types?.name ?? '', color: r.leave_types?.color ?? 'gray', pending: r.status !== 'approved' })),
  })))

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
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('approvals.error'), 'error')
  }
  finally {
    busy.value = null
    refusing.value = null
  }
}

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
    <ApprovalCard
      v-for="r in items"
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
      :planning="withPlanning ? planning : undefined"
      @update:selected="toggle(r.id, $event)"
      @approve="approve(r)"
      @refuse="refusing = r"
    />

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
/* Bulk bar stays under the header while scrolling a long queue */
.wb-aq-bar { position: sticky; top: 64px; z-index: 4; padding: var(--space-2) var(--space-4); }
.wb-aq-bar.is-on { border-color: var(--brand); background: var(--brand-tint); }
.wb-aq-bar :deep(.wb-btn) { margin: 0; }
</style>
