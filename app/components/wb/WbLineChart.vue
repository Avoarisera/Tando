<script setup lang="ts">
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import type { WbSeries } from './WbBarChart.vue'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const props = withDefaults(defineProps<{
  labels: readonly string[]
  series: readonly WbSeries[]
  title: string
  area?: boolean
  height?: number
  legend?: boolean
}>(), { height: 220, legend: undefined })

const palette = ref<string[]>([])
const custom = ref<Record<string, string>>({})
const ink = ref('#3f4a63')
const grid = ref('#d8deea')
function readColours() {
  palette.value = chartSeries()
  ink.value = cssVar('--ink-2', ink.value)
  grid.value = cssVar('--border', grid.value)
  for (const s of props.series) if (s.color) custom.value[s.color] = cssVar(s.color)
}
onMounted(readColours)
// re-read the tokens when the theme switches (the header toggle)
const { resolved: theme } = useTheme()
watch(theme, () => nextTick(readColours))

const color = (s: WbSeries, i: number) => (s.color && custom.value[s.color]) || palette.value[i % 6] || '#86adff'
const data = computed(() => ({
  labels: [...props.labels],
  datasets: props.series.map((s, i) => ({
    label: s.label,
    data: [...s.data],
    borderColor: color(s, i),
    backgroundColor: `${color(s, i)}22`,
    pointBackgroundColor: color(s, i),
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    fill: props.area && i === 0,
    tension: 0.3,
  })),
}))
const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 120 },
  plugins: {
    legend: { display: props.legend ?? props.series.length > 1, labels: { color: ink.value, boxWidth: 12 } },
    tooltip: { mode: 'index' as const, intersect: false },
  },
  scales: {
    x: { ticks: { color: ink.value }, grid: { display: false } },
    y: { beginAtZero: true, ticks: { color: ink.value, precision: 0 }, grid: { color: grid.value } },
  },
}))
</script>

<template>
  <figure class="wb-cf">
    <div :style="{ height: `${height}px`, position: 'relative' }">
      <ClientOnly>
        <Line :data="data" :options="options" :aria-label="title" role="img" />
      </ClientOnly>
    </div>
    <!-- wrapped: a <caption> escapes the clip of a visually-hidden table and was drawn over the chart -->
    <div class="wb-sr">    <table>
      <caption>{{ title }}</caption>
      <tbody>
        <tr v-for="(l, i) in labels" :key="l"><th scope="row">{{ l }}</th><td v-for="s in series" :key="s.label">{{ s.data[i] }}</td></tr>
      </tbody>
    </table></div>
  </figure>
</template>
