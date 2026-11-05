<script setup lang="ts">
defineProps<{
  id: string
  message: string
  type: 'success' | 'error'
}>()
defineEmits<{ dismiss: [id: string] }>()
const { t } = useI18n()
</script>

<template>
  <div
    :class="['wb-toast', type === 'error' ? 'is-danger' : 'is-success']"
    role="alert"
    :aria-live="type === 'error' ? 'assertive' : 'polite'"
  >
    <WbIcon :name="type === 'error' ? 'circle-alert' : 'circle-check'" :size="18" />
    <span class="wb-grow">{{ message }}</span>
    <button type="button" class="wb-toast-x" :aria-label="t('common.closeNotification')" @click="$emit('dismiss', id)">
      <WbIcon name="x" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.wb-toast { font-family: var(--font-sans); font-size: 14px; line-height: 20px; }
.wb-toast.is-danger { background: var(--danger-solid); color: var(--on-danger); }
.wb-toast-x { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-sm); text-decoration: none !important; }
</style>
