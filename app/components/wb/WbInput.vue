<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  label?: string
  hint?: string
  error?: string | null
  required?: boolean
  icon?: string
  prefix?: string
  id?: string
  disabled?: boolean
}>()
const model = defineModel<string>({ default: '' })

const autoId = useId()
const inputId = computed(() => props.id ?? autoId)
const describedBy = computed(() => (props.hint || props.error ? `${inputId.value}-h` : undefined))
</script>

<template>
  <WbField :id="inputId" :label="label" :hint="hint" :error="error" :required="required">
    <span class="wb-input" :class="{ 'is-dis': disabled }">
      <WbIcon v-if="icon" :name="icon" :size="16" />
      <span v-if="prefix" class="wb-affix">{{ prefix }}</span>
      <input
        :id="inputId"
        v-model="model"
        v-bind="$attrs"
        :disabled="disabled"
        :required="required"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="describedBy"
      >
      <span v-if="$slots.suffix" class="wb-affix"><slot name="suffix" /></span>
    </span>
  </WbField>
</template>
