<script setup lang="ts">
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

/** `color` is a CSS custom property name (e.g. "--chart-3"); default: chart-1 … chart-6 in order */
export interface WbSeries { label: string, data: readonly number[], color?: string }

const props = withDefaults(defineProps<{
  labels: readonly string[]
  series: readonly WbSeries[]
  title: string
  stacked?: boolean
  height?: number
  /** Show Chart.js' own legend (off when a WbChartFrame legend is used) */
  legend?: boolean
}>(), { height: 220, legend: undefined })

// Colours come from the tokens at render time (light and dark themes)
const palette = ref<string[]>([])
const custom = ref<Record<string, string>>({})
const ink = ref('#3f4a63')
const grid = ref('#d8deea')
onMounted(() => {
  palette.value = chartSeries()
  ink.value = cssVar('--ink-2', ink.value)
  grid.value = cssVar('--border', grid.value)
  for (const s of props.series) if (s.color) custom.value[s.color] = cssVar(s.color)
})

const data = computed(() => ({
  labels: [...props.labels],
  datasets: props.series.map((s, i) => ({
    label: s.label,
    data: [...s.data],
    backgroundColor: (s.color && custom.value[s.color]) || palette.value[i % 6] || '#86adff',
    borderRadius: 6,
    maxBarThickness: 28,
    ...(props.stacked ? { stack: 'stack' } : {}),
  })),
}))
const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 120 },
  plugins: {
    legend: { display: props.legend ?? props.series.length > 1, labels: { color: ink.value, boxWidth: 12 } },
    tooltip: { enabled: true, mode: 'index' as const, intersect: false },
  },
  scales: {
    x: { stacked: props.stacked, ticks: { color: ink.value }, grid: { display: false } },
    y: { stacked: props.stacked, beginAtZero: true, ticks: { color: ink.value, precision: 0 }, grid: { color: grid.value } },
  },
}))
</script>

<template>
  <figure class="wb-cf">
    <div :style="{ height: `${height}px`, position: 'relative' }">
      <ClientOnly>
        <Bar :data="data" :options="options" :aria-label="title" role="img" />
      </ClientOnly>
    </div>
    <!-- The numbers, for screen readers and as a fallback to the colours -->
    <table class="wb-sr">
      <caption>{{ title }}</caption>
      <tbody>
        <tr v-for="(l, i) in labels" :key="l"><th scope="row">{{ l }}</th><td v-for="s in series" :key="s.label">{{ s.data[i] }}</td></tr>
      </tbody>
    </table>
  </figure>
</template>
