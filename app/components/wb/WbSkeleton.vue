<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'cards' | 'table' | 'metric', count?: number }>(), { variant: 'cards', count: 3 })
const { t } = useI18n()
</script>

<template>
  <div class="wb-skel" role="status" :aria-label="t('common.loading')">
    <span class="wb-sr">{{ t('common.loading') }}</span>
    <div v-if="variant === 'metric'" class="wb-grid wb-cols-4">
      <div v-for="i in count" :key="i" class="wb-card wb-card-b wb-stack-s"><span class="wb-sk" style="width: 60%; height: 12px" /><span class="wb-sk" style="width: 40%; height: 28px" /></div>
    </div>
    <div v-else-if="variant === 'table'" class="wb-card wb-card-b wb-stack-s">
      <div v-for="i in count" :key="i" class="wb-row"><span class="wb-sk" style="width: 32px; height: 32px; border-radius: 999px" /><span class="wb-sk" style="width: 30%; height: 12px" /><span class="wb-sk" style="width: 20%; height: 12px" /><span class="wb-sk" style="width: 15%; height: 12px" /></div>
    </div>
    <div v-else class="wb-stack">
      <div v-for="i in count" :key="i" class="wb-card wb-card-b wb-stack-s"><span class="wb-sk" style="width: 45%; height: 16px" /><span class="wb-sk" style="width: 70%; height: 12px" /><span class="wb-sk" style="width: 100%; height: 28px" /></div>
    </div>
  </div>
</template>
