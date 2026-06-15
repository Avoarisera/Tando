<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="flex flex-col items-center py-12 text-center">
    <p class="text-lg font-medium text-gray-900">{{ title }}</p>
    <p v-if="description" class="mt-1 text-sm text-gray-500">{{ description }}</p>
    <slot />
  </div>
</template>
