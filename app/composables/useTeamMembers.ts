import type { Profile } from '~/types/index'

export type TeamMember = Pick<Profile, 'id' | 'first_name' | 'last_name' | 'role' | 'team_id'>

/**
 * People visible to the signed-in user (RLS: own team for employees and
 * managers, everyone for admins), sorted by name.
 */
export function useTeamMembers() {
  const supabase = useSupabaseClient()
  const members = useState<TeamMember[]>('team-members', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchMembers() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role, team_id')
        .order('first_name')
      if (sbError) throw sbError
      members.value = (data ?? []) as TeamMember[]
    }
    catch (e) {
      error.value = errorMessage(e)
    }
    finally {
      isLoading.value = false
    }
  }

  return { members: readonly(members), isLoading: readonly(isLoading), error: readonly(error), fetchMembers }
}

export const fullName = (p: Pick<Profile, 'first_name' | 'last_name'>) => `${p.first_name} ${p.last_name}`.trim()
