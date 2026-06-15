<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  disabled?: boolean
  type?: 'button' | 'submit'
}>(), {
  variant: 'primary',
  disabled: false,
  type: 'button',
})
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled"
    class="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    :class="{
      'bg-brand-primary text-white hover:bg-blue-700': props.variant === 'primary',
      'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50': props.variant === 'secondary',
      'bg-brand-danger text-white hover:bg-red-700': props.variant === 'danger',
      'text-gray-600 hover:bg-gray-100': props.variant === 'ghost',
    }"
  >
    <slot />
  </button>
</template>
