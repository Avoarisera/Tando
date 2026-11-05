<script setup lang="ts">
defineProps<{ title: string, value: string, name: string, desc?: string, meta?: string, color?: string, disabled?: boolean }>()
const model = defineModel<string>({ default: '' })
</script>

<template>
  <label class="wb-rc" :class="{ 'is-on': model === value, 'is-dis': disabled }">
    <input v-model="model" type="radio" :name="name" :value="value" :disabled="disabled">
    <WbDot v-if="color" :color="color" />
    <span class="wb-rc-b">
      <span class="h3">{{ title }}</span>
      <span v-if="desc" class="wb-mut small">{{ desc }}</span>
    </span>
    <span v-if="meta" class="wb-num small wb-mut">{{ meta }}</span>
  </label>
</template>
