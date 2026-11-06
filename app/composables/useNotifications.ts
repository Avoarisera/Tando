export type NotificationKind =
  | 'request_submitted' | 'manager_approved' | 'approved' | 'rejected'
  | 'cancel_requested' | 'cancel_approved' | 'cancel_refused'
  | 'application_received' | 'interview_scheduled' | 'review_requested' | 'review_shared'
  | 'review_peers_proposed' | 'review_peer_requested' | 'review_reminder' | 'review_ep_due'

export interface AppNotification {
  id: string
  kind: NotificationKind
  request_id: string | null
  data: { first_name?: string, last_name?: string, type?: string, start_date?: string, end_date?: string, days?: number, comment?: string | null, job?: string, opening_id?: string, application_id?: string, starts_at?: string, cycle?: string, packet_id?: string, role?: string, who?: string, count?: number }
  read_at: string | null
  created_at: string
}

/**
 * In-app notifications of the signed-in user (RLS: own rows only). Written by
 * the notify_leave_event trigger; marked read through mark_notifications_read.
 */
export function useNotifications() {
  const supabase = useSupabaseClient()
  const items = useState<AppNotification[]>('notifications', () => [])
  const error = ref<string | null>(null)

  async function refresh() {
    const { data, error: e } = await supabase
      .from('notifications')
      .select('id, kind, request_id, data, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    if (e) {
      error.value = e.message
      return
    }
    error.value = null
    items.value = (data ?? []) as unknown as AppNotification[]
  }

  async function markRead(ids?: string[]) {
    const now = new Date().toISOString()
    items.value = items.value.map(n => (!n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: now } : n))
    await supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {})
  }

  const unread = computed(() => items.value.filter(n => !n.read_at).length)

  /** Refresh on mount, when the tab comes back, and every 60 s while visible */
  function startPolling() {
    let timer: ReturnType<typeof setInterval> | null = null
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    onMounted(() => {
      refresh()
      timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 60_000)
      window.addEventListener('focus', refresh)
      document.addEventListener('visibilitychange', onVisible)
    })
    onBeforeUnmount(() => {
      if (timer) clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    })
  }

  return { items: readonly(items), unread, error: readonly(error), refresh, markRead, startPolling }
}
