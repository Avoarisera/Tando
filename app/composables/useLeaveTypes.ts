import type { LeaveType } from '~/types/index'

export function useLeaveTypes() {
  const supabase = useSupabaseClient()
  const leaveTypes = useState<LeaveType[]>('leave-types', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLeaveTypes(activeOnly = true) {
    isLoading.value = true
    error.value = null
    try {
      let query = supabase
        .from('leave_types')
        .select('*')
        .order('name', { ascending: true })
      if (activeOnly) query = query.eq('is_active', true)
      const { data, error: sbError } = await query
      if (sbError) throw sbError
      leaveTypes.value = data ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement des types de congé'
    } finally {
      isLoading.value = false
    }
  }

  async function createLeaveType(name: string, color: string): Promise<void> {
    const currentYear = new Date().getFullYear()
    const { data, error: sbError } = await supabase
      .from('leave_types')
      .insert({ name: name.trim(), color, is_active: true })
      .select('id')
      .single()
    if (sbError) throw sbError
    const { error: rpcError } = await supabase.rpc('upsert_leave_type_balances', {
      p_leave_type_id: data.id,
      p_year: currentYear,
      p_allocated_days: 0,
    })
    if (rpcError) throw rpcError
  }

  async function updateLeaveType(id: string, name: string, color: string) {
    const { error: sbError } = await supabase
      .from('leave_types')
      .update({ name: name.trim(), color })
      .eq('id', id)
    if (sbError) throw sbError
  }

  async function toggleLeaveType(id: string, isActive: boolean) {
    const { error: sbError } = await supabase
      .from('leave_types')
      .update({ is_active: isActive })
      .eq('id', id)
    if (sbError) throw sbError
  }

  return {
    leaveTypes: readonly(leaveTypes),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchLeaveTypes,
    createLeaveType,
    updateLeaveType,
    toggleLeaveType,
  }
}
