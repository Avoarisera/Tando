<script setup lang="ts">
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { detailId, closeDetail, openEdit } = useLeavePanel()
const { requests, fetchMine } = useMyLeave()
const { cancelRequest } = useLeaveRequests()
const { fetchBalances } = useLeaveBalances()
const toast = useToast()
const { profile } = useCurrentUser()

const request = computed(() => requests.value.find(r => r.id === detailId.value) ?? null)
const role = computed(() => profile.value?.role ?? 'employee')
const fmtDateTime = (iso: string) => new Intl.DateTimeFormat(tag.value, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

const subtitle = computed(() => request.value
  ? `${formatPeriod(request.value.start_date, request.value.end_date, tag.value)}${halfLabel.value} · ${t('leave.workingDays', { n: fmtDays(Number(request.value.days_count), tag.value) }, Number(request.value.days_count))}`
  : '')
const halfLabel = computed(() => {
  const r = request.value
  if (!r) return ''
  const parts = [r.start_half ? t('detail.fromAfternoon') : '', r.end_half ? t('detail.untilNoon') : ''].filter(Boolean)
  return parts.length ? ` (${parts.join(', ')})` : ''
})
const steps = computed(() => request.value
  ? leaveSteps(request.value, role.value, { sent: t('leave.steps.sent'), manager: t('leave.steps.manager'), admin: t('leave.steps.admin') }, iso => fmtShort(iso.slice(0, 10), tag.value))
  : [])
const history = computed(() => {
  const r = request.value
  if (!r) return []
  const items: { title: string, time: string, tone?: 'neutral' | 'success' | 'warning' | 'danger' }[] = [
    { title: t('detail.created'), time: fmtDateTime(r.created_at) },
  ]
  if (r.manager_reviewed_at) {
    const refused = r.status === 'rejected' && !r.admin_reviewed_at
    items.push({ title: refused ? t('detail.managerRefused') : t('detail.managerApproved'), time: fmtDateTime(r.manager_reviewed_at), tone: refused ? 'danger' : 'warning' })
  }
  if (r.admin_reviewed_at) {
    const refused = r.status === 'rejected'
    items.push({ title: refused ? t('detail.adminRefused') : t('detail.adminApproved'), time: fmtDateTime(r.admin_reviewed_at), tone: refused ? 'danger' : 'success' })
  }
  if (r.cancel_requested_at) items.push({ title: t('detail.cancelAsked'), time: fmtDateTime(r.cancel_requested_at), tone: 'warning' })
  if (r.cancelled_at) items.push({ title: t('detail.cancelledEvent'), time: fmtDateTime(r.cancelled_at) })
  return items
})

// Actions: edit while pending; cancel before validation, or ask the admin once approved
const today = todayIso()
const canEdit = computed(() => request.value?.status === 'pending')
const cancelMode = computed<'direct' | 'ask' | null>(() => {
  const r = request.value
  if (!r) return null
  if (r.status === 'pending' || r.status === 'manager_approved') return 'direct'
  if (r.status === 'approved' && r.start_date > today) return 'ask'
  return null
})
const confirming = ref(false)
const busy = ref(false)
async function confirmCancel() {
  if (!request.value) return
  busy.value = true
  try {
    const status = await cancelRequest(request.value.id)
    await Promise.all([fetchMine(), fetchBalances()])
    toast.add(status === 'cancelled' ? t('detail.cancelledToast') : t('detail.askedToast'))
    confirming.value = false
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('request.error'), 'error')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <WbSidePanel v-if="request" :title="request.leave_types?.name ?? ''" :subtitle="subtitle" @close="closeDetail">
    <div><WbStatusBadge :status="request.status" /></div>
    <WbStepper :steps="steps" />
    <div v-if="request.review_comment && request.status === 'rejected'" class="wb-why small"><b>{{ t('detail.reason') }}</b> {{ request.review_comment }}</div>
    <div class="wb-stack-s">
      <h3 class="h3">{{ t('detail.comment') }}</h3>
      <p v-if="request.comment">{{ request.comment }}</p>
      <p v-else class="small wb-mut">{{ t('detail.noComment') }}</p>
    </div>
    <div class="wb-stack-s">
      <h3 class="h3">{{ t('detail.history') }}</h3>
      <WbTimeline :items="history" />
    </div>

    <div v-if="canEdit || cancelMode" class="wb-panel-f">
      <WbButton v-if="canEdit" variant="secondary" icon="pencil" block @click="openEdit(request.id)">{{ t('detail.edit') }}</WbButton>
      <WbButton v-if="cancelMode" variant="ghost" block @click="confirming = true">
        {{ cancelMode === 'direct' ? t('detail.cancel') : t('detail.askCancel') }}
      </WbButton>
    </div>

    <WbModal
      v-if="confirming"
      tone="danger"
      :title="cancelMode === 'direct' ? t('detail.cancelTitle') : t('detail.askCancelTitle')"
      :description="cancelMode === 'direct' ? t('detail.cancelText') : t('detail.askCancelText')"
      @close="confirming = false"
    >
      <template #footer>
        <WbButton variant="secondary" @click="confirming = false">{{ t('detail.keep') }}</WbButton>
        <WbButton variant="danger" :loading="busy" @click="confirmCancel">{{ cancelMode === 'direct' ? t('detail.cancel') : t('detail.askCancel') }}</WbButton>
      </template>
    </WbModal>
  </WbSidePanel>
</template>
