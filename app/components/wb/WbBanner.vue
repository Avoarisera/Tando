<script setup lang="ts">
export type WbTone = 'info' | 'warning' | 'danger' | 'success'

const props = withDefaults(defineProps<{ tone?: WbTone, title?: string }>(), { tone: 'info' })
const ICON: Record<WbTone, string> = { info: 'info', warning: 'triangle-alert', danger: 'circle-alert', success: 'circle-check' }
</script>

<template>
  <div :class="['wb-banner', `wb-t-${props.tone}`]" :role="props.tone === 'danger' ? 'alert' : 'status'">
    <WbIcon :name="ICON[props.tone]" :size="18" />
    <div class="wb-grow">
      <template v-if="title"><b>{{ title }}</b>{{ ' ' }}</template><slot />
    </div>
    <slot name="action" />
  </div>
</template>
