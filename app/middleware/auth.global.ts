export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  const publicRoutes = ['/login']

  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo('/login')
  }

  if (user.value && (to.path === '/login' || to.path === '/')) {
    const { isAdmin, loadProfile } = useCurrentUser()
    await loadProfile()
    return navigateTo(isAdmin.value ? '/dashboard' : '/profile')
  }
})
