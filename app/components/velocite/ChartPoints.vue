<script setup lang="ts">
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip)

const props = defineProps<{
  months: readonly string[]
  values: readonly number[]
}>()

function monthLabel(m: string): string {
  const [year, month] = m.split('-')
  const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  return `${labels[parseInt(month!) - 1]} ${year?.slice(2)}`
}

const chartData = computed(() => ({
  labels: props.months.map(monthLabel),
  datasets: [
    {
      label: 'Points livrés',
      data: [...props.values],
      backgroundColor: '#2563EB',
      borderRadius: 4,
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { mode: 'index' as const, intersect: false },
  },
  scales: {
    y: { beginAtZero: true },
  },
}
</script>

<template>
  <div class="h-48">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>
