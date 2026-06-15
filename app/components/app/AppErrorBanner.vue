<script setup lang="ts">
defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="rounded-md bg-red-50 p-4 flex items-start gap-3">
    <p class="text-sm text-red-700 flex-1">{{ message }}</p>
    <button
      type="button"
      class="text-sm font-medium text-red-700 underline shrink-0"
      @click="$emit('retry')"
    >
      Réessayer
    </button>
  </div>
</template>
