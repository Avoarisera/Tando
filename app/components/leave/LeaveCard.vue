<script setup lang="ts">
import type { LeaveRequestWithRelations, UserRole } from '~/types/index'

const props = defineProps<{ request: LeaveRequestWithRelations, role: UserRole }>()
defineEmits<{ open: [id: string] }>()
const { t, locale } = useI18n()
const localeTag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

const color = computed(() => props.request.leave_types?.color ?? 'gray')
const period = computed(() => formatPeriod(props.request.start_date, props.request.end_date, localeTag.value))
const steps = computed(() => leaveSteps(
  props.request,
  props.role,
  { sent: t('leave.steps.sent'), manager: t('leave.steps.manager'), admin: t('leave.steps.admin') },
  iso => fmtShort(iso.slice(0, 10), localeTag.value),
))
</script>

<template>
  <article class="wb-lc wb-lc-row" :style="leaveVars(color)" :data-start="request.start_date">
    <WbDot :color="color" :size="10" />
    <div class="wb-lc-main">
      <h3 class="h3">
        <button type="button" class="wb-lc-open" @click="$emit('open', request.id)">{{ request.leave_types?.name }}</button>
      </h3>
      <p class="small wb-mut2">{{ period }} · <span class="wb-num">{{ t('leave.workingDays', { n: fmtDays(Number(request.days_count), localeTag) }, Number(request.days_count)) }}</span></p>
    </div>
    <WbStepper class="wb-lc-steps" :steps="steps" inline />
    <WbStatusBadge class="wb-lc-status" :status="request.status" />
    <div v-if="request.status === 'rejected' && request.review_comment" class="wb-why small wb-lc-why"><b>{{ t('detail.reason') }}</b> {{ request.review_comment }}</div>
  </article>
</template>

<style scoped>
/* One dense row per request: type and period, mini stepper, status */
.wb-lc-row { flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); padding: var(--space-3) var(--space-4); box-shadow: none; border-radius: var(--radius-md); }
.wb-lc-row:hover { border-color: var(--border-strong); }
.wb-lc-main { flex: 1 1 220px; min-width: 0; }
.wb-lc-main .h3 { font-size: 14px; }
.wb-lc-status { flex: none; }
.wb-lc-why { flex-basis: 100%; }
.wb-lc-open { all: unset; cursor: pointer; border-radius: var(--radius-sm); }
.wb-lc-open::after { content: ""; position: absolute; inset: 0; } /* whole row clickable */
.wb-lc-row { position: relative; cursor: pointer; }
.wb-lc-open:focus-visible { outline: none; }
.wb-lc-row:has(.wb-lc-open:focus-visible) { box-shadow: 0 0 0 2px var(--focus); }
@container wbapp (max-width: 767px) {
  .wb-lc-steps { order: 4; flex-basis: 100%; }
}
</style>
