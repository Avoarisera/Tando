<script setup lang="ts">
export interface HistoryEvent {
  id: number
  from_status: string | null
  to_status: string | null
  changed_at: string
  actor_id: string | null
}

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

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
  if (hours === null) return t('velocityA.timeline.inProgress')
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 24) return `${hours.toFixed(0)} h`
  return `${(hours / 24).toFixed(1)} ${locale.value === 'en' ? 'd' : 'j'}`
}

function showDuration(entry: TimelineEntry): boolean {
  if (entry.durationHours !== null) return true
  return !TERMINAL_STATES.some(s => entry.status.includes(s))
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(tag.value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** Design tones: dev info, QA warning, done success, cancelled danger */
function statusTone(status: string): 'info' | 'warning' | 'success' | 'danger' | 'neutral' {
  if (DEV_STATES.some(s => status.includes(s))) return 'info'
  if (QA_STATES.some(s => status.includes(s))) return 'warning'
  if (status === 'Done' || status === 'Deployed') return 'success'
  if (status === 'Cancelled') return 'danger'
  return 'neutral'
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
  <div class="wb-stack">
    <WbBanner v-if="hasRework" tone="warning" :title="t('velocityA.timeline.rework')">{{ t('velocityA.timeline.reworkText') }}</WbBanner>
    <WbBanner v-if="hasQaAnomaly" tone="warning" :title="t('velocityA.timeline.qaBlocked')" />
    <div v-if="cycleHours !== null"><WbBadge tone="info" icon="clock">{{ t('velocityA.timeline.cycle', { d: formatDuration(cycleHours) }) }}</WbBadge></div>

    <WbEmptyState v-if="entries.length === 0" art="search" :title="t('velocityA.timeline.emptyTitle')">
      {{ t('velocityA.timeline.emptyText') }}
    </WbEmptyState>

    <ol v-else class="wb-tl">
      <li v-for="(entry, i) in entries" :key="i" :data-status="entry.status">
        <span :class="['wb-tl-m', `wb-t-${entry.isRework ? 'danger' : entry.isQaAnomaly ? 'warning' : statusTone(entry.status)}`]" />
        <div>
          <div class="wb-row wb-wrap">
            <WbBadge :tone="statusTone(entry.status)">{{ entry.status }}</WbBadge>
            <span v-if="showDuration(entry)" class="caption wb-mut wb-num">{{ t('velocityA.timeline.duration', { d: formatDuration(entry.durationHours) }) }}</span>
          </div>
          <time class="caption wb-mut wb-num" :datetime="entry.enteredAt">{{ formatDate(entry.enteredAt) }}</time>
          <p v-if="entry.isRework" class="small wb-c-danger">{{ t('velocityA.timeline.reworkStep') }}</p>
          <p v-if="entry.isQaAnomaly" class="small wb-c-warning">{{ t('velocityA.timeline.qaStep') }}</p>
        </div>
      </li>
    </ol>
  </div>
</template>
