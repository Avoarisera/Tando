<script setup lang="ts">
import type { ComputedRef } from 'vue'

interface SelectContext {
  currentValue: ComputedRef<string | null>
  select: (value: string) => void
}

const props = defineProps<{
  value: string | null
  ariaLabel?: string
}>()

const emit = defineEmits<{
  change: [value: string]
}>()

const isOpen = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const listboxRef = ref<HTMLElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})

function recalcPosition() {
  const rect = triggerRef.value?.getBoundingClientRect()
  if (!rect) return
  dropdownStyle.value = {
    position:  'fixed',
    top:       `${rect.bottom + 4}px`,
    left:      `${rect.left}px`,
    minWidth:  `${rect.width}px`,
  }
}

function select(value: string) {
  emit('change', value)
  isOpen.value = false
}

function toggle() {
  if (!isOpen.value) recalcPosition()
  isOpen.value = !isOpen.value
}

provide<SelectContext>('AppSelect', {
  currentValue: computed(() => props.value),
  select,
})

function handleOutsideClick(e: MouseEvent) {
  if (
    !containerRef.value?.contains(e.target as Node) &&
    !listboxRef.value?.contains(e.target as Node)
  ) {
    isOpen.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') isOpen.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick)
  document.addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', handleOutsideClick)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="containerRef" class="relative inline-block">
    <button
      ref="triggerRef"
      type="button"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      :aria-label="ariaLabel"
      class="flex w-full items-center justify-between gap-1.5 rounded focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1"
      @click="toggle"
    >
      <slot name="trigger" :value="value" />
      <svg
        class="w-3 h-3 text-gray-400 shrink-0 transition-transform duration-150"
        :class="isOpen ? 'rotate-180' : ''"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-100 ease-out origin-top-left"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-75 ease-in origin-top-left"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <ul
          v-if="isOpen"
          ref="listboxRef"
          role="listbox"
          :style="dropdownStyle"
          class="z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
        >
          <slot />
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>
