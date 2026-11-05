<script setup lang="ts">
const props = defineProps<{ months: readonly string[], features: readonly number[], bugs: readonly number[] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const labels = computed(() => props.months.map(m => velociteMonth(m, tag.value)))
</script>

<template>
  <WbBarChart
    :title="t('velocityB.charts.composition')"
    :labels="labels"
    :series="[
      { label: t('velocityB.charts.features'), data: features, color: '--chart-1' },
      { label: t('velocityB.charts.bugs'), data: bugs, color: '--chart-2' },
    ]"
    stacked
    :height="200"
    :legend="false"
  />
</template>
