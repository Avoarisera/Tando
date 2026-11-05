<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

export type WbButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type WbButtonSize = 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
  variant?: WbButtonVariant
  size?: WbButtonSize
  icon?: string
  iconRight?: string
  iconOnly?: boolean
  loading?: boolean
  block?: boolean
  disabled?: boolean
  to?: RouteLocationRaw
  type?: 'button' | 'submit' | 'reset'
}>(), { variant: 'primary', size: 'md', type: 'button' })

const classes = computed(() => [
  'wb-btn',
  `wb-btn-${props.variant}`,
  `wb-btn-${props.size}`,
  props.iconOnly && 'wb-btn-icon',
  props.block && 'wb-btn-block',
])
const iconSize = computed(() => (props.size === 'sm' ? 16 : 18))
</script>

<template>
  <NuxtLink v-if="to" :to="to" :class="classes">
    <WbIcon v-if="icon" :name="icon" :size="iconSize" />
    <span v-if="iconOnly" class="wb-sr"><slot /></span>
    <slot v-else />
    <WbIcon v-if="iconRight" :name="iconRight" :size="16" />
  </NuxtLink>
  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="disabled || loading || undefined"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="wb-spin" aria-hidden="true" />
    <WbIcon v-else-if="icon" :name="icon" :size="iconSize" />
    <span v-if="iconOnly" class="wb-sr"><slot /></span>
    <slot v-else />
    <WbIcon v-if="iconRight" :name="iconRight" :size="16" />
  </button>
</template>
