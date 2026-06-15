import type { LeaveBalanceWithType, TeamMemberBalance, AdminBalanceRow } from '~/types/index'

const LEAVE_TYPE_CP_ID = '00000000-0000-0000-0000-000000000020'

export function useLeaveBalances() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const balances = useState<LeaveBalanceWithType[]>('leave-balances', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const teamBalances = useState<TeamMemberBalance[]>('team-balances', () => [])
  const isLoadingTeam = ref(false)
  const teamError = ref<string | null>(null)

  async function fetchBalances() {
    let userId = user.value?.id
    if (!userId) {
      const { data } = await supabase.auth.getUser()
      userId = data.user?.id
    }
    if (!userId) return
    isLoading.value = true
    error.value = null
    try {
      const currentYear = new Date().getFullYear()
      const { data, error: sbError } = await supabase
        .from('leave_balances')
        .select('*, leave_types(id, name, color)')
        .eq('user_id', userId)
        .eq('year', currentYear)
        .order('created_at', { ascending: true })
      if (sbError) throw sbError
      balances.value = (data ?? []) as LeaveBalanceWithType[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement des soldes'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchTeamBalances() {
    isLoadingTeam.value = true
    teamError.value = null
    try {
      const currentYear = new Date().getFullYear()
      // Two parallel queries: team employees (RLS scopes to manager's team) + CP balances
      const [{ data: members, error: membersError }, { data: balanceData, error: balanceError }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('role', 'employee'),
          supabase
            .from('leave_balances')
            .select('user_id, allocated_days, used_days')
            .eq('year', currentYear)
            .eq('leave_type_id', LEAVE_TYPE_CP_ID),
        ])
      if (membersError) throw membersError
      if (balanceError) throw balanceError

      const balanceMap = new Map((balanceData ?? []).map(b => [b.user_id, b]))
      teamBalances.value = (members ?? []).map(member => ({
        user_id: member.id,
        first_name: member.first_name,
        last_name: member.last_name,
        allocated_days: balanceMap.get(member.id)?.allocated_days ?? null,
        used_days: balanceMap.get(member.id)?.used_days ?? null,
      }))
    } catch (e) {
      teamError.value = e instanceof Error ? e.message : 'Erreur lors du chargement des soldes équipe'
    } finally {
      isLoadingTeam.value = false
    }
  }

  const adminBalances = useState<AdminBalanceRow[]>('admin-balances', () => [])
  const isLoadingAdmin = ref(false)
  const adminError = ref<string | null>(null)

  async function fetchAdminBalances(year = new Date().getFullYear()) {
    isLoadingAdmin.value = true
    adminError.value = null
    try {
      const { data, error: sbError } = await supabase
        .from('leave_balances')
        .select(`
          *,
          profiles!user_id (id, first_name, last_name),
          leave_types!leave_type_id (id, name, color)
        `)
        .eq('year', year)
        .order('created_at', { ascending: true })
      if (sbError) throw sbError
      adminBalances.value = (data ?? []) as AdminBalanceRow[]
    } catch (e) {
      adminError.value = e instanceof Error ? e.message : 'Erreur lors du chargement des soldes'
    } finally {
      isLoadingAdmin.value = false
    }
  }

  async function updateAllocatedDays(id: string, days: number): Promise<void> {
    const { error: sbError } = await supabase
      .from('leave_balances')
      .update({ allocated_days: days })
      .eq('id', id)
    if (sbError) throw sbError
  }

  async function upsertTypeBalances(typeId: string, year: number, days: number): Promise<void> {
    const { error: sbError } = await supabase.rpc('upsert_leave_type_balances', {
      p_leave_type_id: typeId,
      p_year: year,
      p_allocated_days: days,
    })
    if (sbError) throw sbError
  }

  return {
    balances: readonly(balances),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchBalances,
    teamBalances: readonly(teamBalances),
    isLoadingTeam: readonly(isLoadingTeam),
    teamError: readonly(teamError),
    fetchTeamBalances,
    adminBalances: readonly(adminBalances),
    isLoadingAdmin: readonly(isLoadingAdmin),
    adminError: readonly(adminError),
    fetchAdminBalances,
    updateAllocatedDays,
    upsertTypeBalances,
  }
}
