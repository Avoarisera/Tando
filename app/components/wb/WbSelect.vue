<script setup lang="ts">
defineOptions({ inheritAttrs: false })

export interface WbSelectOption { value: string, label: string }

const props = defineProps<{
  options: WbSelectOption[]
  label?: string
  hint?: string
  error?: string | null
  id?: string
}>()
const model = defineModel<string>({ default: '' })

const autoId = useId()
const selectId = computed(() => props.id ?? autoId)
</script>

<template>
  <WbField :id="selectId" :label="label" :hint="hint" :error="error">
    <span class="wb-input wb-select">
      <select :id="selectId" v-model="model" v-bind="$attrs">
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <WbIcon name="chevron-down" :size="16" />
    </span>
  </WbField>
</template>
