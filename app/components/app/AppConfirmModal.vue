<script setup lang="ts">
defineProps<{
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
}>()
const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const isConfirming = ref(false)

async function handleConfirm() {
  isConfirming.value = true
  emit('confirm')
}

function handleCancel() {
  isConfirming.value = false
  emit('cancel')
}
</script>

<template>
  <AppModal :title="title" @close="handleCancel">
    <p class="text-gray-600 text-sm">{{ description }}</p>
    <div class="flex justify-end gap-3 mt-6">
      <AppButton variant="secondary" @click="handleCancel">
        {{ cancelLabel ?? 'Annuler' }}
      </AppButton>
      <AppButton
        variant="primary"
        :disabled="isConfirming"
        @click="handleConfirm"
      >
        <span v-if="isConfirming" class="flex items-center gap-2">
          <AppSpinner />
          En cours…
        </span>
        <span v-else>{{ confirmLabel ?? 'Confirmer' }}</span>
      </AppButton>
    </div>
  </AppModal>
</template>
