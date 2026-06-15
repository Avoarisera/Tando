export function useNavItems() {
  const route = useRoute()
  const { isAdmin } = useCurrentUser()

  const navItems = computed(() => {
    if (isAdmin.value) {
      return [
        { label: 'Tableau de bord',   to: '/dashboard' },
        { label: 'Profil',            to: '/profile' },
        { label: 'Demandes de congé', to: '/leave-requests' },
        { label: 'Calendrier',        to: '/calendar' },
        { label: 'Types de congé',    to: '/leave-types' },
        { label: 'Factures',          to: '/invoices' }
      ]
    }
    return [
      { label: 'Profil',            to: '/profile' },
      { label: 'Demandes de congé', to: '/leave-requests' },
      { label: 'Calendrier',        to: '/calendar' },
    ]
  })

  const isActive = (path: string) => route.path === path

  return { navItems, isActive }
}
