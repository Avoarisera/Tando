<script setup lang="ts">
export interface HistoryEvent {
  id: number
  from_status: string | null
  to_status: string | null
  changed_at: string
  actor_id: string | null
}

const props = defineProps<{
  history: HistoryEvent[]
  startedAt: string | null
  qaStartedAt: string | null
}>()

interface TimelineEntry {
  status: string
  enteredAt: string
  exitedAt: string | null
  durationHours: number | null
  isRework: boolean
  isQaAnomaly: boolean
}

const DEV_STATES = ['In Progress', 'In Review', 'Review']
const QA_STATES = ['Q/A Check', 'QA', 'Pending', 'UX Validation', 'PO Check']
const TERMINAL_STATES = ['Done', 'Deployed', 'Cancelled']

const entries = computed<TimelineEntry[]>(() => {
  if (!props.history.length) return []

  const events = [...props.history].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
  )

  const result: TimelineEntry[] = []

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!
    const toStatus = ev.to_status ?? 'Unknown'
    const exitedAt = events[i + 1]?.changed_at ?? null
    const durationMs = exitedAt
      ? new Date(exitedAt).getTime() - new Date(ev.changed_at).getTime()
      : null
    const durationHours = durationMs !== null ? durationMs / 3_600_000 : null

    // Aller-retour détecté : retour vers un état dev après un état review/QA
    const prevDevExit = result.findLast(e => DEV_STATES.some(s => e.status.includes(s)))
    const isRework =
      DEV_STATES.some(s => toStatus.includes(s)) &&
      result.some(e => QA_STATES.some(s => e.status.includes(s)))

    // QA anormalement long (>48h)
    const isQaAnomaly =
      QA_STATES.some(s => toStatus.includes(s)) &&
      durationHours !== null &&
      durationHours > 48

    result.push({
      status: toStatus,
      enteredAt: ev.changed_at,
      exitedAt,
      durationHours,
      isRework,
      isQaAnomaly,
    })
  }

  return result
})

function formatDuration(hours: number | null): string {
  if (hours === null) return 'en cours'
  if (hours < 1) return `${Math.round(hours * 60)}min`
  if (hours < 24) return `${hours.toFixed(0)}h`
  return `${(hours / 24).toFixed(1)}j`
}

function showDuration(entry: TimelineEntry): boolean {
  if (entry.durationHours !== null) return true
  return !TERMINAL_STATES.some(s => entry.status.includes(s))
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function statusColor(status: string): string {
  if (DEV_STATES.some(s => status.includes(s))) return 'bg-blue-100 text-blue-700'
  if (QA_STATES.some(s => status.includes(s))) return 'bg-amber-100 text-amber-700'
  if (status === 'Done' || status === 'Deployed') return 'bg-green-100 text-green-700'
  if (status === 'Cancelled') return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

const cycleHours = computed<number | null>(() => {
  if (!props.startedAt || !props.qaStartedAt) return null
  // On reworked tickets, started_at can be refreshed after qa_started_at → negative.
  const h = (new Date(props.qaStartedAt).getTime() - new Date(props.startedAt).getTime()) / 3_600_000
  return h > 0 ? h : null
})

const hasRework = computed(() => entries.value.some(e => e.isRework))
const hasQaAnomaly = computed(() => entries.value.some(e => e.isQaAnomaly))
</script>

<template>
  <div>
    <!-- Résumé flags -->
    <div v-if="hasRework || hasQaAnomaly" class="mb-4 flex gap-2 flex-wrap">
      <span
        v-if="hasRework"
        class="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-medium text-red-700"
        title="Aller-retour détecté entre les états dev et QA/Review"
      >
        ⚠ Rework détecté
      </span>
      <span
        v-if="hasQaAnomaly"
        class="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700"
        title="Ticket bloqué plus de 48h en QA/Review"
      >
        ⏳ Blocage QA &gt; 48h
      </span>
      <span
        v-if="cycleHours !== null"
        class="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700"
      >
        Cycle dev : {{ formatDuration(cycleHours) }}
      </span>
    </div>

    <!-- Timeline vide -->
    <AppEmptyState
      v-if="entries.length === 0"
      title="Aucun historique disponible"
      description="L'historique des transitions n'a pas été synchronisé pour ce ticket."
    />

    <!-- Timeline -->
    <ol v-else class="relative border-l border-gray-200 ml-3">
      <li
        v-for="(entry, i) in entries"
        :key="i"
        class="mb-6 ml-6"
      >
        <!-- dot -->
        <span
          class="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white text-xs"
          :class="entry.isRework ? 'bg-red-100 text-red-600' : entry.isQaAnomaly ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'"
        >
          {{ entry.isRework ? '↩' : entry.isQaAnomaly ? '⏳' : '●' }}
        </span>

        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span
              class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              :class="statusColor(entry.status)"
            >
              {{ entry.status }}
            </span>
            <time class="ml-2 text-xs text-gray-400">{{ formatDate(entry.enteredAt) }}</time>
          </div>
          <span
            v-if="showDuration(entry)"
            class="text-xs text-gray-400 whitespace-nowrap"
            :title="`Temps passé dans cet état : ${formatDuration(entry.durationHours)}`"
          >
            Durée : <span class="font-mono text-gray-600 font-medium">{{ formatDuration(entry.durationHours) }}</span>
          </span>
        </div>

        <p v-if="entry.isRework" class="mt-1 text-xs text-red-600">
          Aller-retour — retour en développement après QA/Review
        </p>
        <p v-if="entry.isQaAnomaly" class="mt-1 text-xs text-amber-600">
          Blocage anormal en QA (&gt; 48h)
        </p>
      </li>
    </ol>
  </div>
</template>
