import type { DashboardSnapshot } from '~/types'

export function useDashboard() {
  const supabase = useSupabaseClient()
  const snapshot = useState<DashboardSnapshot | null>('dashboard-snapshot', () => null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchSnapshot() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase.rpc('get_dashboard_snapshot')
      if (sbError) throw sbError
      snapshot.value = data as unknown as DashboardSnapshot
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement du tableau de bord'
    } finally {
      isLoading.value = false
    }
  }

  return {
    // not wrapped in readonly(): the snapshot is passed to components typed with
    // the mutable DashboardSnapshot, and DeepReadonly would break those props.
    snapshot,
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchSnapshot,
  }
}
