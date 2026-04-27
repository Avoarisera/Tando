export interface MonthlyMetrics {
  ticketsCount: number
  pointsSum: number
  bugsCount: number
  avgSize: number
  medianDevCycleHours: number
  p90DevCycleHours: number
  medianLeadTimeHours: number
  medianQaTimeHours: number
  reworkRate: number
  ticketIds: string[]
}

export interface MetricsResponse {
  months: string[]
  devs: { id: string; display_name: string | null; email: string | null }[]
  metrics: Record<string, Record<string, MonthlyMetrics>>
}

export function useMetrics() {
  const data = useState<MetricsResponse | null>('velocite-metrics', () => null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchMetrics(params: { workspaceId: string; teamId?: string; months?: string[] }) {
    isLoading.value = true
    error.value = null
    try {
      const query: Record<string, string> = { workspaceId: params.workspaceId }
      if (params.teamId) query.teamId = params.teamId
      if (params.months) query.months = params.months.join(',')

      const res = await $fetch<MetricsResponse>('/api/metrics', { query })
      data.value = res
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur inconnue'
    }
    finally {
      isLoading.value = false
    }
  }

  function getDevMetrics(devId: string): Record<string, MonthlyMetrics> {
    return data.value?.metrics[devId] ?? {}
  }

  function currentMonthKey(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  function momVariation(devId: string, metric: keyof Omit<MonthlyMetrics, 'ticketIds'>): number | null {
    if (!data.value) return null
    const months = data.value.months
    if (months.length < 2) return null
    const curMonth = months[months.length - 1]!
    const prevMonth = months[months.length - 2]!
    const cur = data.value.metrics[devId]?.[curMonth]?.[metric] ?? 0
    const prev = data.value.metrics[devId]?.[prevMonth]?.[metric] ?? 0
    if (prev === 0) return null
    return Math.round(((cur - prev) / prev) * 100)
  }

  return {
    data: data as Readonly<typeof data>,
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchMetrics,
    getDevMetrics,
    currentMonthKey,
    momVariation,
  }
}
