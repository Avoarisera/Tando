export function useNavItems() {
  const route = useRoute()
  const { isAdmin } = useCurrentUser()

  const navItems = computed(() => {
    const base = [
      { label: 'Profil',            to: '/profile' },
      { label: 'Demandes de congé', to: '/leave-requests' },
      { label: 'Calendrier',        to: '/calendar' },
    ]
    if (isAdmin.value) {
      base.push({ label: 'Vélocité Dev',  to: '/velocite' })
      base.push({ label: 'Types de congé', to: '/leave-types' })
    }
    return base
  })

  const isActive = (path: string) =>
    path === '/velocite' ? route.path.startsWith('/velocite') : route.path === path

  return { navItems, isActive }
}
