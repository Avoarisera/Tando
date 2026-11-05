<script setup lang="ts">
export type WbGaugeState = 'ok' | 'busy' | 'over'

const props = withDefaults(defineProps<{
  value: number
  max: number
  label: string
  state?: WbGaugeState
  unit?: string
  stateLabel?: string
}>(), { state: 'ok', unit: 'pts' })

const TONE = { ok: ['success', 'circle-check'], busy: ['warning', 'triangle-alert'], over: ['danger', 'circle-alert'] } as const
const tone = computed(() => TONE[props.state][0])
const icon = computed(() => TONE[props.state][1])
// The 80 % mark is the "full" line; overload shows up to 125 % of max.
const width = computed(() => `${Math.min(props.max ? props.value / props.max : 0, 1.25) * 80}%`)
</script>

<template>
  <div class="wb-gauge">
    <div class="wb-gauge-l small">
      <span>{{ label }}</span>
      <span class="wb-num wb-mut2">{{ value }} / {{ max }} {{ unit }}</span>
    </div>
    <div class="wb-gauge-t">
      <span :class="`wb-fill-${tone}`" :style="{ width }" />
      <i style="left: 80%" />
    </div>
    <WbBadge v-if="stateLabel" :tone="tone" :icon="icon" size="sm">{{ stateLabel }}</WbBadge>
  </div>
</template>
