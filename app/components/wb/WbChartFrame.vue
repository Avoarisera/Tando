<script setup lang="ts">
// Title, optional info, average box and legend around a chart (design ChartFrame).
// Legend colours are CSS custom properties ("--chart-1"): colour is never alone, the label says it.
export interface WbLegendItem { label: string, color?: string }

withDefaults(defineProps<{ title: string, info?: string, avg?: string, legend?: WbLegendItem[] }>(), { legend: () => [] })
</script>

<template>
  <figure class="wb-cf">
    <figcaption>
      <div class="wb-row">
        <span class="h3">{{ title }}</span>
        <span v-if="info" class="wb-info" :title="info" tabindex="0" role="img" :aria-label="info"><WbIcon name="info" :size="14" /></span>
      </div>
      <span v-if="avg" class="wb-avg-box small">{{ avg }}</span>
    </figcaption>
    <slot />
    <ul v-if="legend.length" class="wb-leg caption">
      <li v-for="(l, i) in legend" :key="l.label"><i :style="{ background: `var(${l.color ?? `--chart-${(i % 6) + 1}`})` }" />{{ l.label }}</li>
    </ul>
  </figure>
</template>
