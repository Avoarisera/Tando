<script setup lang="ts">
defineOptions({ inheritAttrs: false })

defineProps<{ label: string, hint?: string, error?: string | null, disabled?: boolean, id?: string }>()
const model = defineModel<string>({ default: '' })
const { t } = useI18n()
const visible = ref(false)
</script>

<template>
  <WbInput
    :id="id"
    v-model="model"
    v-bind="$attrs"
    :label="label"
    :hint="hint"
    :error="error"
    :disabled="disabled"
    :type="visible ? 'text' : 'password'"
  >
    <template #suffix>
      <WbButton
        variant="ghost"
        size="sm"
        icon-only
        :icon="visible ? 'eye-off' : 'eye'"
        :aria-pressed="visible"
        @click="visible = !visible"
      >
        {{ visible ? t('common.hidePassword') : t('common.showPassword') }}
      </WbButton>
    </template>
  </WbInput>
</template>
