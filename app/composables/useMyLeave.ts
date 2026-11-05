import type { LeaveRequestWithRelations, LeaveStatus, UserRole } from '~/types/index'
import type { WbStep } from '~/components/wb/WbStepper.vue'

/**
 * The signed-in user's own leave requests (every role), kept apart from the
 * team requests used by the approval pages.
 */
export function useMyLeave() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const requests = useState<LeaveRequestWithRelations[]>('my-leave-requests', () => [])
  const loaded = useState<boolean>('my-leave-requests-loaded', () => false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchMine() {
    isLoading.value = true
    error.value = null
    try {
      let userId = user.value?.sub as string | undefined
      if (!userId) {
        const { data } = await supabase.auth.getUser()
        userId = data.user?.id
      }
      if (!userId) return
      const { data, error: sbError } = await supabase
        .from('leave_requests')
        .select('*, leave_types (id, name, color), profiles!user_id (id, first_name, last_name, team_id, teams (name))')
        .eq('user_id', userId)
        .order('start_date', { ascending: false })
      if (sbError) throw sbError
      requests.value = (data ?? []) as LeaveRequestWithRelations[]
      loaded.value = true
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
    finally {
      isLoading.value = false
    }
  }

  return { requests: readonly(requests), loaded: readonly(loaded), isLoading: readonly(isLoading), error: readonly(error), fetchMine }
}

export type LeaveGroup = 'upcoming' | 'pending' | 'past' | 'refused'

/** Which tab of "Mes congés" a request belongs to */
export function leaveGroup(r: Pick<LeaveRequestWithRelations, 'status' | 'end_date'>, today: string): LeaveGroup {
  if (r.status === 'rejected') return 'refused'
  if (r.status === 'pending' || r.status === 'manager_approved') return 'pending'
  return r.end_date < today ? 'past' : 'upcoming'
}

/** Pending days of a type in a given year: reserved on the balance, as the RPC does */
export function reservedDays(requests: readonly Pick<LeaveRequestWithRelations, 'status' | 'leave_type_id' | 'start_date' | 'days_count'>[], typeId: string, year: number): number {
  return requests
    .filter(r => r.leave_type_id === typeId && (r.status === 'pending' || r.status === 'manager_approved') && Number(r.start_date.slice(0, 4)) === year)
    .reduce((s, r) => s + r.days_count, 0)
}

export function formatPeriod(start: string, end: string, locale: string): string {
  const f = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return start === end ? f.format(parseIso(start)) : f.formatRange(parseIso(start), parseIso(end))
}

/**
 * Validation steps of a request. An employee's request goes manager → admin;
 * a manager's request goes straight to the admin; an admin can decide alone.
 */
export function leaveSteps(
  r: Pick<LeaveRequestWithRelations, 'status' | 'created_at' | 'manager_reviewed_at' | 'admin_reviewed_at'>,
  requesterRole: UserRole,
  labels: { sent: string, manager: string, admin: string },
  fmt: (iso: string) => string,
): WbStep[] {
  const status: LeaveStatus = r.status
  const steps: WbStep[] = [{ label: labels.sent, state: 'done', date: fmt(r.created_at) }]
  const managerStep = requesterRole === 'employee' && !(r.admin_reviewed_at && !r.manager_reviewed_at)
  if (managerStep) {
    if (r.manager_reviewed_at) {
      const refusedHere = status === 'rejected' && !r.admin_reviewed_at
      steps.push({ label: labels.manager, state: refusedHere ? 'refused' : 'done', date: fmt(r.manager_reviewed_at) })
    }
    else {
      steps.push({ label: labels.manager, state: status === 'pending' ? 'wait' : 'todo' })
    }
  }
  if (r.admin_reviewed_at) {
    steps.push({ label: labels.admin, state: status === 'rejected' ? 'refused' : 'done', date: fmt(r.admin_reviewed_at) })
  }
  else if (status === 'rejected') {
    steps.push({ label: labels.admin, state: 'todo' })
  }
  else {
    const waiting = status === 'manager_approved' || (status === 'pending' && !managerStep)
    steps.push({ label: labels.admin, state: waiting ? 'wait' : 'todo' })
  }
  return steps
}
