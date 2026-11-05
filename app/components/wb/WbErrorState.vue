<script setup lang="ts">
defineProps<{ message?: string | null }>()
defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <WbBanner tone="danger">
    {{ message || t('common.loadError') }}
    <template #action>
      <WbButton variant="secondary" size="sm" icon="refresh-cw" @click="$emit('retry')">{{ t('common.retry') }}</WbButton>
    </template>
  </WbBanner>
</template>
