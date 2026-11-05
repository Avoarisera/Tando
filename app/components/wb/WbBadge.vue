<script setup lang="ts">
export type WbBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'indigo'

withDefaults(defineProps<{ tone?: WbBadgeTone, icon?: string, strike?: boolean, size?: 'sm' | 'md' }>(), { tone: 'neutral', size: 'md' })
</script>

<template>
  <span :class="['wb-badge', `wb-t-${tone}`, { 'is-strike': strike, 'wb-badge-sm': size === 'sm' }]">
    <WbIcon v-if="icon" :name="icon" :size="13" />
    <span><slot /></span>
  </span>
</template>
