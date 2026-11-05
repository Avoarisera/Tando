export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  const publicRoutes = ['/login', '/forgot-password', '/reset-password']

  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo('/login')
  }

  if (user.value && to.path === '/login') {
    const { isAdmin, loadProfile } = useCurrentUser()
    await loadProfile()
    return navigateTo(isAdmin.value ? '/dashboard' : '/')
  }
})
