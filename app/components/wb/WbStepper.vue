<script setup lang="ts">
export interface WbStep { label: string, state: 'done' | 'wait' | 'refused' | 'todo', who?: string, date?: string }

// waitLabel: caption of the current step when it has no date (leave status by default)
// inline: one-line mini stepper for list rows (dates move to the tooltip)
const props = defineProps<{ steps: WbStep[], compact?: boolean, waitLabel?: string, inline?: boolean }>()
const { t } = useI18n()
const ICON: Record<WbStep['state'], string> = { done: 'check', wait: 'clock', refused: 'x', todo: 'circle' }
const caption = (s: WbStep) => [s.date, s.who].filter(Boolean).join(' · ')
</script>

<template>
  <ol v-if="props.inline" class="wb-mini-steps">
    <li v-for="(s, i) in props.steps" :key="i" :class="`is-${s.state}`" :title="caption(s) || undefined">
      <span class="wb-mini-m"><WbIcon :name="ICON[s.state]" :size="10" /></span>
      <span class="caption2">{{ s.label }}</span>
      <span v-if="caption(s)" class="wb-sr">{{ caption(s) }}</span>
    </li>
  </ol>
  <ol v-else class="wb-steps" :class="{ 'is-compact': props.compact }">
    <li v-for="(s, i) in props.steps" :key="i" :class="`is-${s.state}`">
      <span class="wb-step-m"><WbIcon :name="ICON[s.state]" :size="13" /></span>
      <span class="wb-step-t">
        <b class="small">{{ s.label }}</b>
        <span v-if="caption(s)" class="wb-mut caption2">{{ caption(s) }}</span>
        <span v-else-if="s.state === 'wait' && props.waitLabel !== ''" class="wb-mut caption2">{{ props.waitLabel ?? t('leave.status.pending') }}</span>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.wb-mini-steps { list-style: none; margin: 0; padding: 0; display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }
.wb-mini-steps li { display: inline-flex; align-items: center; gap: 4px; color: var(--ink-3); white-space: nowrap; }
.wb-mini-steps li:not(:last-child)::after { content: ""; width: 14px; height: 2px; border-radius: 2px; background: var(--border); margin-left: 2px; }
.wb-mini-steps li.is-done:not(:last-child)::after { background: var(--success-solid); }
.wb-mini-m { width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2); border: 1.5px solid var(--border-strong); color: var(--ink-3); flex: none; }
.is-done .wb-mini-m { background: var(--success-solid); border-color: var(--success-solid); color: var(--on-success); }
.is-done { color: var(--ink-2); }
.is-wait .wb-mini-m { background: var(--warning-tint); border-color: var(--warning-text); color: var(--warning-text); }
.is-wait { color: var(--warning-text); font-weight: 600; }
.is-refused .wb-mini-m { background: var(--danger-solid); border-color: var(--danger-solid); color: var(--on-danger); }
.is-refused { color: var(--danger-text); }
</style>
