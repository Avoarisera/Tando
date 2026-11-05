<script setup lang="ts">
const props = defineProps<{ color?: string, name: string }>()
const style = computed(() => leaveVars(props.color))
</script>

<template>
  <span class="wb-tb" :style="style"><WbDot :color="color" :size="8" />{{ name }}</span>
</template>
