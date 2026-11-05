<script setup lang="ts">
// Language switch for public pages; the choice is kept in the wb_lang cookie.
defineProps<{ withLabel?: boolean }>()
const { t, locale, locales, setLocale } = useI18n()

const options = computed(() => locales.value.map(l => ({ value: l.code, label: l.name ?? l.code })))
const current = computed({
  get: () => locale.value,
  set: (code: string) => { setLocale(code as typeof locale.value) },
})
</script>

<template>
  <WbSelect
    v-model="current"
    :options="options"
    :label="withLabel ? t('common.language') : undefined"
    :aria-label="withLabel ? undefined : t('common.language')"
  />
</template>
