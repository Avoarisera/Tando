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
  <article class="wb-lc" :style="leaveVars(color)" :data-start="request.start_date">
    <div class="wb-lc-h">
      <WbDot :color="color" :size="12" />
      <div class="wb-grow">
        <h3 class="h3">
          <button type="button" class="wb-lc-open" @click="$emit('open', request.id)">{{ request.leave_types?.name }}</button>
        </h3>
        <p class="small wb-mut2">{{ period }} · <span class="wb-num">{{ t('leave.days', { n: request.days_count }, request.days_count) }}</span></p>
      </div>
      <WbStatusBadge :status="request.status" />
    </div>
    <WbStepper :steps="steps" />
  </article>
</template>

<style scoped>
.wb-lc-open { all: unset; cursor: pointer; border-radius: var(--radius-sm); }
.wb-lc-open:hover { text-decoration: underline; }
.wb-lc-open:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
