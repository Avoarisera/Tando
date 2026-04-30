<script setup lang="ts">
import type { HistoryEvent } from '~/components/velocite/HistoryTimeline.vue'

definePageMeta({ layout: 'private', middleware: 'admin-only' })

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

const isLoading = ref(false)
const error = ref<string | null>(null)
const issue = ref<IssueDetail | null>(null)
const history = ref<HistoryEvent[]>([])

onMounted(async () => {
  if (!workspaceId) {
    error.value = 'workspaceId manquant dans l\'URL'
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
    error.value = e instanceof Error ? e.message : 'Erreur lors du chargement du ticket'
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

function formatDuration(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 24) return `${hours.toFixed(0)}h`
  return `${(hours / 24).toFixed(1)}j`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function linearUrl(identifier: string | null): string {
  if (!identifier) return '#'
  return `https://linear.app/issue/${identifier}`
}

const backUrl = computed(() => returnUrl ?? '/velocite')
</script>

<template>
  <div class="max-w-7xl mx-auto">
    <!-- Breadcrumb -->
    <div class="mb-6">
      <button class="text-sm text-brand-primary hover:underline" @click="goBack">← Retour</button>
    </div>

    <!-- Loading -->
    <template v-if="isLoading">
      <AppSkeleton class="h-8 w-2/3 mb-3" />
      <AppSkeleton class="h-5 w-1/3 mb-6" />
      <AppSkeleton v-for="i in 6" :key="i" class="h-12 mb-3" />
    </template>

    <!-- Erreur -->
    <AppErrorBanner
      v-else-if="error"
      :message="error"
      @retry="$router.go(0)"
    />

    <template v-else-if="issue">
      <!-- En-tête ticket -->
      <div class="mb-6">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <a
                :href="linearUrl(issue.identifier)"
                target="_blank"
                rel="noopener noreferrer"
                class="font-mono text-sm text-brand-primary hover:underline font-medium"
                :title="`Ouvrir ${issue.identifier} dans Linear`"
              >
                {{ issue.identifier ?? issueId }}
              </a>
              <span
                v-if="issue.status"
                class="inline-block rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-700"
              >
                {{ issue.status }}
              </span>
            </div>
            <h1 class="text-xl font-bold text-gray-900 leading-snug">
              {{ issue.title ?? 'Titre non disponible' }}
            </h1>
          </div>
          <a
            :href="linearUrl(issue.identifier)"
            target="_blank"
            rel="noopener noreferrer"
            class="shrink-0 text-xs text-gray-400 hover:text-brand-primary transition-colors"
            aria-label="Ouvrir dans Linear"
          >
            ↗ Linear
          </a>
        </div>
      </div>

      <!-- KPIs rapides -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div class="rounded-lg border border-gray-200 bg-white p-3">
          <p class="text-xs text-gray-500 mb-1">Estimation</p>
          <p class="text-lg font-bold text-gray-900">
            {{ issue.estimate != null ? `${issue.estimate} pts` : '—' }}
          </p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-3">
          <p class="text-xs text-gray-500 mb-1">Cycle dev</p>
          <p class="text-lg font-bold text-gray-900 font-mono">
            {{ formatDuration(cycleHours) }}
          </p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-3">
          <p class="text-xs text-gray-500 mb-1">Démarré le</p>
          <p class="text-sm font-medium text-gray-700">{{ formatDate(issue.started_at) }}</p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-3">
          <p class="text-xs text-gray-500 mb-1">En QA le</p>
          <p class="text-sm font-medium text-gray-700">{{ formatDate(issue.qa_started_at) }}</p>
        </div>
      </div>

      <!-- Note méthodo cycle time -->
      <p class="mb-6 text-xs text-gray-400 italic">
        Le cycle dev mesure le temps entre <em>started_at</em> et <em>qa_started_at</em> — sans inclure le temps QA/PO.
      </p>

      <!-- Timeline -->
      <div class="rounded-lg border border-gray-200 bg-white p-4 md:p-6">
        <h2 class="text-base font-semibold text-gray-800 mb-4">Timeline des transitions</h2>

        <HistoryTimeline
          :history="history"
          :started-at="issue.started_at"
          :qa-started-at="issue.qa_started_at"
        />
      </div>
    </template>
  </div>
</template>
