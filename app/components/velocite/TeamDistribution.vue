<script setup lang="ts">
import type { MonthlyMetrics } from '~/composables/useMetrics'

interface Dev { id: string; display_name: string | null; email: string | null }

const props = defineProps<{
  devs: Dev[]
  months: string[]
  metrics: Record<string, Record<string, MonthlyMetrics>>
  teamId: string
  workspaceId: string
  period: number
}>()

function median(vals: number[]): number {
  if (!vals.length) return 0
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

const devStats = computed(() => {
  return props.devs.map(dev => {
    const monthMetrics = props.months
      .map(m => props.metrics[dev.id]?.[m])
      .filter((m): m is MonthlyMetrics => !!m)

    const totalTickets = monthMetrics.reduce((s, m) => s + m.ticketsCount, 0)
    const avgTickets = totalTickets / (props.months.length || 1)

    const cycleTimes = monthMetrics.map(m => m.medianDevCycleHours).filter(v => v > 0)
    const avgCycle = cycleTimes.length
      ? cycleTimes.reduce((s, v) => s + v, 0) / cycleTimes.length
      : null

    // Weighted average of per-month rework rates — same formula as the dev detail page.
    // Denominator = delivered tickets, consistent with tickets.get.ts hasRework calculation.
    const rework = totalTickets > 0
      ? monthMetrics.reduce((s, m) => s + m.reworkRate * m.ticketsCount, 0) / totalTickets
      : 0
    const reworkedCount = monthMetrics.reduce((s, m) => s + Math.round(m.reworkRate * m.ticketsCount / 100), 0)

    return { dev, totalTickets, avgTickets, avgCycle, rework, reworkedCount }
  }).filter(d => d.totalTickets > 0).sort((a, b) => b.totalTickets - a.totalTickets)
})

const teamMedianTickets = computed(() => median(devStats.value.map(d => d.avgTickets)))
const teamMedianCycle = computed(() => {
  const vals = devStats.value.map(d => d.avgCycle).filter((v): v is number => v !== null)
  return median(vals)
})
const teamMedianRework = computed(() => median(devStats.value.map(d => d.rework)))

type Level = 'good' | 'mid' | 'bad' | 'neutral'

function ticketsLevel(v: number): Level {
  const med = teamMedianTickets.value
  if (!med) return 'neutral'
  if (v >= med * 1.2) return 'good'
  if (v >= med * 0.8) return 'mid'
  return 'bad'
}

function cycleLevel(v: number | null): Level {
  if (v === null) return 'neutral'
  const med = teamMedianCycle.value
  if (!med) return 'neutral'
  if (v <= med * 0.8) return 'good'
  if (v <= med * 1.2) return 'mid'
  return 'bad'
}

function reworkLevel(v: number): Level {
  if (v === 0) return 'neutral'
  if (v < 10) return 'good'
  if (v <= 25) return 'mid'
  return 'bad'
}

const levelClass: Record<Level, string> = {
  good: 'text-green-700 bg-green-50',
  mid: 'text-amber-700 bg-amber-50',
  bad: 'text-red-700 bg-red-50',
  neutral: 'text-gray-400 bg-gray-50',
}

function formatCycle(h: number | null): string {
  if (h === null) return '—'
  if (h < 24) return `${h.toFixed(0)}h`
  return `${(h / 24).toFixed(1)}j`
}

function devName(dev: Dev): string {
  return dev.display_name ?? dev.email ?? dev.id
}

function devLink(devId: string): string {
  return `/velocite/teams/${props.teamId}/devs/${devId}?workspaceId=${props.workspaceId}&period=${props.period}`
}
</script>

<template>
  <div>
    <!-- Légende médiane -->
    <div class="mb-3 flex flex-wrap gap-3 text-xs text-gray-400">
      <span>Médiane équipe —</span>
      <span>Tickets/mois : <strong class="text-gray-600">{{ teamMedianTickets.toFixed(1) }}</strong></span>
      <span>Cycle dev : <strong class="text-gray-600">{{ formatCycle(teamMedianCycle) }}</strong></span>
      <span>Rework : <strong class="text-gray-600">{{ teamMedianRework.toFixed(1) }}%</strong></span>
    </div>

    <div class="overflow-x-auto rounded-lg border border-gray-200">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th class="px-4 py-2.5 text-left font-medium">Développeur</th>
            <th class="px-4 py-2.5 text-right font-medium">
              Total tickets
              <span class="normal-case text-gray-400 ml-1">sur la période</span>
            </th>
            <th class="px-4 py-2.5 text-right font-medium">
              Moy. / mois
            </th>
            <th class="px-4 py-2.5 text-right font-medium">
              Cycle dev
              <span class="normal-case text-gray-400 ml-1">médian</span>
            </th>
            <th class="px-4 py-2.5 text-right font-medium">Rework</th>
            <th class="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr
            v-for="(stat, i) in devStats"
            :key="stat.dev.id"
            class="hover:bg-gray-50 transition-colors"
          >
            <!-- Rang + nom -->
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-300 w-4 text-right shrink-0">{{ i + 1 }}</span>
                <span class="font-medium text-gray-800">{{ devName(stat.dev) }}</span>
              </div>
            </td>

            <!-- Total tickets -->
            <td class="px-4 py-3 text-right tabular-nums text-gray-700 font-medium">
              {{ stat.totalTickets }}
            </td>

            <!-- Moy / mois -->
            <td class="px-4 py-3 text-right">
              <span
                class="inline-block rounded px-2 py-0.5 text-xs font-semibold tabular-nums"
                :class="levelClass[ticketsLevel(stat.avgTickets)]"
              >
                {{ stat.avgTickets.toFixed(1) }}
              </span>
            </td>

            <!-- Cycle dev -->
            <td class="px-4 py-3 text-right">
              <span
                class="inline-block rounded px-2 py-0.5 text-xs font-semibold tabular-nums"
                :class="levelClass[cycleLevel(stat.avgCycle)]"
              >
                {{ formatCycle(stat.avgCycle) }}
              </span>
            </td>

            <!-- Rework -->
            <td class="px-4 py-3 text-right">
              <span
                class="inline-block rounded px-2 py-0.5 text-xs font-semibold tabular-nums"
                :class="levelClass[reworkLevel(stat.rework)]"
                :title="`${stat.reworkedCount} ticket(s) avec retour arrière`"
              >
                {{ stat.rework.toFixed(1) }}%
              </span>
              <span v-if="stat.reworkedCount > 0" class="ml-1 text-xs text-gray-400">
                ({{ stat.reworkedCount }})
              </span>
            </td>

            <!-- Lien détail -->
            <td class="px-4 py-3 text-right">
              <NuxtLink
                :to="devLink(stat.dev.id)"
                class="text-xs text-brand-primary hover:underline whitespace-nowrap"
              >
                Détail →
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Légende couleurs -->
    <div class="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
      <span class="flex items-center gap-1">
        <span class="inline-block w-3 h-3 rounded bg-green-100" /> Au-dessus de la médiane (bon)
      </span>
      <span class="flex items-center gap-1">
        <span class="inline-block w-3 h-3 rounded bg-amber-100" /> Proche de la médiane
      </span>
      <span class="flex items-center gap-1">
        <span class="inline-block w-3 h-3 rounded bg-red-100" /> En-dessous de la médiane (attention)
      </span>
    </div>
  </div>
</template>
