<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const props = defineProps<{ label?: string, indeterminate?: boolean, disabled?: boolean }>()
const model = defineModel<boolean>({ default: false })
const input = ref<HTMLInputElement | null>(null)
watchEffect(() => { if (input.value) input.value.indeterminate = !!props.indeterminate })
</script>

<template>
  <label class="wb-check" :class="{ 'is-dis': disabled }">
    <input ref="input" v-model="model" type="checkbox" :disabled="disabled" v-bind="$attrs">
    <span class="wb-box"><WbIcon :name="indeterminate ? 'minus' : 'check'" :size="14" /></span>
    <span v-if="label">{{ label }}</span>
  </label>
</template>
