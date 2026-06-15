import type { CalendarEvent, LeaveStatus } from '~/types/index'

interface RawCalendarRow {
  id: string
  user_id: string
  start_date: string
  end_date: string
  status: string
  leave_types: { name: string; color: string } | null
  profiles: {
    id: string
    first_name: string
    last_name: string
    teams: { id: string; name: string } | null
  } | null
}

export function useCalendar() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const events = useState<CalendarEvent[]>('calendar-events', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchEvents() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase
        .from('leave_requests')
        .select(`
          id, user_id, start_date, end_date, status,
          leave_types (name, color),
          profiles!user_id (id, first_name, last_name,
            teams (id, name)
          )
        `)
        .order('start_date', { ascending: true })

      if (sbError) throw sbError

      const rows = (data ?? []) as unknown as RawCalendarRow[]
      const currentUserId = user.value?.id

      events.value = rows
        .filter(r =>
          r.user_id === currentUserId || r.status === 'approved',
        )
        .map(r => ({
          id: r.id,
          userId: r.user_id,
          employeeName: r.profiles
            ? `${r.profiles.first_name} ${r.profiles.last_name}`
            : 'Inconnu',
          leaveTypeName: r.leave_types?.name ?? '',
          leaveTypeColor: r.leave_types?.color ?? '#9E9E9E',
          startDate: r.start_date,
          endDate: r.end_date,
          status: r.status as LeaveStatus,
          isOwn: r.user_id === currentUserId,
          teamId: r.profiles?.teams?.id,
          teamName: r.profiles?.teams?.name,
        }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement du calendrier'
    } finally {
      isLoading.value = false
    }
  }

  return {
    events: readonly(events),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchEvents,
  }
}
