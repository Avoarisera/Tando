<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'sm' | 'md'
  color?: 'white' | 'gray'
}>(), {
  size: 'sm',
  color: 'white',
})
</script>

<template>
  <span
    :class="[
      'inline-block animate-spin rounded-full border-2 border-t-transparent',
      size === 'sm' ? 'w-4 h-4' : 'w-5 h-5',
      color === 'white' ? 'border-white' : 'border-gray-400',
    ]"
    aria-hidden="true"
  />
</template>
