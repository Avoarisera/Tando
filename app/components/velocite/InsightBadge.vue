<script setup lang="ts">
const props = defineProps<{
  text: string
  trend?: 'up' | 'down' | 'neutral'
}>()

const classes = computed(() => {
  if (props.trend === 'up') return 'bg-green-50 text-green-700 border-green-200'
  if (props.trend === 'down') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
})
</script>

<template>
  <div :class="['mt-2 rounded-md border px-3 py-1.5 text-xs', classes]">
    {{ text }}
  </div>
</template>
