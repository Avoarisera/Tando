<script setup lang="ts">
import type { HistoryEvent } from '~/components/velocite/HistoryTimeline.vue'

definePageMeta({ titleKey: 'nav.velocity', layout: 'private', middleware: 'admin-only' })

interface IssueDetail {
  id: string
  identifier: string | null
  title: string | null
  assignee_id: string | null
  status: string | null
  estimate: number | null
  started_at: string | null
  qa_started_at: string | null
  completed_at: string | null
  updated_at: string
  raw: Record<string, unknown> | null
}

interface TicketHistoryResponse {
  issue: IssueDetail
  history: HistoryEvent[]
}

const route = useRoute()
const issueId = route.params.id as string
const workspaceId = route.query.workspaceId as string
const returnUrl = route.query.returnUrl as string | undefined
const { goBack } = useBackNavigation(returnUrl ?? '/velocite')
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

const isLoading = ref(false)
const error = ref<string | null>(null)
const issue = ref<IssueDetail | null>(null)
const history = ref<HistoryEvent[]>([])

onMounted(async () => {
  if (!workspaceId) {
    error.value = t('velocityA.ticket.missingWs')
    return
  }
  isLoading.value = true
  error.value = null
  try {
    const res = await $fetch<TicketHistoryResponse>('/api/ticket-history', {
      query: { issueId, workspaceId },
    })
    issue.value = res.issue
    history.value = res.history
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('velocityA.ticket.loadError')
  } finally {
    isLoading.value = false
  }
})

const IN_PROGRESS_STATES = ['In Progress', 'In Development', 'Development']
const IN_REVIEW_STATES = ['In Review', 'Code Review', 'Review']

const cycleHours = computed<number | null>(() => {
  // First pass: use issue.started_at / qa_started_at (= in_review_at) if non-rework (positive diff).
  if (issue.value?.started_at && issue.value?.qa_started_at) {
    const h = (new Date(issue.value.qa_started_at).getTime() - new Date(issue.value.started_at).getTime()) / 3_600_000
    if (h > 0) return h
  }
  // Rework or missing fields: derive from history — first In Progress → first In Review transition.
  if (!history.value.length) return null
  const sorted = [...history.value].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
  )
  const firstDev = sorted.find(e => e.to_status && IN_PROGRESS_STATES.some(s => e.to_status!.includes(s)))
  const firstReview = sorted.find(e => e.to_status && IN_REVIEW_STATES.some(s => e.to_status!.includes(s)))
  if (!firstDev || !firstReview) return null
  const h = (new Date(firstReview.changed_at).getTime() - new Date(firstDev.changed_at).getTime()) / 3_600_000
  return h > 0 ? h : null
})

function formatDuration(hours: number | null): { value: string, unit?: string } {
  if (hours === null) return { value: '—' }
  if (hours < 24) return { value: hours.toFixed(0), unit: 'h' }
  return { value: (hours / 24).toFixed(1), unit: locale.value === 'en' ? 'd' : 'j' }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(tag.value, { day: '2-digit', month: '2-digit' }).format(new Date(iso))
}

function linearUrl(identifier: string | null): string {
  if (!identifier) return '#'
  return `https://linear.app/issue/${identifier}`
}

const cycle = computed(() => formatDuration(cycleHours.value))
const statusTone = computed(() => {
  const st = issue.value?.status ?? ''
  if (/done|deployed/i.test(st)) return 'success' as const
  if (/cancel/i.test(st)) return 'danger' as const
  return 'info' as const
})

usePageHeader(() => ({
  crumbs: [
    { label: t('nav.velocity'), to: '/velocite' },
    { label: issue.value?.identifier ?? t('velocityA.ticket.crumb') },
  ],
}))
</script>

<template>
  <div class="wb-page wb-stack">
    <div><WbButton variant="ghost" size="sm" icon="arrow-left" @click="goBack">{{ t('velocityA.ticket.back') }}</WbButton></div>

    <WbErrorState v-if="error" :message="error" @retry="$router.go(0)" />
    <WbSkeleton v-else-if="isLoading || !issue" variant="metric" :count="4" />

    <template v-else>
      <div class="wb-stack-s">
        <div class="wb-row wb-wrap">
          <a
            class="wb-mono wb-ext"
            :href="linearUrl(issue.identifier)"
            target="_blank"
            rel="noopener noreferrer"
            :title="t('velocityA.ticket.openLinear', { id: issue.identifier ?? issueId })"
          >
            {{ issue.identifier ?? issueId }}
            <WbIcon name="external-link" :size="14" />
            <span class="wb-sr">{{ t('velocityA.ticket.openLinear', { id: issue.identifier ?? issueId }) }}</span>
          </a>
          <WbBadge v-if="issue.status" :tone="statusTone">{{ issue.status }}</WbBadge>
        </div>
        <h2 class="h1">{{ issue.title ?? t('velocityA.ticket.untitled') }}</h2>
      </div>

      <div class="wb-grid wb-cols-4">
        <WbMetricCard :label="t('velocityA.ticket.estimate')" :value="issue.estimate ?? '—'" :unit="issue.estimate != null ? t('velocityA.ticket.pts') : undefined" />
        <WbMetricCard :label="t('velocityA.ticket.cycle')" :value="cycle.value" :unit="cycle.unit" />
        <WbMetricCard :label="t('velocityA.ticket.started')" :value="formatDate(issue.started_at)" />
        <WbMetricCard :label="t('velocityA.ticket.qa')" :value="formatDate(issue.qa_started_at)" />
      </div>
      <p class="caption wb-mut">{{ t('velocityA.ticket.method') }}</p>

      <WbCard :title="t('velocityA.ticket.transitions')">
        <HistoryTimeline :history="history" :started-at="issue.started_at" :qa-started-at="issue.qa_started_at" />
      </WbCard>
    </template>
  </div>
</template>

<style scoped>
.wb-ext { display: inline-flex; gap: 4px; align-items: center; }
</style>
