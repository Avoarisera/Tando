export interface LinearTeam {
  id: string
  name: string | null
}

export function useLinearTeams() {
  const teams = useState<LinearTeam[]>('linear-teams', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTeams(workspaceId: string) {
    isLoading.value = true
    error.value = null
    try {
      const data = await $fetch<LinearTeam[]>('/api/teams', {
        query: { workspaceId },
      })
      teams.value = data
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur inconnue'
    }
    finally {
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
