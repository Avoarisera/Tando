<script setup lang="ts">
import type { ComputedRef } from 'vue'

interface SelectContext {
  currentValue: ComputedRef<string | null>
  select: (value: string) => void
}

const props = defineProps<{ value: string }>()

const ctx = inject<SelectContext>('AppSelect')
const isSelected = computed(() => ctx?.currentValue.value === props.value)

function pick() {
  ctx?.select(props.value)
}
</script>

<template>
  <li
    role="option"
    :aria-selected="isSelected"
    tabindex="0"
    class="flex items-center justify-between gap-3 px-3 py-1.5 cursor-pointer hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
    :class="isSelected ? 'bg-brand-primary/5' : ''"
    @click="pick"
    @keydown.enter.prevent="pick"
    @keydown.space.prevent="pick"
  >
    <slot />
    <svg
      v-if="isSelected"
      class="w-3.5 h-3.5 text-brand-primary shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
    </svg>
  </li>
</template>
