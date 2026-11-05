<script setup lang="ts">
// Centered dialog. Escape and the scrim close it; focus is trapped inside.
const props = defineProps<{ title: string, description?: string, tone?: 'danger' }>()
const emit = defineEmits<{ close: [] }>()
const box = ref<HTMLElement | null>(null)
let previous: HTMLElement | null = null
const titleId = useId()

onMounted(() => {
  previous = document.activeElement as HTMLElement | null
  nextTick(() => box.value?.querySelector<HTMLElement>('textarea, input, footer button')?.focus())
})
onBeforeUnmount(() => previous?.focus?.())

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key !== 'Tab' || !box.value) return
  const items = Array.from(box.value.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, a[href]'))
  const first = items.at(0)
  const last = items.at(-1)
  if (!first || !last) return
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
</script>

<template>
  <div class="wb-ov wb-ov-c wb-modal-ov" @keydown="onKey">
    <div class="wb-scrim" @click="emit('close')" />
    <div ref="box" class="wb-modal" :class="{ 'is-danger': props.tone === 'danger' }" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <header>
        <WbIcon v-if="props.tone === 'danger'" name="triangle-alert" :size="20" class="wb-c-danger" />
        <div>
          <h2 :id="titleId" class="h2">{{ props.title }}</h2>
          <p v-if="props.description" class="small wb-mut2">{{ props.description }}</p>
        </div>
      </header>
      <slot />
      <footer><slot name="footer" /></footer>
    </div>
  </div>
</template>

<style scoped>
.wb-modal-ov { position: fixed; z-index: 60; }
.wb-modal-ov .wb-scrim { position: fixed; }
.wb-modal > header { display: flex; gap: var(--space-3); align-items: flex-start; }
</style>
