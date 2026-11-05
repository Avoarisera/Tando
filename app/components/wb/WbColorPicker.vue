<script setup lang="ts">
// Leave colours are stored as hex in the database; swatches: LEAVE_PALETTE (utils/wb.ts).
defineProps<{ label: string }>()
const model = defineModel<string>({ required: true })
const name = useId()
const { t } = useI18n()
// A colour saved before the redesign stays selectable
const options = computed(() => (LEAVE_PALETTE.some(p => p.hex.toLowerCase() === model.value.toLowerCase())
  ? LEAVE_PALETTE
  : [...LEAVE_PALETTE, { name: 'current', hex: model.value }]))
</script>

<template>
  <fieldset class="wb-colors">
    <legend class="wb-label">{{ label }}</legend>
    <div>
      <label
        v-for="c in options"
        :key="c.hex"
        :class="['wb-swatch', { 'is-on': c.hex.toLowerCase() === model.toLowerCase() }]"
        :title="t(`colors.${c.name}`)"
        :style="leaveVars(c.hex)"
      >
        <input v-model="model" type="radio" :name="name" class="wb-sr" :value="c.hex" :aria-label="t(`colors.${c.name}`)">
        <WbIcon name="check" :size="14" />
      </label>
    </div>
  </fieldset>
</template>
