<script setup lang="ts">
import type { LeaveStatus } from '~/types/index'
import type { WbBadgeTone } from './WbBadge.vue'

const props = defineProps<{ status: LeaveStatus }>()
const { t } = useI18n()

// Fixed tones from the design system: pending neutral, manager warning, approved success, refused danger
const TONES: Record<LeaveStatus, [WbBadgeTone, string]> = {
  pending: ['neutral', 'clock'],
  manager_approved: ['warning', 'check'],
  approved: ['success', 'circle-check'],
  rejected: ['danger', 'circle-x'],
}
const tone = computed(() => TONES[props.status][0])
const icon = computed(() => TONES[props.status][1])
</script>

<template>
  <WbBadge :tone="tone" :icon="icon">{{ t(`leave.status.${status}`) }}</WbBadge>
</template>
