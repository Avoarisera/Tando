<script setup lang="ts">
defineProps<{
  id: string
  message: string
  type: 'success' | 'error'
}>()
defineEmits<{ dismiss: [id: string] }>()
</script>

<template>
  <div
    :class="[
      'flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg min-w-72 max-w-sm',
      type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
    ]"
    role="alert"
    :aria-live="type === 'error' ? 'assertive' : 'polite'"
  >
    <span :class="type === 'success' ? 'text-green-600' : 'text-red-600'" class="text-sm flex-1">
      {{ message }}
    </span>
    <button
      :class="type === 'success' ? 'text-green-400 hover:text-green-600' : 'text-red-400 hover:text-red-600'"
      aria-label="Fermer la notification"
      @click="$emit('dismiss', id)"
    >
      ✕
    </button>
  </div>
</template>
