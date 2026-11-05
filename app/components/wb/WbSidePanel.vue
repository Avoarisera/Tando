<script setup lang="ts">
// Right-hand panel (bottom sheet under 768 px). Escape and the scrim close it;
// focus moves in on open and is trapped while open.
const props = withDefaults(defineProps<{ title: string, subtitle?: string, width?: number }>(), { width: 520 })
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const panel = ref<HTMLElement | null>(null)
let previous: HTMLElement | null = null

onMounted(() => {
  previous = document.activeElement as HTMLElement | null
  nextTick(() => panel.value?.querySelector<HTMLElement>('header button')?.focus())
})
onBeforeUnmount(() => previous?.focus?.())

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key !== 'Tab' || !panel.value) return
  const items = Array.from(panel.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]'))
  const first = items.at(0)
  const last = items.at(-1)
  if (!first || !last) return
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
</script>

<template>
  <div class="wb-ov wb-ov-r wb-panel-ov" @keydown="onKey">
    <div class="wb-scrim" @click="emit('close')" />
    <aside ref="panel" class="wb-panel" role="dialog" aria-modal="true" :aria-label="props.title" :style="{ '--w': `${props.width}px` }">
      <span class="wb-grab" aria-hidden="true" />
      <header>
        <div class="wb-grow">
          <h2 class="h2">{{ title }}</h2>
          <p v-if="subtitle" class="small wb-mut">{{ subtitle }}</p>
        </div>
        <WbButton variant="ghost" size="sm" icon="x" icon-only @click="emit('close')">{{ t('common.close') }}</WbButton>
      </header>
      <div class="wb-panel-b"><slot /></div>
      <footer v-if="$slots.footer"><slot name="footer" /></footer>
    </aside>
  </div>
</template>

<style scoped>
.wb-panel-ov { position: fixed; z-index: 45; }
.wb-panel-ov .wb-scrim { position: fixed; }
/* The body scrolls inside the panel, so the footer button stays reachable */
.wb-panel-ov .wb-panel-b { overflow-y: auto; min-height: 0; }
@container wbapp (min-width: 768px) {
  .wb-panel-ov .wb-panel { max-height: 100%; }
}
</style>
