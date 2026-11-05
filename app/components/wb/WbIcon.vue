<script setup lang="ts">
import ICONS from '~/assets/wb/icons.json'

// Lucide paths, 2 px stroke, extracted by the design system (icons.json).
const props = withDefaults(defineProps<{ name: string, size?: number }>(), { size: 18 })
const paths = computed(() => (ICONS as Record<string, string>)[props.name] ?? '')
</script>

<template>
  <svg
    v-if="paths"
    class="wb-ic"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="paths"
  />
</template>
