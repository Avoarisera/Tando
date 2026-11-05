import type { LeaveRequestWithRelations, LeaveStatus, UserRole } from '~/types/index'

interface BalanceLite { user_id: string, leave_type_id: string, allocated_days: number, used_days: number }

/** Can this role act on a request in this status? Mirrors review_leave_request. */
export function canReview(role: UserRole | undefined, status: LeaveStatus, requesterId: string, meId: string | undefined): boolean {
  if (requesterId === meId) return false
  if (role === 'manager') return status === 'pending'
  if (role === 'admin') return status === 'pending' || status === 'manager_approved'
  return false
}

/**
 * Requests the signed-in manager or admin can see (RLS: own team, or everyone),
 * with the balances needed to show the impact of a decision.
 */
export function useApprovals() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const { profile } = useCurrentUser()
  const { reviewRequest } = useLeaveRequests()
  const requests = useState<LeaveRequestWithRelations[]>('approval-requests', () => [])
  const balances = useState<BalanceLite[]>('approval-balances', () => [])
  const loaded = useState<boolean>('approval-loaded', () => false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const meId = computed(() => user.value?.sub as string | undefined)
  const role = computed(() => profile.value?.role)

  async function fetchAll() {
    isLoading.value = true
    error.value = null
    try {
      const year = new Date().getFullYear()
      const [{ data: reqs, error: e1 }, { data: bals, error: e2 }] = await Promise.all([
        supabase
          .from('leave_requests')
          .select('*, leave_types (id, name, color), profiles!user_id (id, first_name, last_name, team_id, teams (name))')
          .order('start_date', { ascending: true }),
        supabase
          .from('leave_balances')
          .select('user_id, leave_type_id, allocated_days, used_days')
          .eq('year', year),
      ])
      if (e1) throw e1
      if (e2) throw e2
      requests.value = (reqs ?? []) as LeaveRequestWithRelations[]
      balances.value = (bals ?? []) as BalanceLite[]
      loaded.value = true
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
    finally {
      isLoading.value = false
    }
  }

  const toReview = computed(() => requests.value.filter(r => canReview(role.value, r.status, r.user_id, meId.value)))
  const reviewed = computed(() => requests.value
    .filter(r => r.user_id !== meId.value && !canReview(role.value, r.status, r.user_id, meId.value) && r.status !== 'pending')
    .sort((a, b) => (b.admin_reviewed_at ?? b.manager_reviewed_at ?? '').localeCompare(a.admin_reviewed_at ?? a.manager_reviewed_at ?? '')))

  /** Remaining days of the requester if this request is approved (pending ones reserved) */
  function balanceAfter(r: LeaveRequestWithRelations): number | null {
    const b = balances.value.find(x => x.user_id === r.user_id && x.leave_type_id === r.leave_type_id)
    if (!b) return null
    const year = Number(r.start_date.slice(0, 4))
    const reserved = reservedDays(requests.value.filter(x => x.user_id === r.user_id), r.leave_type_id, year)
    return b.allocated_days - b.used_days - reserved
  }

  async function decide(id: string, decision: 'approve' | 'reject') {
    const status = await reviewRequest(id, decision)
    const r = requests.value.find(x => x.id === id)
    if (r) {
      const now = new Date().toISOString()
      const patch = role.value === 'admin' ? { admin_reviewed_at: now } : { manager_reviewed_at: now }
      requests.value = requests.value.map(x => (x.id === id ? { ...x, ...patch, status } : x))
    }
    return status
  }

  return { requests: readonly(requests), loaded: readonly(loaded), isLoading: readonly(isLoading), error: readonly(error), toReview, reviewed, fetchAll, balanceAfter, decide, meId }
}
