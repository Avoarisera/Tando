export interface VelocityTeam { workspace_id: string, workspace_name: string, team_id: string, team_name: string | null }

/**
 * TND-26 — Linear teams the signed-in user can open in Vélocité: every (selected)
 * team for an admin, the teams linked to their WakaBods team for a manager.
 */
export function useVelocityTeams() {
  const supabase = useSupabaseClient()
  const teams = useState<VelocityTeam[]>('velocity-teams', () => [])
  const loaded = useState<boolean>('velocity-teams-loaded', () => false)

  async function fetchVelocityTeams(force = false) {
    if (loaded.value && !force) return teams.value
    const { data, error } = await supabase.rpc('velocity_teams')
    if (error) throw new Error(errorMessage(error))
    teams.value = (data ?? []) as VelocityTeam[]
    loaded.value = true
    return teams.value
  }

  return { velocityTeams: readonly(teams), velocityLoaded: readonly(loaded), fetchVelocityTeams }
}
