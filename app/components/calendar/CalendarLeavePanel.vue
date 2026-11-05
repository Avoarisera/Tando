<script setup lang="ts">
import type { CalendarEvent } from '~/types/index'

/**
 * TND-25 — leave clicked on the calendar (someone else's: one's own requests open
 * LeaveDetailPanel). A request I can decide on shows the approval card with its
 * actions (same rules and modals as « À valider »); anything else is read-only.
 */
const props = defineProps<{ event: CalendarEvent }>()
const emit = defineEmits<{ close: [], decided: [id: string] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { isAdmin, profile } = useCurrentUser()
const { requests, toReview } = useApprovals()

const toDecide = computed(() => toReview.value.find(r => r.id === props.event.id) ?? null)
/** Full request when RLS lets me read it (manager: own team, admin: everyone) */
const full = computed(() => requests.value.find(r => r.id === props.event.id) ?? null)
const isManager = computed(() => profile.value?.role === 'manager')
const period = computed(() => formatPeriod(props.event.startDate, props.event.endDate, tag.value))
const status = computed(() => full.value?.status ?? props.event.state ?? props.event.status)
const days = computed(() => (full.value ? Number(full.value.days_count) : null))
</script>

<template>
  <WbSidePanel v-if="toDecide" :title="t('tnd25.reviewTitle')" :subtitle="`${event.employeeName} · ${period}`" @close="emit('close')">
    <ApprovalQueue :items="[toDecide]" :is-admin="isAdmin" grid @decided="emit('decided', $event)" />
  </WbSidePanel>

  <WbSidePanel v-else :title="event.employeeName" :subtitle="period" @close="emit('close')">
    <div class="wb-row wb-wrap" style="gap: 6px">
      <WbTypeBadge :name="event.leaveTypeName" :color="event.leaveTypeColor" />
      <WbStatusBadge :status="status" />
      <WbBadge v-if="full?.is_exception" tone="warning" size="sm" icon="shield">{{ t('tnd23.badge') }}</WbBadge>
    </div>
    <dl class="wb-clp small">
      <div v-if="event.teamName"><dt class="wb-mut2">{{ t('tnd25.team') }}</dt><dd>{{ event.teamName }}</dd></div>
      <div><dt class="wb-mut2">{{ t('tnd25.period') }}</dt><dd>{{ period }}</dd></div>
      <div v-if="days !== null"><dt class="wb-mut2">{{ t('tnd25.days') }}</dt><dd class="wb-num">{{ t('leave.workingDays', { n: fmtDays(days, tag) }, days) }}</dd></div>
    </dl>
    <div v-if="full?.comment" class="wb-stack-s">
      <h3 class="h3">{{ t('detail.comment') }}</h3>
      <p>{{ full.comment }}</p>
    </div>
    <p v-if="isManager && status === 'cancel_requested'" class="small wb-mut2">{{ t('tnd25.cancelAdminOnly') }}</p>
    <p v-else-if="isManager && status === 'manager_approved'" class="small wb-mut2">{{ t('tnd25.waitAdmin') }}</p>
    <p v-else-if="!full" class="small wb-mut2">{{ t('tnd25.readOnly') }}</p>
  </WbSidePanel>
</template>

<style scoped>
.wb-clp { display: grid; gap: var(--space-2); margin: 0; }
.wb-clp div { display: flex; justify-content: space-between; gap: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--border); }
.wb-clp dd { margin: 0; text-align: right; }
</style>
