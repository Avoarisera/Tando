import type { Profile } from '~/types/index'

export function useCurrentUser() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const profile = useState<Profile | null>('current-profile', () => null)

  async function loadProfile() {
    if (profile.value) return
    let userId = user.value?.id
    if (!userId) {
      const { data } = await supabase.auth.getUser()
      userId = data.user?.id
    }
    if (!userId) return
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) throw error
    profile.value = data as Profile
  }

  async function signOut() {
    await supabase.auth.signOut()
    useState('current-profile').value = null
    useState('leave-requests').value = []
    useState('leave-balances').value = []
    useState('leave-types').value = []
    useState('calendar-events').value = []
    useState('teams').value = []
    useState('toasts').value = []
    await navigateTo('/login')
  }

  const isAdmin    = computed(() => profile.value?.role === 'admin')
  const isManager  = computed(() => profile.value?.role === 'manager')
  const isEmployee = computed(() => profile.value?.role === 'employee')

  return {
    user,
    profile: readonly(profile),
    isAdmin,
    isManager,
    isEmployee,
    loadProfile,
    signOut,
  }
}
