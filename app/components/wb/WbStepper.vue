<script setup lang="ts">
export interface WbStep { label: string, state: 'done' | 'wait' | 'refused' | 'todo', who?: string, date?: string }

// waitLabel: caption of the current step when it has no date (leave status by default)
const props = defineProps<{ steps: WbStep[], compact?: boolean, waitLabel?: string }>()
const { t } = useI18n()
const ICON: Record<WbStep['state'], string> = { done: 'check', wait: 'clock', refused: 'x', todo: 'circle' }
</script>

<template>
  <ol class="wb-steps" :class="{ 'is-compact': props.compact }">
    <li v-for="(s, i) in props.steps" :key="i" :class="`is-${s.state}`">
      <span class="wb-step-m"><WbIcon :name="ICON[s.state]" :size="13" /></span>
      <span class="wb-step-t">
        <b class="small">{{ s.label }}</b>
        <span v-if="s.who || s.date" class="wb-mut caption2">{{ [s.date, s.who].filter(Boolean).join(' · ') }}</span>
        <span v-else-if="s.state === 'wait' && props.waitLabel !== ''" class="wb-mut caption2">{{ props.waitLabel ?? t('leave.status.pending') }}</span>
      </span>
    </li>
  </ol>
</template>
