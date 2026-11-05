import type { RouteLocationNormalizedLoaded } from 'vue-router'

export type NavKey =
  | 'home' | 'leaves' | 'calendar' | 'approvals' | 'velocity'
  | 'dashboard' | 'people' | 'rules' | 'invoices' | 'settings' | 'profile'

export interface NavItem { key: NavKey, to: string, icon: string }
export interface NavSection { key: 'me' | 'team' | 'steer' | 'admin', items: NavItem[] }

const ITEMS: Record<NavKey, NavItem> = {
  home:      { key: 'home',      to: '/',               icon: 'house' },
  leaves:    { key: 'leaves',    to: '/leave-requests', icon: 'tree-palm' },
  calendar:  { key: 'calendar',  to: '/calendar',       icon: 'calendar-days' },
  approvals: { key: 'approvals', to: '/approvals',      icon: 'circle-check-big' },
  velocity:  { key: 'velocity',  to: '/velocite',       icon: 'gauge' },
  dashboard: { key: 'dashboard', to: '/dashboard',      icon: 'layout-dashboard' },
  people:    { key: 'people',    to: '/people',         icon: 'users' },
  rules:     { key: 'rules',     to: '/leave-types',    icon: 'sliders-horizontal' },
  invoices:  { key: 'invoices',  to: '/invoices',       icon: 'receipt-text' },
  settings:  { key: 'settings',  to: '/settings',       icon: 'settings' },
  profile:   { key: 'profile',   to: '/profile',        icon: 'circle-user-round' },
}

type Role = 'employee' | 'manager' | 'admin'

// Menu per role, from the design handoff (shell.jsx). Vélocité stays admin-only:
// the Linear tables are only readable by admins (RLS), so it is not offered to managers.
const NAV: Record<Role, [NavSection['key'], NavKey[]][]> = {
  employee: [['me', ['home', 'leaves']], ['team', ['calendar']]],
  manager:  [['me', ['home', 'leaves']], ['team', ['calendar', 'approvals']]],
  admin:    [['team', ['calendar', 'approvals']], ['steer', ['dashboard', 'velocity']], ['admin', ['people', 'rules', 'invoices', 'settings']]],
}

/** Pages not built yet: hidden from the menu until their lot ships. */
const HIDDEN = new Set<NavKey>(['settings'])

export function navSectionsFor(role: Role): NavSection[] {
  return NAV[role]
    .map(([key, keys]) => ({ key, items: keys.filter(k => !HIDDEN.has(k)).map(k => ITEMS[k]) }))
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
  const sections = computed(() => navSectionsFor(role.value))
  const tabItems = computed(() => [ITEMS.home, ITEMS.leaves, ITEMS.calendar, ITEMS.profile])
  const isActive = (item: NavItem) => isNavActive(item, route)

  return { role, sections, tabItems, isActive }
}
