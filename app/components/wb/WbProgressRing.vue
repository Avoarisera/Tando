<script setup lang="ts">
const props = withDefaults(defineProps<{ value: number, max: number, size?: number, label?: string, unit?: string }>(), { size: 112, unit: '' })
const r = computed(() => props.size / 2 - 8)
const c = computed(() => 2 * Math.PI * r.value)
const dash = computed(() => `${props.max > 0 ? (c.value * Math.max(0, Math.min(props.value, props.max))) / props.max : 0} ${c.value}`)
</script>

<template>
  <div class="wb-ring" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="`${label ?? ''} ${value} / ${max} ${unit}`">
    <svg :width="size" :height="size">
      <circle :cx="size / 2" :cy="size / 2" :r="r" class="t" />
      <circle :cx="size / 2" :cy="size / 2" :r="r" class="f" :stroke-dasharray="dash" :transform="`rotate(-90 ${size / 2} ${size / 2})`" />
    </svg>
    <span><b class="h1 wb-num">{{ value }}</b><i class="caption wb-mut">/ {{ max }} {{ unit }}</i></span>
  </div>
</template>
