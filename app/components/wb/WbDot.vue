<script setup lang="ts">
const props = withDefaults(defineProps<{ color?: string, size?: number }>(), { color: 'gray', size: 10 })
const style = computed(() => ({ ...leaveVars(props.color), width: `${props.size}px`, height: `${props.size}px` }))
</script>

<template>
  <span class="wb-dot" :style="style" aria-hidden="true" />
</template>
