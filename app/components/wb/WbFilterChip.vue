<script setup lang="ts">
defineProps<{ count?: number }>()
const model = defineModel<boolean>({ default: false })
</script>

<template>
  <button type="button" class="wb-chip" :class="{ 'is-on': model }" :aria-pressed="model" @click="model = !model">
    <slot /><span v-if="count != null" class="wb-num wb-chip-n">{{ count }}</span>
  </button>
</template>
