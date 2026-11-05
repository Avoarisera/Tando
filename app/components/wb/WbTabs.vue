<script setup lang="ts">
export interface WbTab { id: string, label: string, count?: number }

defineProps<{ tabs: WbTab[], label: string }>()
const model = defineModel<string>({ required: true })

function onKey(e: KeyboardEvent, tabs: WbTab[]) {
  const i = tabs.findIndex(t => t.id === model.value)
  const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -2
  if (next === -2) return
  e.preventDefault()
  const tab = tabs[(next + tabs.length) % tabs.length]
  if (tab) model.value = tab.id
}
</script>

<template>
  <div class="wb-tabs" role="tablist" :aria-label="label" @keydown="onKey($event, tabs)">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      role="tab"
      type="button"
      :aria-selected="model === tab.id"
      :tabindex="model === tab.id ? 0 : -1"
      :class="{ 'is-on': model === tab.id }"
      @click="model = tab.id"
    >
      {{ tab.label }}<span v-if="tab.count != null" class="wb-num wb-tab-n">{{ tab.count }}</span>
    </button>
  </div>
</template>
