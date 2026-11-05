<script setup lang="ts">
const props = defineProps<{ text: string, trend?: 'up' | 'down' | 'neutral' }>()
// A trend is information, not a verdict: up/down use info and neutral tones
const icon = computed(() => (props.trend === 'up' ? 'arrow-up' : props.trend === 'down' ? 'arrow-down' : 'minus'))
</script>

<template>
  <p class="wb-trend small wb-mut2 wb-insight">
    <WbIcon :name="icon" :size="14" /><span>{{ text }}</span>
  </p>
</template>

<style scoped>
.wb-insight { margin-top: var(--space-2); }
</style>
