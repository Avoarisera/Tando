export interface ProblematicTicket {
  id: string
  identifier: string | null
  title: string | null
  assignee_id: string | null
  assignee_name: string | null
  status: string | null
  estimate: number | null
  expected_days: number
  stuck_days: number
}

export interface BlockedTicket {
  id: string
  identifier: string | null
  title: string | null
  assignee_id: string | null
  assignee_name: string | null
  status: string | null
  stuck_since: string | null
  stuck_days: number
}

interface InsightsResponse {
  problematic: ProblematicTicket[]
  blocked: BlockedTicket[]
}

export function useTeamInsights() {
  const problematic = ref<ProblematicTicket[]>([])
  const blocked = ref<BlockedTicket[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchInsights(opts: { workspaceId: string; teamId: string; year: number; range: number }) {
    isLoading.value = true
    error.value = null
    try {
      const res = await $fetch<InsightsResponse>('/api/team-insights', { query: opts })
      problematic.value = res.problematic
      blocked.value = res.blocked
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement des insights'
    } finally {
      isLoading.value = false
    }
  }

  return { problematic, blocked, isLoading, error, fetchInsights }
}
