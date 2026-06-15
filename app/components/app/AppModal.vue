<script setup lang="ts">
defineProps<{
  title: string
  maxWidth?: string
}>()
const emit = defineEmits<{ close: [] }>()

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div
    class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
    @click.self="$emit('close')"
  >
    <div
      :class="['bg-white rounded-xl shadow-xl w-full', maxWidth ?? 'max-w-lg']"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 id="modal-title" class="text-lg font-semibold text-gray-900">{{ title }}</h2>
        <button
          class="text-gray-400 hover:text-gray-600 p-1 rounded"
          aria-label="Fermer"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>
      <div class="px-6 py-4">
        <slot />
      </div>
    </div>
  </div>
</template>
