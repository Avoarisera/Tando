<script setup lang="ts">
import type { MonthlyMetrics } from '~/composables/useMetrics'
import type { TicketRow } from './TicketsTable.vue'

type MetricKey = 'ticketsCount' | 'pointsSum' | 'bugsCount' | 'medianDevCycleHours' | 'avgSize'

const props = defineProps<{
  metric: MetricKey
  devId: string
  devName: string
  months: string[]
  devMetrics: Record<string, MonthlyMetrics>
  workspaceId: string
  teamId?: string
}>()

const emit = defineEmits<{ close: [] }>()

const expanded = ref<Record<string, boolean>>({})
const ticketsCache = ref<Record<string, TicketRow[]>>({})
const loadingMonth = ref<string | null>(null)

const METRIC_CONFIG: Record<MetricKey, { label: string; unit: string; note: string }> = {
  ticketsCount: {
    label: 'Tickets/mois',
    unit: 'tickets',
    note: 'Compte les tickets passés en Q/A Check ou plus loin dans le mois (date de transition).',
  },
  pointsSum: {
    label: 'Points/mois',
    unit: 'pts',
    note: 'Somme des estimates des tickets livrés. Tickets sans estimation exclus de la somme.',
  },
  bugsCount: {
    label: 'Bugs urgents/mois',
    unit: 'tickets',
    note: 'Tickets livrés sans estimation (proxy "bug urgent"). Heuristique — l\'absence d\'estimate reflète souvent un ticket non planifié.',
  },
  medianDevCycleHours: {
    label: 'Cycle dev (médiane)',
    unit: 'h',
    note: 'Médiane de (qa_started_at − started_at). Mesure le temps dev pur, sans QA ni PO.',
  },
  avgSize: {
    label: 'Taille moyenne',
    unit: 'pts',
    note: 'Moyenne des estimates des tickets livrés avec estimation.',
  },
}

const config = computed(() => METRIC_CONFIG[props.metric])

function getValue(month: string): number {
  return props.devMetrics[month]?.[props.metric] ?? 0
}

const monthlyValues = computed(() => props.months.map(m => getValue(m)))

const avgValue = computed(() => {
  if (!monthlyValues.value.length) return 0
  return monthlyValues.value.reduce((s, v) => s + v, 0) / monthlyValues.value.length
})

function formatValue(v: number): string {
  return props.metric === 'medianDevCycleHours' ? `${v.toFixed(0)}h` : v.toFixed(1)
}

function monthLabel(m: string): string {
  const [year, month] = m.split('-')
  const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  return `${labels[parseInt(month!) - 1]} ${year}`
}

async function toggleMonth(month: string) {
  expanded.value[month] = !expanded.value[month]
  if (!expanded.value[month] || ticketsCache.value[month]) return

  loadingMonth.value = month
  try {
    const data = await $fetch<TicketRow[]>('/api/tickets', {
      query: {
        workspaceId: props.workspaceId,
        teamId: props.teamId,
        assigneeId: props.devId,
        month,
      },
    })
    ticketsCache.value[month] = data
  } finally {
    loadingMonth.value = null
  }
}

function linearUrl(identifier: string | null): string {
  if (!identifier) return '#'
  return `https://linear.app/issue/${identifier}`
}

// Fermer avec Échap
onMounted(() => {
  const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
  window.addEventListener('keydown', handleKey)
  onUnmounted(() => window.removeEventListener('keydown', handleKey))
})
</script>

<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-40 bg-black/30"
    aria-hidden="true"
    @click="emit('close')"
  />

  <!-- Panel -->
  <div
    role="dialog"
    aria-modal="true"
    :aria-label="`Détail du calcul : ${config.label}`"
    class="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl flex flex-col"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-gray-200 px-5 py-4">
      <div>
        <p class="text-xs text-gray-400 uppercase tracking-wide">Détail du calcul</p>
        <h2 class="text-base font-semibold text-gray-900">{{ config.label }}</h2>
        <p class="text-sm text-gray-500">{{ devName }}</p>
      </div>
      <button
        class="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        aria-label="Fermer"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <!-- Formule -->
    <div class="border-b border-gray-100 bg-gray-50 px-5 py-3">
      <p class="text-xs text-gray-500 mb-1">Formule (moyenne sur {{ months.length }} mois)</p>
      <p class="font-mono text-sm text-gray-800">
        <strong>{{ formatValue(avgValue) }} {{ config.unit }}</strong>
        = ({{ monthlyValues.map(v => formatValue(v)).join(' + ') }})
        / {{ months.length }}
      </p>
    </div>

    <!-- Mois dépliables -->
    <div class="flex-1 px-5 py-4 space-y-2">
      <div
        v-for="(month, i) in months"
        :key="month"
        class="rounded-lg border border-gray-200 overflow-hidden"
      >
        <button
          class="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          @click="toggleMonth(month)"
        >
          <span class="text-sm font-medium text-gray-700">{{ monthLabel(month) }}</span>
          <div class="flex items-center gap-3">
            <span class="font-mono text-sm font-semibold text-gray-900">
              {{ formatValue(monthlyValues[i] ?? 0) }} {{ config.unit }}
            </span>
            <span class="text-gray-400 text-xs">{{ expanded[month] ? '▼' : '▶' }}</span>
          </div>
        </button>

        <div v-if="expanded[month]" class="border-t border-gray-100 px-4 py-3">
          <!-- Loading tickets -->
          <template v-if="loadingMonth === month">
            <AppSkeleton v-for="j in 3" :key="j" class="mb-1.5 h-6" />
          </template>

          <!-- Tickets -->
          <template v-else-if="ticketsCache[month]?.length">
            <ul class="space-y-1.5">
              <li
                v-for="t in ticketsCache[month]"
                :key="t.id"
                class="flex items-center gap-2 text-xs"
              >
                <a
                  :href="linearUrl(t.identifier)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-mono text-brand-primary hover:underline shrink-0"
                  @click.stop
                >
                  {{ t.identifier ?? '—' }}
                </a>
                <span class="truncate text-gray-700 flex-1">{{ t.title ?? '—' }}</span>
                <span class="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-500 font-mono">
                  {{ t.estimate != null ? `${t.estimate}pts` : 'no est.' }}
                </span>
              </li>
            </ul>
          </template>

          <p v-else class="text-xs text-gray-400">Aucun ticket trouvé pour ce mois.</p>
        </div>
      </div>
    </div>

    <!-- Note méthodo -->
    <div class="border-t border-gray-100 bg-gray-50 px-5 py-4">
      <p class="text-xs text-gray-500 italic">
        <strong class="not-italic font-medium text-gray-600">Méthode :</strong>
        {{ config.note }}
      </p>
    </div>
  </div>
</template>
