<script setup lang="ts">
defineProps<{ label: string, value: string | number, unit?: string, tone?: 'danger' | 'warning', hint?: string, info?: string }>()
</script>

<template>
  <div class="wb-metric">
    <div class="wb-metric-l">
      <span class="small wb-mut2">{{ label }}</span>
      <span v-if="info" class="wb-info" :title="info" tabindex="0" role="img" :aria-label="info"><WbIcon name="info" :size="14" /></span>
    </div>
    <div class="wb-metric-v">
      <span :class="['display', 'wb-num', tone && `wb-c-${tone}`]">{{ value }}</span>
      <span v-if="unit" class="small wb-mut">{{ unit }}</span>
    </div>
    <p v-if="hint" class="caption wb-mut">{{ hint }}</p>
    <slot />
  </div>
</template>
