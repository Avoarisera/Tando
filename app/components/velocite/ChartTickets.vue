<script setup lang="ts">
const props = defineProps<{ months: readonly string[], values: readonly number[] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const labels = computed(() => props.months.map(m => velociteMonth(m, tag.value)))
</script>

<template>
  <WbLineChart
    :title="t('velocityB.charts.tickets')"
    :labels="labels"
    :series="[{ label: t('velocityB.charts.delivered'), data: values }]"
    area
    :height="200"
    :legend="false"
  />
</template>
