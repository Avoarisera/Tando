import type { RouteLocationNormalizedLoaded } from 'vue-router'

export type NavKey =
  | 'home' | 'leaves' | 'calendar' | 'approvals' | 'velocity'
  | 'dashboard' | 'myteam' | 'people' | 'rules' | 'invoices' | 'settings' | 'profile'

export interface NavItem { key: NavKey, to: string, icon: string }
export interface NavSection { key: 'me' | 'team' | 'steer' | 'admin', items: NavItem[] }

const ITEMS: Record<NavKey, NavItem> = {
  home:      { key: 'home',      to: '/',               icon: 'house' },
  leaves:    { key: 'leaves',    to: '/leave-requests', icon: 'tree-palm' },
  calendar:  { key: 'calendar',  to: '/calendar',       icon: 'calendar-days' },
  approvals: { key: 'approvals', to: '/approvals',      icon: 'circle-check-big' },
  velocity:  { key: 'velocity',  to: '/velocite',       icon: 'gauge' },
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
  manager:  [['me', ['home', 'approvals', 'leaves']], ['team', ['myteam', 'calendar']], ['steer', ['velocity']]],
  // admin: the dashboard comes first (feedback 05/11)
  admin:    [['team', ['dashboard', 'calendar', 'approvals']], ['steer', ['velocity']], ['admin', ['people', 'rules', 'invoices', 'settings']]],
}

/** Pages not built yet: hidden from the menu until their lot ships. */
const HIDDEN = new Set<NavKey>([])

export function navSectionsFor(role: Role, opts: { withVelocity?: boolean } = {}): NavSection[] {
  const hidden = (k: NavKey) => HIDDEN.has(k) || (role === 'manager' && k === 'velocity' && !opts.withVelocity)
  return NAV[role]
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
  const sections = computed(() => navSectionsFor(role.value, { withVelocity: velocityTeams.value.length > 0 }))
  const tabItems = computed(() => [ITEMS.home, ITEMS.leaves, ITEMS.calendar, ITEMS.profile])
  const isActive = (item: NavItem) => isNavActive(item, route)

  return { role, sections, tabItems, isActive }
}
