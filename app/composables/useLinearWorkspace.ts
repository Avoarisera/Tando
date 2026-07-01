export interface TeamRef { id: string; name: string }

export type SyncStatus = 'idle' | 'running' | 'done' | 'error'

export interface Workspace {
  id: string
  name: string
  last_synced_at: string | null
  created_at: string
  selected_teams: readonly TeamRef[] | null
  sync_status: SyncStatus
  sync_teams_total: number
  sync_teams_done: number
  sync_issues_done: number
  sync_error: string | null
}

const WS_COLUMNS = 'id, name, last_synced_at, created_at, selected_teams, sync_status, sync_teams_total, sync_teams_done, sync_issues_done, sync_error'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function useLinearWorkspace() {
  const supabase = useSupabaseClient()

  const workspaces = useState<Workspace[]>('linear-workspaces', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  function patchLocal(id: string, fields: Partial<Workspace>) {
    workspaces.value = workspaces.value.map(w => w.id === id ? { ...w, ...fields } : w)
  }

  async function fetchWorkspaces() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase
        .from('workspaces')
        .select(WS_COLUMNS)
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
    patchLocal(workspaceId, { selected_teams: teams })
  }

  // Poll the sync status columns until the background job finishes.
  async function pollUntilDone(workspaceId: string): Promise<void> {
    const DEADLINE = Date.now() + 30 * 60 * 1000 // safety cap: 30 min
    while (Date.now() < DEADLINE) {
      await delay(2000)
      const { data } = await supabase
        .from('workspaces')
        .select('sync_status, sync_teams_total, sync_teams_done, sync_issues_done, sync_error, last_synced_at')
        .eq('id', workspaceId)
        .single()
      if (!data) continue

      patchLocal(workspaceId, {
        sync_status: data.sync_status as SyncStatus,
        sync_teams_total: data.sync_teams_total,
        sync_teams_done: data.sync_teams_done,
        sync_issues_done: data.sync_issues_done,
        sync_error: data.sync_error,
        last_synced_at: data.last_synced_at,
      })

      if (data.sync_status === 'done') return
      if (data.sync_status === 'error') {
        throw new Error(data.sync_error || 'Erreur de synchronisation')
      }
    }
    throw new Error('Synchronisation trop longue (timeout côté client)')
  }

  // Kicks the background sync, then polls status. Resolves when done, throws on error.
  async function triggerSync(workspaceId: string, fullResync = false) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Non authentifié')

    // Optimistic: show the bar instantly.
    patchLocal(workspaceId, {
      sync_status: 'running',
      sync_error: null,
      sync_teams_total: 0,
      sync_teams_done: 0,
      sync_issues_done: 0,
    })

    await $fetch('/api/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { workspaceId, fullResync },
    })

    await pollUntilDone(workspaceId)
  }

  return {
    workspaces: readonly(workspaces),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchWorkspaces,
    addWorkspace,
    deleteWorkspace,
    fetchLinearTeams,
    saveTeamSelection,
    triggerSync,
  }
}
