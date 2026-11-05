<script setup lang="ts">
import type { MonthlyMetrics } from '~/composables/useMetrics'

interface Dev { id: string; display_name: string | null; email: string | null }

const props = defineProps<{
  devs: Dev[]
  months: string[]
  metrics: Record<string, Record<string, MonthlyMetrics>>
  teamId: string
  workspaceId: string
  year: number
  range: number
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

    // Average WIP across active months (max per-month value reflects peak load)
    const wipValues = monthMetrics.map(m => m.wipCount).filter(v => v > 0)
    const avgWip = wipValues.length
      ? wipValues.reduce((s, v) => s + v, 0) / wipValues.length
      : 0

    // Cycle dérive : last month's cycle vs average across the rest
    const lastMonthMetric = props.months.length
      ? props.metrics[dev.id]?.[props.months[props.months.length - 1]!]
      : undefined
    const lastCycle = lastMonthMetric?.medianDevCycleHours ?? 0
    const earlierCycles = cycleTimes.slice(0, -1)
    const earlierAvg = earlierCycles.length
      ? earlierCycles.reduce((s, v) => s + v, 0) / earlierCycles.length
      : 0
    const cycleDrift = earlierAvg > 0 && lastCycle > 0
      ? ((lastCycle - earlierAvg) / earlierAvg) * 100
      : 0

    // Flags affichés à côté du nom — cycle drift est rendu dans la colonne Cycle dev.
    const flags: { label: string; tone: 'red' | 'amber' }[] = []
    if (avgWip > 4) flags.push({ label: avgWip.toFixed(1), tone: 'amber' })

    return { dev, totalTickets, avgTickets, avgCycle, cycleDrift, rework, reworkedCount, flags }
  }).filter(d => d.totalTickets > 0)
    // Alphabetical: a statistic helps understand, never ranks (design rule)
    .sort((a, b) => devName(a.dev).localeCompare(devName(b.dev)))
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

// Position vs the team median, shown as a badge tone + a word (colour is never alone)
const levelTone = { good: 'success', mid: 'warning', bad: 'danger', neutral: 'neutral' } as const

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const formatCycle = (h: number | null) => velociteDuration(h, tag.value)

function devName(dev: Dev): string {
  return dev.display_name ?? dev.email ?? dev.id
}

function devLink(devId: string): string {
  return `/velocite/teams/${props.teamId}/devs/${devId}?workspaceId=${props.workspaceId}&year=${props.year}&range=${props.range}`
}
</script>

<template>
  <div class="wb-stack-s">
    <p class="small wb-mut2">
      {{ t('velocityB.dist.median') }}
      <span class="wb-num">{{ t('velocityB.dist.medianTickets', { n: teamMedianTickets.toFixed(1) }) }}</span> ·
      <span class="wb-num">{{ t('velocityB.dist.medianCycle', { v: formatCycle(teamMedianCycle) }) }}</span> ·
      <span class="wb-num">{{ t('velocityB.dist.medianRework', { n: teamMedianRework.toFixed(1) }) }}</span>
    </p>

    <div class="wb-scroll wb-dt">
      <table>
        <caption class="wb-sr">{{ t('velocityB.dist.caption') }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('velocityB.dist.dev') }}</th>
            <th scope="col" class="is-r">{{ t('velocityB.dist.total') }}</th>
            <th scope="col" class="is-r">{{ t('velocityB.dist.perMonth') }}</th>
            <th scope="col" class="is-r">{{ t('velocityB.dist.cycle') }}</th>
            <th scope="col" class="is-r">{{ t('velocityB.kpi.rework') }}</th>
            <th scope="col"><span class="wb-sr">{{ t('velocityB.dist.detail') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="stat in devStats" :key="stat.dev.id" :data-dev="devName(stat.dev)">
            <td>
              <span class="wb-row wb-wrap" style="gap: 6px">
                <span class="wb-cp"><WbAvatar :name="devName(stat.dev)" :size="28" /><b class="small">{{ devName(stat.dev) }}</b></span>
                <WbBadge v-for="flag in stat.flags" :key="flag.label" tone="warning" size="sm">{{ t('velocityB.dist.wip', { n: flag.label }) }}</WbBadge>
              </span>
            </td>
            <td class="is-r wb-num">{{ stat.totalTickets }}</td>
            <td class="is-r">
              <WbBadge :tone="levelTone[ticketsLevel(stat.avgTickets)]" size="sm"><span class="wb-num">{{ stat.avgTickets.toFixed(1) }}</span></WbBadge>
            </td>
            <td class="is-r">
              <span class="wb-row" style="justify-content: flex-end; gap: 6px">
                <WbBadge :tone="levelTone[cycleLevel(stat.avgCycle)]" size="sm"><span class="wb-num">{{ formatCycle(stat.avgCycle) }}</span></WbBadge>
                <span
                  v-if="Math.abs(stat.cycleDrift) >= 15"
                  class="caption wb-num"
                  :class="stat.cycleDrift > 0 ? 'wb-c-danger' : 'wb-c-success'"
                  :title="t(stat.cycleDrift > 0 ? 'velocityB.dist.driftSlower' : 'velocityB.dist.driftFaster', { n: Math.abs(stat.cycleDrift).toFixed(0) })"
                >
                  <WbIcon :name="stat.cycleDrift > 0 ? 'arrow-up' : 'arrow-down'" :size="12" style="display: inline" />{{ Math.abs(stat.cycleDrift).toFixed(0) }} %
                </span>
              </span>
            </td>
            <td class="is-r">
              <WbBadge :tone="levelTone[reworkLevel(stat.rework)]" size="sm">
                <span class="wb-num" :title="t('velocityB.dist.reworkedTip', { n: stat.reworkedCount })">{{ stat.rework.toFixed(1) }} %</span>
              </WbBadge>
              <span v-if="stat.reworkedCount > 0" class="caption wb-mut wb-num"> ({{ stat.reworkedCount }})</span>
            </td>
            <td class="is-r">
              <NuxtLink :to="devLink(stat.dev.id)" class="small">{{ t('velocityB.dist.detail') }}</NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ul class="wb-leg caption">
      <li><i style="background: var(--success-solid)" />{{ t('velocityB.dist.legendAbove') }}</li>
      <li><i style="background: var(--warning-solid)" />{{ t('velocityB.dist.legendNear') }}</li>
      <li><i style="background: var(--danger-solid)" />{{ t('velocityB.dist.legendBelow') }}</li>
      <li>{{ t('velocityB.dist.legendDrift') }}</li>
    </ul>
  </div>
</template>
