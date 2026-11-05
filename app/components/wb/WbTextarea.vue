<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{ label?: string, hint?: string, error?: string | null, max?: number, rows?: number, id?: string }>(), { rows: 3 })
const model = defineModel<string>({ default: '' })
const autoId = useId()
const taId = computed(() => props.id ?? autoId)
const counter = computed(() => (props.max ? `${model.value.length} / ${props.max}` : undefined))
</script>

<template>
  <WbField :id="taId" :label="label" :hint="hint" :error="error" :counter="counter">
    <span class="wb-input wb-ta">
      <textarea :id="taId" v-model="model" v-bind="$attrs" :rows="rows" :maxlength="max" :aria-describedby="hint || error ? `${taId}-h` : undefined" />
    </span>
  </WbField>
</template>
