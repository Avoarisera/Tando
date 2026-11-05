<script setup lang="ts">
import type { InvoiceStatus } from '~/types/index'
import type { WbBadgeTone } from '~/components/wb/WbBadge.vue'

defineProps<{ status: InvoiceStatus }>()
const { t } = useI18n()
const TONE: Record<InvoiceStatus, [WbBadgeTone, string]> = {
  en_attente: ['neutral', 'clock'],
  envoyee: ['info', 'send'],
  payee: ['success', 'circle-check'],
}
</script>

<template>
  <WbBadge :tone="TONE[status][0]" :icon="TONE[status][1]">{{ t(`invoices.status.${status}`) }}</WbBadge>
</template>
