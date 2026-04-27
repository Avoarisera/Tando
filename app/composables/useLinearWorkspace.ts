export interface TeamRef { id: string; name: string }

export interface Workspace {
  id: string
  name: string
  last_synced_at: string | null
  created_at: string
  selected_teams: readonly TeamRef[] | null
}

export function useLinearWorkspace() {
  const supabase = useSupabaseClient()

  const workspaces = useState<Workspace[]>('linear-workspaces', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const isSyncing = ref(false)

  async function fetchWorkspaces() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase
        .from('workspaces')
        .select('id, name, last_synced_at, created_at, selected_teams')
        .order('created_at', { ascending: false })
      if (sbError) throw sbError
      workspaces.value = (data ?? []) as Workspace[]
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur inconnue'
    }
    finally {
      isLoading.value = false
    }
  }

  async function addWorkspace(name: string, apiKey: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Non authentifié')

    const data = await $fetch<Workspace>('/api/workspaces', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { name, apiKey },
    })
    workspaces.value = [data, ...workspaces.value]
    return data
  }

  async function deleteWorkspace(id: string) {
    const { error: sbError } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', id)
    if (sbError) throw sbError
    workspaces.value = workspaces.value.filter(w => w.id !== id)
  }

  async function fetchLinearTeams(workspaceId: string): Promise<TeamRef[]> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Non authentifié')
    return $fetch<TeamRef[]>('/api/workspace-teams', {
      query: { workspaceId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  }

  async function saveTeamSelection(workspaceId: string, teams: TeamRef[]) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Non authentifié')
    await $fetch('/api/workspace-teams', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { workspaceId, teams },
    })
    workspaces.value = workspaces.value.map(w =>
      w.id === workspaceId ? { ...w, selected_teams: teams } : w,
    )
  }

  async function triggerSync(workspaceId: string, fullResync = false) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Non authentifié')

    isSyncing.value = true
    try {
      await $fetch('/api/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { workspaceId, fullResync },
      })
      await fetchWorkspaces()
    }
    finally {
      isSyncing.value = false
    }
  }

  return {
    workspaces: readonly(workspaces),
    isLoading: readonly(isLoading),
    error: readonly(error),
    isSyncing: readonly(isSyncing),
    fetchWorkspaces,
    addWorkspace,
    deleteWorkspace,
    fetchLinearTeams,
    saveTeamSelection,
    triggerSync,
  }
}
