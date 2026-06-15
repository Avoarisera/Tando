import type { Team } from '~/types/index'

export function useTeams() {
  const supabase = useSupabaseClient()
  const teams = useState<Team[]>('teams', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTeams() {
    if (teams.value.length > 0) return
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase
        .from('teams')
        .select('id, name, created_at')
        .order('name', { ascending: true })
      if (sbError) throw sbError
      teams.value = (data ?? []) as Team[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement des équipes'
    } finally {
      isLoading.value = false
    }
  }

  return {
    teams: readonly(teams),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchTeams,
  }
}
