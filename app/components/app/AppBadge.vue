<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string
  variant?: 'gray' | 'blue' | 'green' | 'red' | 'amber'
}>(), {
  variant: 'gray',
})

const variantClasses: Record<NonNullable<typeof props.variant>, string> = {
  gray:  'bg-gray-100 text-gray-700',
  blue:  'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red:   'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-700',
}

const classes = computed(() => variantClasses[props.variant])
</script>

<template>
  <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', classes]">
    {{ label }}
  </span>
</template>
