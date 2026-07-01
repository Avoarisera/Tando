<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** 0–100. Ignored when indeterminate. */
  value?: number
  variant?: 'blue' | 'green' | 'red'
  indeterminate?: boolean
}>(), {
  value: 0,
  variant: 'blue',
  indeterminate: false,
})

const barColor: Record<NonNullable<typeof props.variant>, string> = {
  blue:  'bg-blue-500',
  green: 'bg-green-500',
  red:   'bg-red-500',
}

const pct = computed(() => Math.max(0, Math.min(100, Math.round(props.value))))
</script>

<template>
  <div
    class="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
    role="progressbar"
    :aria-valuenow="indeterminate ? undefined : pct"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div
      v-if="indeterminate"
      :class="['h-full w-1/3 animate-pulse rounded-full', barColor[variant]]"
    />
    <div
      v-else
      :class="['h-full rounded-full transition-all duration-500 ease-out', barColor[variant]]"
      :style="{ width: pct + '%' }"
    />
  </div>
</template>
