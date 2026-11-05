<script setup lang="ts">
defineProps<{
  id: string
  label?: string
  hint?: string
  error?: string | null
  required?: boolean
  counter?: string
}>()
</script>

<template>
  <div class="wb-field" :class="{ 'is-err': !!error }">
    <label v-if="label" class="wb-label" :for="id">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <slot />
    <div v-if="hint || error || counter" class="wb-hint">
      <span :id="`${id}-h`">
        <template v-if="error"><WbIcon name="circle-alert" :size="14" /> {{ error }}</template>
        <template v-else>{{ hint }}</template>
      </span>
      <span v-if="counter" class="wb-num">{{ counter }}</span>
    </div>
  </div>
</template>
