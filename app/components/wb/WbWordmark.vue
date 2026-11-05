<script setup lang="ts">
withDefaults(defineProps<{ size?: number, compact?: boolean }>(), { size: 20, compact: false })
</script>

<template>
  <span class="wb-word" :style="{ fontSize: `${size}px` }">
    <template v-if="compact">W</template>
    <template v-else>Waka<b>Bods</b></template>
  </span>
</template>
