<script setup lang="ts">
export interface WbSegOption { value: string, label: string, icon?: string }

defineProps<{ options: WbSegOption[], label: string }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="wb-seg" role="group" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      :aria-pressed="model === o.value"
      :class="{ 'is-on': model === o.value }"
      @click="model = o.value"
    >
      <WbIcon v-if="o.icon" :name="o.icon" :size="16" />{{ o.label }}
    </button>
  </div>
</template>
