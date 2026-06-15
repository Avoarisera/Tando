import type { LeaveRequest, LeaveRequestWithRelations, Profile } from '~/types/index'

export function useLeaveRequests() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const profile = useState<Profile | null>('current-profile')
  const requests = useState<LeaveRequestWithRelations[]>('leave-requests', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchRequests() {
    isLoading.value = true
    error.value = null
    try {

      // The RLS policy "leave_requests_select_employee_team_approved" (added for
      // the calendar view) also exposes approved team requests to employees.
      // /leave-requests must only show the employee's own requests, so we add an
      // explicit filter here rather than relying on RLS alone.
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          leave_types (id, name, color),
          profiles!user_id (id, first_name, last_name, team_id,
            teams (name)
          )
        `)
        .order('created_at', { ascending: false })

      if (profile.value?.role === 'employee') {
        let userId = user.value?.id
        if (!userId) {
          const { data } = await supabase.auth.getUser()
          userId = data.user?.id
        }
        if (userId) query = query.eq('user_id', userId)
      }

      const { data, error: sbError } = await query
      if (sbError) throw sbError
      requests.value = (data ?? []) as LeaveRequestWithRelations[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement des demandes'
    } finally {
      isLoading.value = false
    }
  }

  async function createRequest(params: {
    leaveTypeId: string
    startDate: string
    endDate: string
    comment: string | null
  }) {
    const { data, error: sbError } = await supabase.rpc('create_leave_request', {
      p_leave_type_id: params.leaveTypeId,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
      p_comment: params.comment ?? undefined,
    })
    if (sbError) throw new Error(sbError.message)
    return data as string
  }

  async function updateRequestStatus(
    requestId: string,
    update: Partial<Pick<LeaveRequest,
      'status' | 'manager_reviewed_by' | 'manager_reviewed_at' | 'admin_reviewed_by' | 'admin_reviewed_at'
    >>
  ) {
    const { error: sbError } = await supabase
      .from('leave_requests')
      .update(update)
      .eq('id', requestId)
    if (sbError) throw new Error(sbError.message)
  }

  return {
    requests: readonly(requests),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchRequests,
    createRequest,
    updateRequestStatus,
  }
}
