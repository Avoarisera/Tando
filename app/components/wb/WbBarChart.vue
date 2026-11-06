<script setup lang="ts">
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

/** `color` is a CSS custom property name (e.g. "--chart-3") or a colour; default: chart-1 … chart-6 in order */
export interface WbSeries { label: string, data: readonly number[], color?: string }

const props = withDefaults(defineProps<{
  labels: readonly string[]
  series: readonly WbSeries[]
  title: string
  stacked?: boolean
  /** extra tooltip lines per label (e.g. who is away that day) */
  details?: readonly (readonly string[])[]
  /** px, or any CSS length (e.g. to fill the screen) */
  height?: number | string
  /** Show Chart.js' own legend (off when a WbChartFrame legend is used) */
  legend?: boolean
}>(), { height: 220, legend: undefined })

// Colours come from the tokens at render time (light and dark themes)
const palette = ref<string[]>([])
const custom = ref<Record<string, string>>({})
const ink = ref('#3f4a63')
const grid = ref('#d8deea')
const surface = ref('#ffffff')
function readColours() {
  surface.value = cssVar('--surface', surface.value)
  palette.value = chartSeries()
  ink.value = cssVar('--ink-2', ink.value)
  grid.value = cssVar('--border', grid.value)
  // a CSS custom property name, or a plain colour (e.g. a leave type's hex)
  for (const s of props.series) if (s.color) custom.value[s.color] = s.color.startsWith('--') ? cssVar(s.color) : s.color
}
onMounted(readColours)
// re-read the tokens when the theme switches (the header toggle)
const { resolved: theme } = useTheme()
watch(theme, () => nextTick(readColours))

const data = computed(() => ({
  labels: [...props.labels],
  datasets: props.series.map((s, i) => ({
    label: s.label,
    data: [...s.data],
    backgroundColor: (s.color && custom.value[s.color]) || palette.value[i % 6] || '#86adff',
    borderRadius: props.stacked ? 4 : 6,
    // stacked: a 2 px surface gap between segments
    ...(props.stacked ? { borderColor: surface.value, borderWidth: { top: 2 }, borderSkipped: 'bottom' as const } : {}),
    maxBarThickness: 28,
    ...(props.stacked ? { stack: 'stack' } : {}),
  })),
}))
const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  // room for the top tick label so it never touches the title above
  layout: { padding: { top: 8 } },
  animation: { duration: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 120 },
  plugins: {
    legend: { display: props.legend ?? props.series.length > 1, labels: { color: ink.value, boxWidth: 12 } },
    tooltip: {
      enabled: true, mode: 'index' as const, intersect: false,
      callbacks: { afterBody: (items: { dataIndex: number }[]) => [...(props.details?.[items[0]?.dataIndex ?? -1] ?? [])] },
    },
  },
  scales: {
    x: { stacked: props.stacked, ticks: { color: ink.value }, grid: { display: false } },
    y: { stacked: props.stacked, beginAtZero: true, ticks: { color: ink.value, precision: 0 }, grid: { color: grid.value } },
  },
}))
</script>

<template>
  <figure class="wb-cf">
    <div :style="{ height: typeof height === 'number' ? `${height}px` : height, position: 'relative' }">
      <ClientOnly>
        <Bar :data="data" :options="options" :aria-label="title" role="img" />
      </ClientOnly>
    </div>
    <!-- The numbers, for screen readers and as a fallback to the colours -->
    <!-- wrapped: a <caption> escapes the clip of a visually-hidden table and was drawn over the chart -->
    <div class="wb-sr"><table>
      <caption>{{ title }}</caption>
      <tbody>
        <tr v-for="(l, i) in labels" :key="l"><th scope="row">{{ l }}</th><td v-for="s in series" :key="s.label">{{ s.data[i] }}</td></tr>
      </tbody>
    </table></div>
  </figure>
</template>
