import type { RouteLocationNormalizedLoaded } from 'vue-router'

export type NavKey =
  | 'home' | 'leaves' | 'calendar' | 'approvals' | 'velocity'
  | 'dashboard' | 'myteam' | 'recruitment' | 'people' | 'rules' | 'invoices' | 'settings' | 'profile'

export interface NavItem { key: NavKey, to: string, icon: string }
export interface NavSection { key: 'me' | 'team' | 'talent' | 'steer' | 'admin', items: NavItem[] }

const ITEMS: Record<NavKey, NavItem> = {
  home:      { key: 'home',      to: '/',               icon: 'house' },
  leaves:    { key: 'leaves',    to: '/leave-requests', icon: 'tree-palm' },
  calendar:  { key: 'calendar',  to: '/calendar',       icon: 'calendar-days' },
  approvals: { key: 'approvals', to: '/approvals',      icon: 'circle-check-big' },
  velocity:  { key: 'velocity',  to: '/velocite',       icon: 'gauge' },
  recruitment: { key: 'recruitment', to: '/recrutement', icon: 'user-plus' },
  dashboard: { key: 'dashboard', to: '/dashboard',      icon: 'layout-dashboard' },
  // manager: the dashboard of their own team (TND-26)
  myteam:    { key: 'myteam',    to: '/dashboard',      icon: 'users' },
  people:    { key: 'people',    to: '/people',         icon: 'users' },
  rules:     { key: 'rules',     to: '/leave-types',    icon: 'sliders-horizontal' },
  invoices:  { key: 'invoices',  to: '/invoices',       icon: 'receipt-text' },
  settings:  { key: 'settings',  to: '/settings',       icon: 'settings' },
  profile:   { key: 'profile',   to: '/profile',        icon: 'circle-user-round' },
}

type Role = 'employee' | 'manager' | 'admin'

// Menu per role, from the design handoff (shell.jsx). Managers get Vélocité only
// when their team is linked to Linear teams (TND-26, `withVelocity`).
const NAV: Record<Role, [NavSection['key'], NavKey[]][]> = {
  employee: [['me', ['home', 'leaves']], ['team', ['calendar']]],
  // manager: « À valider » right after the home page (TND-25)
  manager:  [['me', ['home', 'approvals', 'leaves']], ['team', ['myteam', 'calendar']], ['talent', ['recruitment']], ['steer', ['velocity']]],
  // admin: the dashboard comes first (feedback 05/11)
  admin:    [['team', ['dashboard', 'calendar', 'approvals']], ['talent', ['recruitment']], ['steer', ['velocity']], ['admin', ['people', 'rules', 'invoices', 'settings']]],
}

/** Pages not built yet: hidden from the menu until their lot ships. */
const HIDDEN = new Set<NavKey>([])

export function navSectionsFor(role: Role, opts: { withVelocity?: boolean, recruiter?: boolean, hiringManager?: boolean } = {}): NavSection[] {
  const hidden = (k: NavKey) => HIDDEN.has(k)
    || (role === 'manager' && k === 'velocity' && !opts.withVelocity)
    // recruitment: admins, HR access, or a manager who recruits on an opening (TND-30)
    || (k === 'recruitment' && role !== 'admin' && !opts.recruiter && !opts.hiringManager)
  // HR access on an employee or manager: the Talents section is added to their own menu
  const base = NAV[role].some(([key]) => key === 'talent') || !(opts.recruiter || opts.hiringManager) ? NAV[role] : [...NAV[role], ['talent', ['recruitment']] as [NavSection['key'], NavKey[]]]
  return base
    .map(([key, keys]) => ({ key, items: keys.filter(k => !hidden(k)).map(k => ITEMS[k]) }))
    .filter(s => s.items.length > 0)
}

export function isNavActive(item: NavItem, route: Pick<RouteLocationNormalizedLoaded, 'path'>): boolean {
  if (item.to === '/') return route.path === '/'
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

export function useNavItems() {
  const route = useRoute()
  const { profile } = useCurrentUser()

  const role = computed<Role>(() => (profile.value?.role as Role | undefined) ?? 'employee')
  const { velocityTeams, velocityLoaded, fetchVelocityTeams } = useVelocityTeams()
  // a manager's Vélocité entry depends on the team links: loaded once, quietly
  if (import.meta.client) {
    watch(role, (r) => { if (r === 'manager' && !velocityLoaded.value) fetchVelocityTeams().catch(() => undefined) }, { immediate: true })
  }
  // Recrutement also shows for a hiring manager, and for anyone invited to an interview
  const supabase = useSupabaseClient()
  const hiringManager = useState<boolean>('nav-hiring-manager', () => false)
  if (import.meta.client) {
    watch(() => profile.value?.id, async (id) => {
      if (!id || role.value === 'admin') return
      const [{ count: openings }, { count: interviews }] = await Promise.all([
        supabase.from('job_openings').select('id', { count: 'exact', head: true }).eq('hiring_manager_id', id),
        supabase.from('interview_participants').select('interview_id', { count: 'exact', head: true }).eq('profile_id', id),
      ])
      hiringManager.value = (openings ?? 0) + (interviews ?? 0) > 0
    }, { immediate: true })
  }
  const recruiter = computed(() => role.value === 'admin' || profile.value?.is_hr === true)
  const sections = computed(() => navSectionsFor(role.value, { withVelocity: velocityTeams.value.length > 0, recruiter: recruiter.value, hiringManager: hiringManager.value }))
  const tabItems = computed(() => [ITEMS.home, ITEMS.leaves, ITEMS.calendar, ITEMS.profile])
  const isActive = (item: NavItem) => isNavActive(item, route)

  return { role, sections, tabItems, isActive }
}
