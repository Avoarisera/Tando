<script setup lang="ts">
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { detailId, closeDetail } = useLeavePanel()
const { requests } = useMyLeave()
const { profile } = useCurrentUser()

const request = computed(() => requests.value.find(r => r.id === detailId.value) ?? null)
const role = computed(() => profile.value?.role ?? 'employee')
const fmtDateTime = (iso: string) => new Intl.DateTimeFormat(tag.value, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

const subtitle = computed(() => request.value
  ? `${formatPeriod(request.value.start_date, request.value.end_date, tag.value)} · ${t('leave.days', { n: request.value.days_count }, request.value.days_count)}`
  : '')
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
  return items
})
</script>

<template>
  <WbSidePanel v-if="request" :title="request.leave_types?.name ?? ''" :subtitle="subtitle" @close="closeDetail">
    <div><WbStatusBadge :status="request.status" /></div>
    <WbStepper :steps="steps" />
    <div class="wb-stack-s">
      <h3 class="h3">{{ t('detail.comment') }}</h3>
      <p v-if="request.comment">{{ request.comment }}</p>
      <p v-else class="small wb-mut">{{ t('detail.noComment') }}</p>
    </div>
    <div class="wb-stack-s">
      <h3 class="h3">{{ t('detail.history') }}</h3>
      <WbTimeline :items="history" />
    </div>
  </WbSidePanel>
</template>
